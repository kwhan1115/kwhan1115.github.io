import { test } from "node:test";
import assert from "node:assert/strict";
import { WORKLET_SOURCE, PROCESSOR_NAME } from "./scratch-worklet.js";
import { MAX_RATE } from "./groove.js";

const BLOCK = 128;
const SR = 44100;
const LEN = SR;              // one second of source

// Run the real processor source under the two globals an AudioWorklet scope
// provides, so the code under test is the code that ships.
function makeProcessor() {
  let Ctor = null;
  class AudioWorkletProcessor {
    constructor() {
      this.port = {
        onmessage: null,
        postMessage: () => {},
        send(m) { this.onmessage?.({ data: m }); },
      };
    }
  }
  new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", WORKLET_SOURCE)(
    AudioWorkletProcessor,
    (name, cls) => { assert.equal(name, PROCESSOR_NAME); Ctor = cls; },
    SR,
  );
  assert.ok(Ctor, "processor registered");
  return new Ctor();
}

// Two incommensurate sines, so a stretch read backwards cannot be mistaken for
// the same stretch read forwards.
function signal(len, phase = 0) {
  const d = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const v = 0.6 * Math.sin(i * 0.011 + phase) + 0.3 * Math.sin(i * 0.0374 + phase);
    d[i] = Math.round(v * 32767);
  }
  return d;
}

// Independent reference for the interpolation, so the test checks the DSP
// rather than quoting it.
function refRead(d, pos) {
  const n = d.length;
  const i = Math.floor(pos);
  const f = pos - i;
  const at = (k) => d[((k % n) + n) % n] / 32768;
  const y0 = at(i - 1), y1 = at(i), y2 = at(i + 1), y3 = at(i + 2);
  const a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
  const a1 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const a2 = -0.5 * y0 + 0.5 * y2;
  return ((a0 * f + a1) * f + a2) * f + y1;
}

// Drives the processor the way the page will: a target that advances at the
// commanded rate, posted once per block, stamped with audio time.
function driver(startPos = 0, { left = signal(LEN), right = signal(LEN, 1.7) } = {}) {
  const p = makeProcessor();
  p.port.send({ type: "buffer", left, right });
  p.port.send({ type: "reset", pos: startPos });
  let target = startPos;
  let at = 0;
  return {
    p, left, right,
    run(rate, blocks) {
      const out = [];
      for (let b = 0; b < blocks; b++) {
        target += rate * BLOCK;
        at += BLOCK / SR;
        p.port.send({ type: "target", pos: target, at });
        const before = p.cur;
        const chans = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
        p.process([], [chans]);
        out.push({ before, after: p.cur, rate: p.prevRate, l: chans[0], r: chans[1] });
      }
      return out;
    },
  };
}

test("MAX_RATE in the worklet source agrees with groove.js", () => {
  // The worklet cannot import, so the constant is duplicated. This is the only
  // thing keeping the two copies honest.
  const m = WORKLET_SOURCE.match(/this\.maxRate\s*=\s*(\d+(?:\.\d+)?)/);
  assert.ok(m, "worklet declares a maxRate");
  assert.equal(Number(m[1]), MAX_RATE);
});

test("negative rate walks the read head backwards", () => {
  const d = driver(20000);
  d.run(1, 40);
  const forwardEnd = d.p.cur;
  assert.ok(forwardEnd > 20000, `head advanced (${forwardEnd.toFixed(0)})`);
  d.run(-1, 60);
  assert.ok(d.p.cur < forwardEnd, `head reversed (${d.p.cur.toFixed(0)})`);
});

test("output at -1x is the source read backwards", () => {
  const d = driver(30000);
  d.run(-1, 80);
  const frames = d.run(-1, 8);
  let worst = 0;
  for (const { before, after, l } of frames) {
    const stepSize = (after - before) / l.length;
    assert.ok(stepSize < -0.97 && stepSize > -1.03, `settled near -1x (${stepSize.toFixed(4)})`);
    for (let i = 0; i < l.length; i++) {
      worst = Math.max(worst, Math.abs(l[i] - refRead(d.left, before + stepSize * i)));
    }
  }
  assert.ok(worst < 5e-3, `matches the source backwards (worst ${worst.toExponential(2)})`);
});

test("reverse output does NOT match the source read forwards", () => {
  // Guards the test above: a silent or stuck head scores a small error against
  // some reference too. This one has to fail to match.
  const d = driver(30000);
  d.run(-1, 80);
  const [{ before, l }] = d.run(-1, 1);
  let worst = 0;
  for (let i = 0; i < l.length; i++) worst = Math.max(worst, Math.abs(l[i] - refRead(d.left, before + i)));
  assert.ok(worst > 0.05, `forward reference is clearly wrong (worst ${worst.toFixed(4)})`);
});

