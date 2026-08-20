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
    this.pendingSnap = false;   // true for a short window after a reset; see
                                 // the target handler below for what it does
                                 // and process() for why it is time-bounded
                                 // rather than tied to any message signal.
    this.snapUntilFrame = 0;    // this.frames value at which pendingSnap
                                 // expires — set on every reset.
    this.lastFrame = 0;  // this worklet's own clock at the last target message
    this.frames = 0;

    this.chase = 50000;  // gentle: the chase only trims residual error. Raised
                          // from 25000 (task-10 fix report, 60Hz addendum): the
                          // sawtooth ripple this term leaves behind scales with
                          // animation-frame period, and this machine's fast
                          // (~7.7ms) rAF cadence was hiding a worse case at an
                          // ordinary 60Hz (16.7ms) frame. Calibrated against a
                          // real measurement (~8% off theory), 50000 predicts
                          // ~0.016 spread at 60Hz — under the 0.02 bar with
                          // margin, not landing on the line. The feedforward
                          // nominal still carries the pitch and still responds
                          // within one animation frame regardless of chase, so
                          // this costs scratch responsiveness nothing measurable
                          // (direction reversal and round-trip position both
                          // still pass with margin; post-scratch pitch settles
                          // back under the 0.02 bar in ~32ms, well below any
                          // audible threshold).
    this.maxRate = 8;

    // How long a reset stays in snap mode before the ordinary chase takes
    // over. This has to be real elapsed TIME (worklet frames), not "wait for
    // the first target" or "wait for the first rendered block with a real
    // buffer" — both were tried and both measured broken in a real browser.
    // "First target" leaves later messages in the same startup burst
    // unsnapped (see the target handler's comment). "First block with a
    // real buffer" is worse than a no-op: deck-audio.js always posts the
    // "buffer" message before "reset" (see load()), so this.left is
    // already truthy by the moment "reset" itself runs — a browser trace
    // confirmed process() clears that gate on its very first tick after
    // reset, before a single target had been snapped (0 snaps logged, vs.
    // the 7+ that a real needle-drop actually needs). 300ms is ~9x the
    // ~34ms/1518-sample gap this bug was originally measured at, so it
    // comfortably covers a slow or loaded startup, while staying far too
    // short to ever overlap ordinary mid-track scratching, which only a
    // fresh reset (a new track, or dragging the record) can trigger anyway.
    this.SNAP_WINDOW = 13230;  // 300ms at 44100Hz

    this.acc = 0;
    this.sum = 0;

    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "buffer") {
        this.left = m.left;
        this.right = m.right || m.left;   // a mono source plays down both sides
        this.len = m.left.length;
      } else if (m.type === "target") {
        // The page reports where the head should be, once per animation frame,
        // and now also the feedforward rate it computed for that report from
        // its own performance.now() clock. This worklet used to derive that
        // rate itself from ctx.currentTime deltas, but ctx.currentTime is
        // quantised to whole render quanta and routinely does not advance
        // between two consecutive animation frames — which turned one frame's
        // worth of travel into a spike the instant the clock caught up. A
        // light EMA still damps performance.now()'s own sampling jitter
        // without erasing genuine frame-to-frame variation in rate: Δpos/Δt
        // over the TRUE interval is correct even when intervals differ, so
        // there is nothing left here to smooth away except noise.
        if (this.pendingSnap && this.frames < this.snapUntilFrame) {
          // A reset means "drop the needle here" — there is nothing yet to
          // converge toward, so any gap between this pos and cur is purely
          // an artifact of message timing, not the head falling behind.
          // Chasing it the ordinary way was an audible pitch glide on every
          // track change. A real browser trace showed WHY snapping only the
          // first post-reset target isn't enough: "reset" and the first
          // handful of "target" messages can be delivered to this worklet
          // as one back-to-back batch (measured 7 targets arriving before
          // this worklet's clock had advanced a single sample past the
          // reset) — an artifact of however the browser happened to
          // schedule the audio thread against the main thread that
          // particular run, not something the page controls. Snapping only
          // the first of that batch leaves the rest to fall through to the
          // ordinary EMA/chase path below with cur still pinned at the
          // first snap's position, recreating the exact gap this exists to
          // close. So keep snapping on EVERY target for the whole window,
          // not just the first. Adopting each message's own rate too
          // (rather than leaving the reset's seed to decay toward it via
          // the EMA below) means playback starts at speed immediately
          // instead of ramping up to it.
          this.cur = m.pos;
          if (Number.isFinite(m.rate)) {
            this.nominal = m.rate;
            this.prevRate = m.rate;
          }
        } else {
          this.pendingSnap = false;
          if (Number.isFinite(m.rate)) {
            this.nominal += (m.rate - this.nominal) * 0.35;
          }
        }
        this.target = m.pos;
        this.lastFrame = this.frames;
        this.have = true;
      } else if (m.type === "reset") {
        this.cur = m.pos;
        this.target = m.pos;
        // The caller knows the record's current spin and seeds it here, so
        // playback starts at roughly the right pitch immediately instead of
        // climbing to it from a cold 0 over the next several target
        // messages — audible as a track starting too fast or too slow and
        // then settling. An absent or non-finite seed falls back to the old
        // silent-start behaviour (0), never to NaN.
        const seed = Number.isFinite(m.rate) ? m.rate : 0;
        this.prevRate = seed;
        this.nominal = seed;
        this.lastFrame = this.frames;
        this.have = false;
        this.pendingSnap = true;
        this.snapUntilFrame = this.frames + this.SNAP_WINDOW;
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

    // pendingSnap's own expiry (frames vs snapUntilFrame, set on reset) is
    // checked in the target handler above — nothing to do here. A render
    // tick needs no say in when snapping stops: unlike this.left (already
    // true the instant a reset lands, because deck-audio.js always posts
    // "buffer" before "reset"), whether process() has run yet carries no
    // information about whether the head has actually been anchored to a
    // real target.

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
