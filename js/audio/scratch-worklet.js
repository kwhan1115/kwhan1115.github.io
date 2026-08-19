// The scratch DSP. A record's audio position is a function of how far it has
// turned, so this reads a decoded buffer with a fractional read head whose step
// can be negative — which is what makes dragging the record backwards sound
// like dragging a record backwards.
//
// Neither <audio>.playbackRate nor AudioBufferSourceNode.playbackRate can go
// negative (the first is unimplemented everywhere, the second outputs silence),
// so the sample loop has to be ours.
//
// The processor lives in a string because an AudioWorklet scope cannot import
// ES modules. The browser makes a Blob URL of it for addModule(); the test
// evaluates the same text against stub globals. One source of truth either way.

export const PROCESSOR_NAME = "scratch";

export const WORKLET_SOURCE = String.raw`
const S = 1 / 32768;   // Int16 -> float

class ScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = null;
    this.right = null;
    this.len = 0;

    this.cur = 0;        // fractional read head, in samples. NEVER wrapped —
                         // read() wraps, so cur stays comparable to target.
    this.target = 0;     // where the record says the head should be
    this.prevRate = 0;
    this.gate = 0;       // smoothed gain, kills the thump at a standstill
    this.gain = 1;

    this.nominal = 0;    // rate implied by the target stream (feedforward)
    this.have = false;
    this.lastAt = 0;     // audio time of the last target message
    this.lastFrame = 0;  // this worklet's own clock at that message
    this.frames = 0;

    this.chase = 6000;   // gentle: the chase only trims residual error
    this.maxRate = 8;

    this.acc = 0;
    this.sum = 0;

    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "buffer") {
        this.left = m.left;
        this.right = m.right || m.left;   // a mono source plays down both sides
        this.len = m.left.length;
      } else if (m.type === "target") {
        // The page reports where the head should be, once per animation frame.
        // The rate that implies is the feedforward term. Deriving it from audio
        // time rather than from block counts is what keeps animation-frame
        // jitter out of the pitch.
        const dt = m.at - this.lastAt;
        if (this.have && dt > 0) {
          const raw = (m.pos - this.target) / (dt * sampleRate);
          this.nominal += (raw - this.nominal) * 0.35;
        }
        this.target = m.pos;
        this.lastAt = m.at;
        this.lastFrame = this.frames;
        this.have = true;
      } else if (m.type === "reset") {
        this.cur = m.pos;
        this.target = m.pos;
        this.prevRate = 0;
        this.nominal = 0;
        this.lastFrame = this.frames;
        this.have = false;    // the next target only sets the anchor, not a rate
      } else if (m.type === "gain") {
        this.gain = m.value;
      }
    };
  }

  // Catmull-Rom through the four samples around pos. Linear interpolation
  // aliases audibly once a scratch sweeps the rate across an octave or two.
  read(d, pos) {
    const n = this.len;
    const i = Math.floor(pos);
    const f = pos - i;
    const y0 = d[(((i - 1) % n) + n) % n] * S;
    const y1 = d[((i % n) + n) % n] * S;
    const y2 = d[(((i + 1) % n) + n) % n] * S;
    const y3 = d[(((i + 2) % n) + n) % n] * S;
    const a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
    const a1 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const a2 = -0.5 * y0 + 0.5 * y2;
    return ((a0 * f + a1) * f + a2) * f + y1;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const l = out[0];
    const r = out.length > 1 ? out[1] : null;
    const n = l.length;

    if (!this.left) {
      l.fill(0);
      if (r) r.fill(0);
      this.frames += n;
      return true;
    }

    // Feedforward plus a slow correction. The nominal rate carries the pitch,
    // so a direction change lands within one frame; the chase only closes the
    // error that is left, slowly enough to stay inaudible. That combination is
    // what keeps the position exact over a long scratch without flutter.
    const ahead = this.frames - this.lastFrame;
    const projected = this.target + this.nominal * ahead;
    let want = this.nominal + (projected - this.cur) / this.chase;
    if (!Number.isFinite(want)) want = 0;
    if (want > this.maxRate) want = this.maxRate;
    if (want < -this.maxRate) want = -this.maxRate;

    // Slew the rate across the block. Stepping it once per block is what makes
    // hand-rolled scratch code click at every 128-sample boundary.
    const r0 = this.prevRate;
    const dr = (want - r0) / n;

    let sum = 0;
    for (let i = 0; i < n; i++) {
      const rate = r0 + dr * i;
      // A record barely moving is silent, not a DC thump.
      const a = Math.min(1, Math.abs(rate) / 0.02);
      this.gate += (a - this.gate) * 0.02;
      const g = this.gate * this.gain;
      const sl = this.read(this.left, this.cur) * g;
      l[i] = sl;
      if (r) r[i] = this.read(this.right, this.cur) * g;
      sum += sl * sl;
      this.cur += rate;
    }
    this.prevRate = want;
    this.frames += n;

    // Telemetry: the page cannot hear itself, so the tests measure this.
    this.sum += sum;
    this.acc += n;
    if (this.acc >= 2400) {
      this.port.postMessage({
        type: "pos",
        cur: this.cur,
        rate: want,
        rms: Math.sqrt(this.sum / this.acc),
      });
      this.acc = 0;
      this.sum = 0;
    }
    return true;
  }
}
registerProcessor("scratch", ScratchProcessor);
`;