test("the rate holds steady — no flutter", () => {
  // A chase with no feedforward swung 0.6x-1.4x once per animation frame in
  // the spike, which is audible wow.
  const d = driver(1000);
  d.run(1, 120);
  const frames = d.run(1, 120);
  let worst = 0;
  for (const f of frames) worst = Math.max(worst, Math.abs(f.rate - 1));
  assert.ok(worst < 0.02, `rate stays at 1x (worst deviation ${worst.toFixed(4)})`);
});

test("a direction reversal lands within one animation frame", () => {
  const d = driver(30000);
  d.run(1, 120);
  const frames = d.run(-1, 6);
  assert.ok(frames.at(-1).rate < -0.5, `reached ${frames.at(-1).rate.toFixed(2)} in 6 blocks`);
});

test("the two channels stay independent", () => {
  const d = driver(30000);
  d.run(1, 80);
  const [{ before, after, l, r }] = d.run(1, 1);
  const stepSize = (after - before) / l.length;
  let worstL = 0, worstR = 0, crosstalk = 0;
  for (let i = 0; i < l.length; i++) {
    worstL = Math.max(worstL, Math.abs(l[i] - refRead(d.left, before + stepSize * i)));
    worstR = Math.max(worstR, Math.abs(r[i] - refRead(d.right, before + stepSize * i)));
    crosstalk = Math.max(crosstalk, Math.abs(l[i] - r[i]));
  }
  assert.ok(worstL < 5e-3 && worstR < 5e-3, "each channel reads its own buffer");
  assert.ok(crosstalk > 0.1, "the channels are actually different, so the test means something");
});

test("Int16 storage survives the round trip", () => {
  const d = driver(1000);
  d.run(1, 80);
  const [{ before, after, l }] = d.run(1, 1);
  const stepSize = (after - before) / l.length;
  let worst = 0;
  for (let i = 0; i < l.length; i++) {
    worst = Math.max(worst, Math.abs(l[i] - refRead(d.left, before + stepSize * i)));
  }
  // 16-bit quantisation is ~3e-5. Anything near that is the storage format,
  // not a bug in the read.
  assert.ok(worst < 5e-3, `Int16 read is faithful (worst ${worst.toExponential(2)})`);
});

test("output is not silent while scratching", () => {
  const d = driver(30000);
  d.run(-1, 80);
  let peak = 0;
  for (const f of d.run(-1, 8)) for (const s of f.l) peak = Math.max(peak, Math.abs(s));
  assert.ok(peak > 0.2, `reverse audio has real level (peak ${peak.toFixed(3)})`);
});

test("a standstill is silent, not a thump", () => {
  const d = driver(30000);
  d.run(1, 80);
  const frames = d.run(0, 200);
  let peak = 0;
  for (const s of frames.at(-1).l) peak = Math.max(peak, Math.abs(s));
  assert.ok(peak < 0.02, `held still is silent (peak ${peak.toExponential(2)})`);
});

test("the head returns to where it started after a round trip", () => {
  const d = driver(24000);
  d.run(1, 200);
  const mark = d.p.cur;
  d.run(-3, 100);
  d.run(3, 100);
  d.run(1, 300);
  const expected = mark + 128 * 300;   // the scratches cancel; only the play remains
  assert.ok(Math.abs(d.p.cur - expected) < 400, `off by ${(d.p.cur - expected).toFixed(0)}`);
});

test("gain messages control the level", () => {
  const d = driver(30000);
  d.run(1, 80);
  d.p.port.send({ type: "gain", value: 0 });
  const frames = d.run(1, 40);
  let peak = 0;
  for (const s of frames.at(-1).l) peak = Math.max(peak, Math.abs(s));
  assert.ok(peak < 1e-3, `muted (peak ${peak.toExponential(2)})`);
});

test("no NaN or Infinity across a direction reversal", () => {
  const d = driver(100);               // near the seam, so it wraps
  const all = [...d.run(3, 40), ...d.run(-4, 40), ...d.run(0, 10), ...d.run(1, 40)];
  for (const f of all) {
    for (const s of f.l) assert.ok(Number.isFinite(s), "finite left sample");
    for (const s of f.r) assert.ok(Number.isFinite(s), "finite right sample");
  }
});

test("the rate clamp holds against an absurd throw", () => {
  const d = driver(0);
  d.p.port.send({ type: "target", pos: 1e9, at: 1 });
  d.p.process([], [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]);
  assert.ok(Math.abs(d.p.prevRate) <= MAX_RATE, `clamped to ${d.p.prevRate}`);
});

test("silence before a buffer arrives, rather than a crash", () => {
  const p = makeProcessor();
  const chans = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  assert.equal(p.process([], [chans]), true);
  assert.ok(chans[0].every((s) => s === 0), "no buffer yet, no sound");
});
