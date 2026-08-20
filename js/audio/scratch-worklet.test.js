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

// Drives the processor the way the page will: a target posted once per block,
// carrying the feedforward rate the page computed for that post from its own
// wall clock (performance.now()), not from audio time. `dtMs` is the
// simulated gap on that wall clock since the PREVIOUS post — a constant by
// default, equal to exactly one block's worth of audio time, so every
// existing test below drives a perfectly uniform clock (and gets numerically
// identical `rate` values to what this driver produced before the fix).
// Passing an array of per-block gaps instead lets a test simulate an
// irregular wall clock, including a zero-length gap — the animation-frame
// pattern actually measured in a browser (task-10 report).
function driver(startPos = 0, { left = signal(LEN), right = signal(LEN, 1.7) } = {}) {
  const p = makeProcessor();
  p.port.send({ type: "buffer", left, right });
  p.port.send({ type: "reset", pos: startPos });
  let target = startPos;
  let lastPos = startPos;
  let haveLast = false;
  return {
    p, left, right,
    run(rate, blocks, dtMs = (BLOCK / SR) * 1000) {
      const out = [];
      for (let b = 0; b < blocks; b++) {
        const gapMs = Array.isArray(dtMs) ? dtMs[b] : dtMs;
        // Position advances by the TRUE rate times however much real time
        // this gap represents, not by a fixed BLOCK — so an irregular `dtMs`
        // models a record whose speed genuinely never changes while only the
        // wall-clock spacing of the posts that report it does (exactly the
        // measured defect: rAF cadence jitters, the record's actual speed
        // does not).
        target += rate * (gapMs / 1000) * SR;
        // This is exactly deck-audio.js's setTurns computation: a rate
        // derived from the wall-clock gap since the last post, or NaN when
        // that gap isn't usable (the very first post, or a zero/negative
        // gap) — the same signal the worklet treats as "no update this
        // frame" rather than a record that stopped.
        let instRate = NaN;
        if (haveLast && gapMs > 0) instRate = (target - lastPos) / ((gapMs / 1000) * SR);
        lastPos = target;
        haveLast = true;
        p.port.send({ type: "target", pos: target, rate: instRate });
        const before = p.cur;
        const chans = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
        p.process([], [chans]);
        out.push({ before, after: p.cur, rate: p.prevRate, nominal: p.nominal, l: chans[0], r: chans[1] });
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

test("a seeded reset sets nominal and prevRate immediately, not just after a target message", () => {
  // Task 6-fix defect: nominal used to always reset to 0 and had to climb to
  // the true rate via several EMA-smoothed target messages, which is what
  // let a freshly picked track visibly ramp up to speed. The caller now
  // knows the record's current spin at the moment it resets the deck, so it
  // seeds the worklet directly instead of letting it rediscover the rate.
  const p = makeProcessor();
  p.port.send({ type: "buffer", left: signal(LEN), right: signal(LEN, 1.7) });
  p.port.send({ type: "reset", pos: 1000, rate: 1 });
  assert.equal(p.nominal, 1);
  assert.equal(p.prevRate, 1);
});

test("the very first block after a seeded reset already plays near the seed, not a cold start", () => {
  const p = makeProcessor();
  p.port.send({ type: "buffer", left: signal(LEN), right: signal(LEN, 1.7) });
  p.port.send({ type: "reset", pos: 1000, rate: 1 });
  const before = p.cur;
  const chans = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  p.process([], [chans]);
  const stepSize = (p.cur - before) / BLOCK;
  assert.ok(Math.abs(stepSize - 1) < 0.02, `first block already near 1x (${stepSize.toFixed(4)})`);
});

test("a seeded reset at a non-1x rate is honoured (a throw or scratch in progress when a track is picked)", () => {
  const p = makeProcessor();
  p.port.send({ type: "buffer", left: signal(LEN), right: signal(LEN, 1.7) });
  p.port.send({ type: "reset", pos: 1000, rate: -2.5 });
  assert.equal(p.nominal, -2.5);
  assert.equal(p.prevRate, -2.5);
});

test("an absent or non-finite seed rate falls back to a cold 0, never NaN", () => {
  const p1 = makeProcessor();
  p1.port.send({ type: "buffer", left: signal(LEN), right: signal(LEN, 1.7) });
  p1.port.send({ type: "reset", pos: 0 });   // no rate field at all — old callers, old behaviour
  assert.equal(p1.nominal, 0);
  assert.equal(p1.prevRate, 0);

  const p2 = makeProcessor();
  p2.port.send({ type: "buffer", left: signal(LEN), right: signal(LEN, 1.7) });
  p2.port.send({ type: "reset", pos: 0, rate: NaN });
  assert.equal(p2.nominal, 0);
  assert.equal(p2.prevRate, 0);
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

test("an irregular animation-frame clock does not corrupt a constant rate", () => {
  // Reproduces the measured defect (task-10 report): requestAnimationFrame
  // can fire faster than the audio hardware callback, so the wall-clock gap
  // between two posted targets is sometimes ~0ms — and, more generally, is
  // never perfectly uniform. The record's TRUE rate never changes here, only
  // the TIMING of the posts that report it does, including one zero-length
  // gap. Every other test in this file drives a perfectly uniform posting
  // clock (dtMs defaults to exactly one block), which is exactly why the old
  // ctx.currentTime-based derivation's quantisation bug never showed up here.
  //
  // This asserts on `nominal` (the feedforward estimate itself) rather than
  // on the end-to-end telemetry `rate`. The chase term has its own separate,
  // deliberately-unchanged ripple whenever a target message arrives less
  // often than a render quantum completes — a normal cadence mismatch,
  // confirmed present (worst ~0.015 by hand with this same harness) even
  // under a perfectly uniform posting clock with no irregularity at all.
  // Mixing that in would make this assertion either too loose to catch a
  // real derivation regression, or fail for a reason this fix does not own
  // and must not touch. `nominal` isolates exactly the computation the fix
  // changed.
  const d = driver(1_000_000);
  const trueBlockMs = (BLOCK / SR) * 1000; // ~2.9025ms, one render quantum
  d.run(1, 40); // let the feedforward settle at 1x on a uniform clock first
  const gaps = [
    trueBlockMs * 2.7, trueBlockMs * 2.4, 0, trueBlockMs * 5.1,
    trueBlockMs * 2.6, trueBlockMs * 2.9, trueBlockMs * 2.2, 0,
    trueBlockMs * 3.3, trueBlockMs * 2.8, trueBlockMs * 2.5, trueBlockMs * 3.0,
  ];
  const frames = d.run(1, gaps.length, gaps);
  let worst = 0;
  for (const f of frames) worst = Math.max(worst, Math.abs(f.nominal - 1));
  assert.ok(worst < 0.02, `feedforward rate stays at 1x through irregular timing (worst deviation ${worst.toFixed(4)})`);
});

test("a needle drop does not glide up in pitch while a real gap opens before the first target", () => {
  // Reproduces the measured defect (startup-glide report): the page posts
  // `reset` at pos 0, then the record keeps turning for a frame or two
  // before the first `target` message actually arrives, so that first pos
  // lands ~1500 samples ahead of cur purely from message timing — the head
  // was never behind. Chasing that gap the ordinary way used to glide the
  // rate up toward 1.04x and take a full second to settle back to 1x,
  // audible as every track starting sharp. There is nothing to converge
  // toward here, so this asserts on NO catch-up excursion at all: the very
  // first block already sits within 0.02 of the commanded rate.
  const p = makeProcessor();
  p.port.send({ type: "buffer", left: signal(LEN), right: signal(LEN, 1.7) });
  p.port.send({ type: "reset", pos: 0, rate: 1 });
  p.port.send({ type: "target", pos: 1500, rate: 1 });
  const chans = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  p.process([], [chans]);
  assert.ok(Math.abs(p.prevRate - 1) < 0.02, `no catch-up excursion (rate ${p.prevRate.toFixed(4)})`);
});

test("several targets landing before the worklet renders its first block do not glide either", () => {
  // The single-message version above already passed once the FIRST post-
  // reset target snapped cur to it — but the measured real-browser sequence
  // is not one message, it's several: the AudioContext/worklet startup gap
  // is ~34ms, and the page posts a target every animation frame (~8ms)
  // throughout it, all before process() has been called even once. Only
  // snapping the first of those targets lets `target` walk ahead of `cur`
  // again on every message after it — recreating the same lag the first
  // snap was meant to close, just shifted later. This reproduces that: five
  // targets, one every ~8ms of simulated frame time, arrive before the
  // first rendered block. The very first rendered block must still land
  // within 0.02 of the commanded rate, with no catch-up excursion.
  const p = makeProcessor();
  p.port.send({ type: "buffer", left: signal(LEN), right: signal(LEN, 1.7) });
  p.port.send({ type: "reset", pos: 0, rate: 1 });
  p.port.send({ type: "target", pos: 350, rate: 1 });
  p.port.send({ type: "target", pos: 700, rate: 1 });
  p.port.send({ type: "target", pos: 1050, rate: 1 });
  p.port.send({ type: "target", pos: 1400, rate: 1 });
  p.port.send({ type: "target", pos: 1518, rate: 1 });
  const chans = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  p.process([], [chans]);
  assert.ok(Math.abs(p.prevRate - 1) < 0.02, `no catch-up excursion (rate ${p.prevRate.toFixed(4)})`);
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
  d.p.port.send({ type: "target", pos: 1e9, rate: NaN });
  d.p.process([], [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]);
  assert.ok(Math.abs(d.p.prevRate) <= MAX_RATE, `clamped to ${d.p.prevRate}`);
});

test("silence before a buffer arrives, rather than a crash", () => {
  const p = makeProcessor();
  const chans = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  assert.equal(p.process([], [chans]), true);
  assert.ok(chans[0].every((s) => s === 0), "no buffer yet, no sound");
});
