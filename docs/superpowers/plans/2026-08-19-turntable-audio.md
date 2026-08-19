# Turntable Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The hero record plays music the visitor picks from a list under it, and dragging the record scratches that music — backwards included.

**Architecture:** Playback position is a pure function of how far the record has turned. `spin.js` accumulates cumulative unwrapped revolutions; `main.js` converts that to a sample position each frame and posts it to an `AudioWorklet` that reads a decoded buffer with a fractional, signed-step read head. Negative step = reverse. There is no separate notion of playback rate anywhere in the system.

**Tech Stack:** Vanilla ES modules, no dependencies. Web Audio `AudioWorklet`. Tests are `node --test` only — the repo has zero npm dependencies and that stays true, so every test is on pure functions.

**Spec:** `docs/superpowers/specs/2026-08-19-turntable-audio-design.md`

## Global Constraints

- **No new npm dependencies.** `package.json` has none and must keep none. Test script is `node --test`.
- **No DOM in tests.** There is no jsdom. Any logic that needs testing must be extracted as a pure exported function.
- **Encode:** AAC 96 kbps `.m4a`, full length, nothing trimmed. Sources at `C:\Users\kwhan\Desktop\Github Website Audio`.
- **AudioContext must be constructed at 44100 Hz** to match the source files, or `decodeAudioData` resamples every track on the way in.
- **Buffers are stored `Int16`, not `Float32`.** Halves peak memory (150 MB → 75 MB on the Hiromi track).
- **Colour rule:** magenta/`--pop` is reserved on this page for "running past its own speed". The picker must not spend it on ordinary selection.
- **`MAX_RATE = 8`** is duplicated as a literal inside `WORKLET_SOURCE` because AudioWorklet scopes cannot import. Task 3 asserts the two agree.
- **Comment style:** this codebase explains *why*, not *what*, in full sentences. Match it.
- Baseline before any work: **57 tests passing**, `main` at `1e067e3`.

---

### Task 1: Cumulative revolutions on the spin state

The record's angle is wrapped to 0–360 for painting, which is useless as an audio clock — it jumps at the seam. Audio needs a monotonic, signed, never-wrapped count of revolutions.

**Files:**
- Modify: `js/spin.js:76-90` (`stepSpin`)
- Test: `js/spin.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `state.turns` — a number on the deck state object, cumulative signed revolutions, never wrapped. `stepSpin(state, dt, opts)` keeps its existing signature and now also advances `state.turns`.

- [ ] **Step 1: Write the failing tests**

Append to `js/spin.test.js`:

```js
test("stepSpin accumulates turns, unwrapped", () => {
  const s = { angle: 0, vel: IDLE_VEL, grabbed: false, turns: 0 };
  // Ten seconds at 33 1/3 rpm is 5.555… revolutions. Turns must keep counting
  // past 1 — a wrapped value would be useless as an audio clock.
  for (let i = 0; i < 1000; i++) stepSpin(s, 0.01);
  assert.ok(Math.abs(s.turns - (IDLE_VEL * 10) / 360) < 1e-6, `turns ${s.turns}`);
});

test("stepSpin counts turns backwards when the record runs backwards", () => {
  const s = { angle: 0, vel: -IDLE_VEL, grabbed: false, turns: 0 };
  stepSpin(s, 0.05, { paused: true });   // paused so vel doesn't ease to idle
  assert.ok(s.turns < 0, `turns went negative (${s.turns})`);
});

test("stepSpin leaves turns alone while the record is grabbed", () => {
  const s = { angle: 10, vel: 0, grabbed: true, turns: 4.25 };
  stepSpin(s, 0.5);
  assert.equal(s.turns, 4.25);
});

test("turns and angle agree — turns is angle without the wrapping", () => {
  const s = { angle: 0, vel: IDLE_VEL, grabbed: false, turns: 0 };
  for (let i = 0; i < 60; i++) stepSpin(s, 1 / 60);
  assert.ok(Math.abs(wrapAngle(s.turns * 360) - s.angle) < 1e-6,
    `wrapped turns (${wrapAngle(s.turns * 360)}) matches angle (${s.angle})`);
});

test("turns advance is frame-rate independent at a steady speed", () => {
  const coarse = { angle: 0, vel: IDLE_VEL, grabbed: false, turns: 0 };
  const fine = { angle: 0, vel: IDLE_VEL, grabbed: false, turns: 0 };
  stepSpin(coarse, 0.1);
  for (let i = 0; i < 10; i++) stepSpin(fine, 0.01);
  assert.ok(Math.abs(coarse.turns - fine.turns) < 1e-9);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `turns` stays `0` / is `undefined`.

- [ ] **Step 3: Implement**

In `js/spin.js`, change the tail of `stepSpin` so the travel is computed once and spent on both fields:

```js
  state.vel = target + (state.vel - target) * Math.exp(-step / tau);
  // Exponential decay never quite reaches zero; park it once it's under a
  // fraction of a degree per second so the loop can idle.
  if (paused && Math.abs(state.vel) < 0.4) state.vel = 0;

  // `angle` is wrapped because that is what a CSS rotate() wants. `turns` is
  // the same travel left unwrapped, because it is the audio's clock: playback
  // position is a function of how far the record has turned, and a value that
  // jumps at the 0/360 seam would jump the needle with it.
  const travel = state.vel * step;
  state.angle = wrapAngle(state.angle + travel);
  state.turns += travel / 360;
  return state;
```

Also update the doc comment above `stepSpin` — it currently documents `state` as `{ angle, vel, grabbed }`:

```js
 * `state` is { angle, vel, grabbed, turns }. `dt` is seconds.
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS, 62 tests.

- [ ] **Step 5: Commit**

```bash
git add js/spin.js js/spin.test.js
git commit -m "feat: cumulative turns on the spin state

The audio's playback position will be a function of how far the record
has turned, so it needs revolutions that keep counting rather than an
angle that wraps at 360 and would jump the needle at the seam."
```

---

### Task 2: The turn-to-sample mapping

**Files:**
- Create: `js/audio/groove.js`
- Test: `js/audio/groove.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `SECONDS_PER_TURN` (1.8), `MAX_RATE` (8), `samplesFromTurns(turns, sampleRate) -> number`, `clampRate(rate) -> number`

- [ ] **Step 1: Write the failing test**

Create `js/audio/groove.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { SECONDS_PER_TURN, MAX_RATE, samplesFromTurns, clampRate } from "./groove.js";
import { IDLE_VEL } from "../spin.js";

test("one revolution is one revolution's worth of audio", () => {
  assert.ok(Math.abs(SECONDS_PER_TURN - 1.8) < 1e-12, "33 1/3 rpm is 1.8s per turn");
  assert.equal(samplesFromTurns(1, 48000), 1.8 * 48000);
});

test("a second of idle spin is exactly a second of audio", () => {
  // This is the whole design in one assertion: at 33 1/3 the record plays at
  // 1x, so nothing about normal playback needs tuning.
  const turnsInOneSecond = IDLE_VEL / 360;
  assert.ok(Math.abs(samplesFromTurns(turnsInOneSecond, 44100) - 44100) < 1e-6);
});

test("running backwards gives a negative position", () => {
  assert.ok(samplesFromTurns(-2, 44100) < 0);
});

test("clampRate holds the rate inside MAX_RATE both ways", () => {
  assert.equal(clampRate(99), MAX_RATE);
  assert.equal(clampRate(-99), -MAX_RATE);
  assert.equal(clampRate(1), 1);
  assert.equal(clampRate(-1), -1);
});

test("clampRate turns a broken number into a standstill, not a NaN", () => {
  assert.equal(clampRate(NaN), 0);
  assert.equal(clampRate(Infinity), MAX_RATE);
  assert.equal(clampRate(undefined), 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./groove.js`.

- [ ] **Step 3: Implement**

Create `js/audio/groove.js`:

```js
// How the record's rotation becomes a position in the audio. Pure — no DOM, no
// audio API. Unit-tested in groove.test.js.
//
// One revolution of the record is one revolution's worth of audio. That single
// rule is the whole coupling between the picture and the sound: idle spin comes
// out at 1x, a throw pitches up, a backward drag runs backwards, and a record
// held still is silent — none of it tuned by ear.

export const RPM = 100 / 3;                    // 33 1/3
export const SECONDS_PER_TURN = 60 / RPM;      // 1.8

// A throw can reach ~2600 deg/s, which is 13x. Past about 8x the audio is not
// recognisable as music any more and the top octave aliases, so the head stops
// accelerating there. NOTE: duplicated as a literal in scratch-worklet.js,
// because an AudioWorklet scope cannot import. Kept honest by a test.
export const MAX_RATE = 8;

/** Where the needle should be, in samples, for a given cumulative rotation. */
export function samplesFromTurns(turns, sampleRate) {
  return turns * SECONDS_PER_TURN * sampleRate;
}

/** A rate the read head can actually use: finite, and inside MAX_RATE. */
export function clampRate(rate) {
  if (!Number.isFinite(rate)) return 0;
  return Math.max(-MAX_RATE, Math.min(MAX_RATE, rate));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS, 67 tests.

- [ ] **Step 5: Commit**

```bash
git add js/audio/groove.js js/audio/groove.test.js
git commit -m "feat: turn-to-sample mapping for the record

One revolution of the record is one revolution's worth of audio, which
makes idle spin come out at exactly 1x and leaves nothing to tune."
```

---

### Task 3: The scratch DSP

The heart of the feature. A worklet that reads a decoded buffer with a fractional, signed read head, so a negative step plays the track backwards. `AudioBufferSourceNode` cannot do this — a negative `playbackRate` outputs silence.

The processor source is a **string** so the same text is both `addModule`'d in the browser and evaluated in Node against stub globals. AudioWorklet scopes do not support ES module imports, so a string is the only way to test the maths rather than duplicate it.

**Files:**
- Create: `js/audio/scratch-worklet.js`
- Test: `js/audio/scratch-worklet.test.js`

**Interfaces:**
- Consumes: `MAX_RATE` from `js/audio/groove.js` (for the agreement assertion only)
- Produces: `WORKLET_SOURCE` (string), `PROCESSOR_NAME` (`"scratch"`). Message protocol below is what Task 4 speaks.

| direction | message | meaning |
|---|---|---|
| → worklet | `{type:"buffer", left: Int16Array, right: Int16Array}` | replaces the current track |
| → worklet | `{type:"target", pos, at}` | head should be at `pos` samples as of audio time `at` |
| → worklet | `{type:"reset", pos}` | drop the needle at `pos`, clear rate state |
| → worklet | `{type:"gain", value}` | master level |
| → main | `{type:"pos", cur, rate, rms}` | throttled telemetry |

- [ ] **Step 1: Write the failing test**

Create `js/audio/scratch-worklet.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./scratch-worklet.js`.

- [ ] **Step 3: Implement**

Create `js/audio/scratch-worklet.js`:

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS, 82 tests.

- [ ] **Step 5: Commit**

```bash
git add js/audio/scratch-worklet.js js/audio/scratch-worklet.test.js
git commit -m "feat: scratch DSP that can run a record backwards

Neither <audio> nor AudioBufferSourceNode supports a negative playback
rate, so the sample loop is ours: a fractional read head whose step can
be negative, Catmull-Rom interpolated.

Rate is feedforward plus a slow correction rather than a chase alone. A
chase alone has to swallow a whole animation frame of lag at once, which
measured as a 0.6x-1.4x swing in the spike and is audible as wow."
```

---

### Task 4: The audio engine

Browser glue. Owns the `AudioContext`, fetches and decodes tracks, converts them to `Int16`, and turns the record's rotation into target messages. The only file in the feature that touches Web Audio, and it deliberately holds no logic worth testing beyond one pure converter.

**Files:**
- Create: `js/audio/deck-audio.js`
- Test: `js/audio/deck-audio.test.js`

**Interfaces:**
- Consumes: `samplesFromTurns` from `groove.js`; `WORKLET_SOURCE`, `PROCESSOR_NAME` from `scratch-worklet.js`
- Produces:
  - `toInt16(float32Array) -> Int16Array` (pure, exported for test)
  - `createDeckAudio({ onState }) -> { load(track), setTurns(turns), setMuted(bool), stop(), isSupported() }`
  - `onState` is called with `{ id, status }` where status is `"loading" | "playing" | "failed" | "idle"`

- [ ] **Step 1: Write the failing test**

Create `js/audio/deck-audio.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInt16 } from "./deck-audio.js";

test("toInt16 preserves the waveform within quantisation error", () => {
  const f = new Float32Array(1000);
  for (let i = 0; i < f.length; i++) f[i] = Math.sin(i * 0.05) * 0.8;
  const i16 = toInt16(f);
  assert.equal(i16.length, f.length);
  let worst = 0;
  for (let i = 0; i < f.length; i++) worst = Math.max(worst, Math.abs(i16[i] / 32768 - f[i]));
  assert.ok(worst < 1e-4, `16-bit quantisation only (worst ${worst.toExponential(2)})`);
});

test("toInt16 clips instead of wrapping", () => {
  // A float buffer can exceed +/-1 after decode. Wrapping would turn the
  // loudest moment of a track into a burst of noise.
  const i16 = toInt16(new Float32Array([2, -2, 1, -1, 0]));
  assert.equal(i16[0], 32767);
  assert.equal(i16[1], -32767);
  assert.equal(i16[2], 32767);
  assert.equal(i16[3], -32767);
  assert.equal(i16[4], 0);
});

test("toInt16 handles an empty buffer", () => {
  assert.equal(toInt16(new Float32Array(0)).length, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./deck-audio.js`.

- [ ] **Step 3: Implement**

Create `js/audio/deck-audio.js`:

```js
// The audio engine. Owns the AudioContext, loads and decodes a track, and
// reports the record's rotation to the worklet as a target position.
//
// Everything with logic worth testing lives in groove.js and scratch-worklet.js.
// This file is the part that can only run in a browser, so it is kept thin on
// purpose.

import { samplesFromTurns } from "./groove.js";
import { WORKLET_SOURCE, PROCESSOR_NAME } from "./scratch-worklet.js";

// The source files are 44.1kHz. A default 48kHz context would make
// decodeAudioData resample every track on the way in — a pointless pass, and
// ~9% more memory held for the whole session.
const SAMPLE_RATE = 44100;

/**
 * Float samples to 16-bit. Halves what a decoded track costs in memory, at CD
 * depth, which is inaudible. Clips rather than wraps: decoded floats can exceed
 * +/-1, and wrapping would turn a track's loudest moment into noise.
 */
export function toInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const v = f32[i];
    out[i] = v >= 1 ? 32767 : v <= -1 ? -32767 : Math.round(v * 32767);
  }
  return out;
}

export function createDeckAudio({ onState } = {}) {
  let ctx = null;
  let node = null;
  let moduleReady = null;
  let current = null;      // the track id that is loaded or loading
  let origin = null;       // turns at the moment the needle went down
  let lastTurns = 0;
  let token = 0;           // guards against a slow load landing after a newer one
  let abort = null;
  let muted = false;

  const report = (id, status) => onState?.({ id, status });

  const isSupported = () =>
    typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";

  async function ensureGraph() {
    if (node) return;
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (!moduleReady) {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
      moduleReady = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    }
    await moduleReady;
    node = new AudioWorkletNode(ctx, PROCESSOR_NAME, { outputChannelCount: [2] });
    node.connect(ctx.destination);
  }

  async function load(track) {
    const mine = ++token;
    abort?.abort();
    abort = new AbortController();
    current = track.id;
    origin = null;
    report(track.id, "loading");

    try {
      await ensureGraph();
      // Safari suspends the context until a gesture; this call is inside the
      // click that picked the track, so it is allowed to resume here.
      if (ctx.state === "suspended") await ctx.resume();

      const res = await fetch(track.src, { signal: abort.signal });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
      if (mine !== token) return;                       // a newer pick won

      const left = toInt16(decoded.getChannelData(0));
      const right = decoded.numberOfChannels > 1 ? toInt16(decoded.getChannelData(1)) : left;
      const transfer = right === left ? [left.buffer] : [left.buffer, right.buffer];
      node.port.postMessage({ type: "buffer", left, right }, transfer);
      node.port.postMessage({ type: "reset", pos: 0 });
      node.port.postMessage({ type: "gain", value: muted ? 0 : 1 });

      // The record has been turning since the page loaded, so its rotation
      // count means nothing to a track that just went on. Anchor here: from now
      // on, position is measured from this moment.
      origin = lastTurns;
      report(track.id, "playing");
    } catch (err) {
      if (err.name === "AbortError" || mine !== token) return;
      console.warn(`[deck-audio] could not play ${track.id}:`, err);
      current = null;
      report(track.id, "failed");
    }
  }

  function setTurns(turns) {
    lastTurns = turns;
    if (!node || origin === null) return;
    node.port.postMessage({
      type: "target",
      pos: samplesFromTurns(turns - origin, ctx.sampleRate),
      at: ctx.currentTime,
    });
  }

  function setMuted(value) {
    muted = value;
    node?.port.postMessage({ type: "gain", value: muted ? 0 : 1 });
  }

  function stop() {
    abort?.abort();
    token++;
    origin = null;
    const was = current;
    current = null;
    node?.port.postMessage({ type: "gain", value: 0 });
    if (was) report(was, "idle");
  }

  return { load, setTurns, setMuted, stop, isSupported };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS, 85 tests.

- [ ] **Step 5: Commit**

```bash
git add js/audio/deck-audio.js js/audio/deck-audio.test.js
git commit -m "feat: audio engine for the deck

Loads one track at a time, stores it as Int16 to halve resident memory,
and anchors playback to the rotation count at the moment the needle went
down — the record has been turning since page load, so its raw count
means nothing to a track that just went on."
```

---

### Task 5: The track manifest and the encoded assets

**Files:**
- Create: `tracks.js`
- Create: `tracks.test.js`
- Create: `assets/audio/*.m4a` (five files, ~13.3 MB total)

**Interfaces:**
- Consumes: nothing
- Produces: `TRACKS` (array of `{id, artist, title, src}`), `trackPickerHTML(tracks) -> string`

- [ ] **Step 1: Encode the assets**

Sources are at `C:\Users\kwhan\Desktop\Github Website Audio`. Run from the repo root:

```bash
mkdir -p assets/audio
SRC="/c/Users/kwhan/Desktop/Github Website Audio"
enc() { ffmpeg -v error -y -i "$SRC/$1" -c:a aac -b:a 96k -movflags +faststart "assets/audio/$2"; }
enc "Hiromi-Uehara-Seeker.mp3"                                        hiromi-seeker.m4a
enc "Bill-Evans-Waltz-For-Debby.mp3"                                  evans-waltz-for-debby.m4a
enc "Erroll-Garner-Misty.mp3"                                         garner-misty.m4a
enc "Anomalie-Ouverture.mp3"                                          anomalie-ouverture.m4a
enc "Insaneintherain-Mario-Galaxy-Rosalina-s-Comet-Observator.mp3"    insaneintherain-rosalina.m4a
ls -la assets/audio/
```

Expected: five files, total ~13.3 MB. **This weight is permanent in git history — verify the encode before committing, because a later re-encode adds rather than replaces.**

- [ ] **Step 2: Write the failing test**

Create `tracks.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKS, trackPickerHTML } from "./tracks.js";

test("TRACKS is well-formed", () => {
  assert.ok(Array.isArray(TRACKS) && TRACKS.length > 0);
  for (const t of TRACKS) {
    assert.ok(t.id && typeof t.id === "string", "has an id");
    assert.ok(t.artist, "has an artist");
    assert.ok(t.title, "has a title");
    assert.match(t.src, /^\.\/assets\/audio\/[\w-]+\.m4a$/, `${t.id} src is a local m4a`);
  }
});

test("track ids are unique", () => {
  // The id is the value of data-track in the markup, so a duplicate would make
  // two rows fight over the same button state.
  assert.equal(new Set(TRACKS.map((t) => t.id)).size, TRACKS.length);
});

test("every track carries a real artist name, not a filename", () => {
  for (const t of TRACKS) assert.doesNotMatch(t.artist, /[-_/.]m4a|assets/i);
});

test("trackPickerHTML renders one button per track, keyed by id", () => {
  const html = trackPickerHTML(TRACKS);
  for (const t of TRACKS) {
    assert.ok(html.includes(`data-track="${t.id}"`), `${t.id} has a button`);
    assert.ok(html.includes(t.title), `${t.title} is named`);
  }
  assert.equal((html.match(/<button/g) || []).length, TRACKS.length);
});

test("every picker button starts unpressed", () => {
  const html = trackPickerHTML(TRACKS);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, TRACKS.length);
  assert.doesNotMatch(html, /aria-pressed="true"/);
});

test("trackPickerHTML escapes its input", () => {
  const html = trackPickerHTML([
    { id: "x&y", artist: '<script>alert(1)</script>', title: 'A "quoted" thing', src: "./assets/audio/x.m4a" },
  ]);
  assert.doesNotMatch(html, /<script>/);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("data-track=\"x&amp;y\""));
});

test("the accessible name says what pressing the button does", () => {
  const html = trackPickerHTML([
    { id: "a", artist: "Someone", title: "Something", src: "./assets/audio/a.m4a" },
  ]);
  assert.match(html, /aria-label="Play Something by Someone\."/);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./tracks.js`.

- [ ] **Step 4: Implement**

Create `tracks.js`:

```js
// What the record can play, and the pure helper that renders the picker.
// Sits beside exams.js and follows the same shape: data plus a render function,
// both unit-tested, so adding a track is one line and nothing else.
//
// `artist` and `title` are separate because the record's label already has two
// lines — the title goes on .record__title, the artist on .record__side.

export const TRACKS = [
  { id: "hiromi",   artist: "Hiromi Uehara",   title: "Seeker",                 src: "./assets/audio/hiromi-seeker.m4a" },
  { id: "evans",    artist: "Bill Evans",      title: "Waltz for Debby",        src: "./assets/audio/evans-waltz-for-debby.m4a" },
  { id: "garner",   artist: "Erroll Garner",   title: "Misty",                  src: "./assets/audio/garner-misty.m4a" },
  { id: "anomalie", artist: "Anomalie",        title: "Ouverture",              src: "./assets/audio/anomalie-ouverture.m4a" },
  { id: "insane",   artist: "insaneintherain", title: "Rosalina's Observatory", src: "./assets/audio/insaneintherain-rosalina.m4a" },
];

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The list under the record. Each row is a button: pressing it drops the needle
 * on that track, pressing the playing one lifts it. The visible text is title
 * over artist; the accessible name spells the action out, because "Seeker"
 * alone does not say the row does anything.
 */
export function trackPickerHTML(tracks) {
  const items = tracks.map((t) => {
    const id = escapeHTML(t.id);
    const title = escapeHTML(t.title);
    const artist = escapeHTML(t.artist);
    return `<li class="picker__item">` +
      `<button class="picker__btn" type="button" data-track="${id}" aria-pressed="false"` +
        ` aria-label="Play ${title} by ${artist}.">` +
        `<span class="picker__mark" aria-hidden="true"></span>` +
        `<span class="picker__text">` +
          `<span class="picker__title">${title}</span>` +
          `<span class="picker__artist">${artist}</span>` +
        `</span>` +
      `</button>` +
    `</li>`;
  }).join("");
  return `<ul class="picker">${items}</ul>`;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: PASS, 92 tests.

- [ ] **Step 6: Commit**

```bash
git add tracks.js tracks.test.js assets/audio
git commit -m "feat: track manifest and encoded audio

Five tracks, AAC 96k, full length. Measured cost of the encode on the
191kbps source is -1.7dB above 16kHz, in a band already 53dB below the
programme; the Bill Evans source was already ~100kbps and is unchanged
within 0.2dB.

Adding a track is one line in tracks.js."
```

---

### Task 6: The deck learns to be paused from outside, and from its centre

Three changes to `js/deck.js`: accumulate `turns` during a drag, expose `setPaused` so picking a track can start a stopped record, and make only the centre label answer a click.

**Files:**
- Modify: `js/deck.js:26` (state init), `js/deck.js:82-92` (pointermove), `js/deck.js:114-118` (click), `js/deck.js:127-131` (togglePaused), `js/deck.js:155` (return)
- Test: `js/deck.test.js`

**Interfaces:**
- Consumes: `state.turns` from Task 1
- Produces:
  - `pressIntent({ onLabel, didDrag, keyboard }) -> "toggle" | "ignore"` (pure, exported)
  - `createDeck(...)` return value gains `setPaused(bool)`

- [ ] **Step 1: Write the failing test**

Create `js/deck.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { pressIntent } from "./deck.js";

test("a click on the centre label pauses", () => {
  assert.equal(pressIntent({ onLabel: true, didDrag: false, keyboard: false }), "toggle");
});

test("a click on the outer disc does nothing", () => {
  // The disc is the instrument; the label is the transport. One pause target,
  // so the centre actually means something.
  assert.equal(pressIntent({ onLabel: false, didDrag: false, keyboard: false }), "ignore");
});

test("a drag that began on the label spins the record, it does not pause it", () => {
  // Otherwise the middle of the instrument is a dead zone.
  assert.equal(pressIntent({ onLabel: true, didDrag: true, keyboard: false }), "ignore");
});

test("a drag on the outer disc does nothing either", () => {
  assert.equal(pressIntent({ onLabel: false, didDrag: true, keyboard: false }), "ignore");
});

test("the keyboard always pauses, wherever the pointer happens to be", () => {
  // There is one focusable control, and space or enter on it is the transport.
  // A keyboard press reports no coordinates, so it can never be "on the label".
  assert.equal(pressIntent({ onLabel: false, didDrag: false, keyboard: true }), "toggle");
  assert.equal(pressIntent({ onLabel: false, didDrag: true, keyboard: true }), "toggle");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `pressIntent` is not exported from `./deck.js`.

- [ ] **Step 3: Implement**

In `js/deck.js`, add the pure helper near the top, after the constants:

```js
/**
 * What a press on the record means.
 *
 * The disc is the instrument and the centre label is the transport, so only the
 * label answers a click. `keyboard` is a press with no coordinates (a
 * MouseEvent with `detail === 0`), which cannot be "on the label" and must
 * still work — it is the only way a keyboard user can stop the music.
 */
export function pressIntent({ onLabel, didDrag, keyboard }) {
  if (keyboard) return "toggle";
  if (didDrag) return "ignore";
  return onLabel ? "toggle" : "ignore";
}
```

Add `turns` to the state (line 26):

```js
  const state = { angle: 0, vel: reduced ? 0 : IDLE_VEL, grabbed: false, turns: 0 };
```

In `pointermove`, spend the same delta on both fields:

```js
    state.angle = wrapAngle(state.angle + delta);
    // The pointer is driving, so stepSpin is not running — the drag has to keep
    // the audio clock moving itself, or the one gesture that should make the
    // most interesting sound would make none.
    state.turns += delta / 360;
```

Replace the `click` listener:

```js
  // A mouse drag ends in a click event too, and only the centre label is the
  // transport. `e.detail === 0` means the press came from the keyboard.
  root.addEventListener("click", (e) => {
    const onLabel = !!(e.target instanceof Element && e.target.closest(".record__label"));
    const intent = pressIntent({ onLabel, didDrag, keyboard: e.detail === 0 });
    didDrag = false;
    if (intent === "toggle") togglePaused();
  });
```

Rework `togglePaused` into a setter plus a toggle, so the picker can start a stopped record:

```js
  function setPaused(value) {
    paused = value;
    root.setAttribute("aria-pressed", String(!paused));
    root.classList.toggle("is-stopped", paused);
    markUsed();
  }

  function togglePaused() {
    setPaused(!paused);
  }
```

Then in the two places that currently set `aria-pressed` by hand after a throw or an arrow key — `js/deck.js:100-103` and `js/deck.js:121-124` — replace:

```js
      if (!reduced) {
        paused = false;
        root.setAttribute("aria-pressed", "true");
      }
```

with:

```js
      if (!reduced) setPaused(false);
```

Finally, export it (line 155):

```js
  return { step, cue, isBusy, setPaused, state };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS, 97 tests.

- [ ] **Step 5: Commit**

```bash
git add js/deck.js js/deck.test.js
git commit -m "feat: the record's centre is the transport

Only the label answers a click now — the disc is the instrument. A drag
that begins on the label still spins, so the middle is not a dead zone,
and the keyboard still pauses because a press with no coordinates can
never be 'on the label'.

setPaused is exported because picking a track has to be able to start a
stopped record, which is also the reduced-motion path."
```

---

### Task 7: Exam rows stop being buttons

They cued names onto the record label. The label now means "what is playing", so the cue is gone.

**Files:**
- Modify: `exams.js:66-84` (`examRowHTML`)
- Test: `exams.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `examRowHTML(exam)` returns an `<li>` with no interactive element

- [ ] **Step 1: Update the tests**

In `exams.test.js`, replace the three tests that assert button behaviour — `"examRowHTML includes name, status class, and scheduled note"`, the one asserting `data-cue`/`aria-label`, and the date test — with:

```js
test("examRowHTML includes name, status class, and scheduled note", () => {
  const html = examRowHTML({ name: "Exam FAM", status: "scheduled", note: "Up next" });
  assert.match(html, /rec--scheduled/);
  assert.match(html, /Exam FAM/);
  assert.match(html, /Up next/);
});

test("an exam row is not a control", () => {
  // The record's label names what is playing now. A row that put an exam name
  // on it would be making the label lie.
  const html = examRowHTML({ name: "MAS-II", status: "scheduled", note: "Studying", date: "Sitting Oct" });
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /data-cue/);
  assert.doesNotMatch(html, /aria-label/);
  assert.doesNotMatch(html, /aria-pressed/);
  assert.match(html, /Sitting Oct/);
});

test("no rendered exam row is a control", () => {
  const html = renderExams(EXAMS, REQUIREMENTS);
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /data-cue/);
});
```

Keep every other test in the file unchanged, including `"MAS-II is a retake in progress, not a cleared exam"` — but drop its `data-cue` expectation if present.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — rows still render `<button`.

- [ ] **Step 3: Implement**

Replace `examRowHTML` in `exams.js`:

```js
// A row in the ledger. Not a control: the record's label names whatever is
// playing, and a row that could overwrite it would be making the label lie.
export function examRowHTML(exam) {
  const status = STATUSES.includes(exam.status) ? exam.status : "notStarted";
  const label = exam.note ? escapeHTML(exam.note) : LABEL[status];
  const date = exam.date ? `<span class="rec__date">${escapeHTML(exam.date)}</span>` : "";
  const name = escapeHTML(exam.name);
  return `<li class="rec rec--${status}">` +
    `<span class="rec__mark" aria-hidden="true"></span>` +
    `<span class="rec__name">${name}</span>` +
    `<span class="rec__stat"><span class="rec__label">${label}</span>${date}</span>` +
  `</li>`;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS, 97 tests (one test replaced, two added).

- [ ] **Step 5: Commit**

```bash
git add exams.js exams.test.js
git commit -m "refactor: exam rows are rows again, not cue buttons

The record's label is about to mean one thing — what is playing. A row
that could put an exam name there would be making it lie."
```

---

### Task 8: Markup and styling

**Files:**
- Modify: `index.html:92-101` (the deck), `index.html:110` (`aria-label`), `index.html:140-146` (credits)
- Modify: `style.css:330-341` (deck/glow), `style.css:377-392` (label), `style.css:497-513` (credits), `style.css:636-644` (`.rec__cue`)

**Interfaces:**
- Consumes: `trackPickerHTML` from `tracks.js` (rendered by Task 9)
- Produces: `.deck__platter` (square, owns the glow), `#track-picker` (mount point), `.record__glyph` (the pause affordance), `.picker*` classes

- [ ] **Step 1: Restructure the deck markup**

**The glow is the trap here.** `.deck::before` is positioned `top:-25% left:-25% width:150% height:150%` *of `.deck`*, tuned so its centre lands on the record's centre — and the comment in `style.css:332` records that it was already wrong once when the deck held something else. Putting the picker inside `.deck` makes the box taller and slides the glow off the vinyl again.

So the record gets its own square wrapper, and the glow moves to it.

In `index.html`, replace the `.deck` block:

```html
      <div class="deck">
        <div class="deck__platter">
          <button class="record" type="button" aria-pressed="true"
                  aria-label="Record. Drag it to spin, arrow keys to nudge; press the centre label, space, or enter to stop it.">
            <span class="record__disc" aria-hidden="true">
              <span class="record__label">
                <span class="record__title">Kyuwon<br>Han</span>
                <span class="record__side">33⅓ · stereo</span>
                <span class="record__glyph" aria-hidden="true"></span>
              </span>
            </span>
          </button>
        </div>
        <div id="track-picker"></div>
        <button class="mute" type="button" id="mute" aria-pressed="false" hidden>
          <span class="mute__mark" aria-hidden="true"></span>
          <span class="mute__label">Sound on</span>
        </button>
      </div>
```

The mute button ships `hidden`; Task 9 reveals it only where audio is supported,
so a browser with no AudioWorklet never shows a control for sound it cannot make.

Note `.record__glyph` sits *inside* `.record__label` so it counter-rotates with it and stays upright.

- [ ] **Step 2: Move the glow and style the platter**

In `style.css`, change the deck rules:

```css
/* ---- The deck ---- */
.deck { position: relative; width: min(240px, 66%); justify-self: start; }

/* The platter is a square box around the vinyl and nothing else. The glow is
   sized as a percentage of its parent, so it has to hang off a box that is
   exactly the record — hanging it off .deck put it 17px off-centre once
   already, and .deck is now taller than the record because the picker is in it. */
.deck__platter { position: relative; aspect-ratio: 1; }
.deck__platter::before {
  content: ""; position: absolute; z-index: 0;
  top: -25%; left: -25%; width: 150%; height: 150%;
  background: radial-gradient(circle at 50% 50%, rgba(199, 125, 255, 0.30), rgba(199, 125, 255, 0) 60%);
  filter: blur(6px); pointer-events: none;
}
```

Delete the old `.deck::before` rule entirely. Update the breathing animation at `style.css:749` to match:

```css
  .deck__platter::before { animation: breathe 6.5s ease-in-out infinite; }
```

- [ ] **Step 3: The pause glyph**

Add after the `.record__side` rule:

```css
/* The transport. The centre has always toggled pause; nothing ever said so.
   At rest the label is the track name; approach it and the name dims under a
   pause bar, so the control announces itself exactly when it might be wanted. */
.record__glyph {
  position: absolute; inset: 0; display: grid; place-items: center;
  opacity: 0; transition: opacity .18s ease;
  pointer-events: none;
}
.record__glyph::before {
  content: ""; display: block;
  width: 0.34em; height: 1.1em; font-size: clamp(.7rem, 1.7vw, 1rem);
  border-left: 0.34em solid var(--ground);
  border-right: 0.34em solid var(--ground);
  box-sizing: content-box; width: 0.34em;
}
/* Stopped: a play triangle, because the action on offer has changed. */
.record.is-stopped .record__glyph::before {
  width: 0; height: 0; border: 0;
  border-left: 0.9em solid var(--ground);
  border-top: 0.55em solid transparent;
  border-bottom: 0.55em solid transparent;
  margin-left: 0.2em;   /* a triangle looks off-centre when it is centred */
}
.record__label { transition: opacity .18s ease; }
.record:hover .record__title,
.record:hover .record__side,
.record:focus-visible .record__title,
.record:focus-visible .record__side { opacity: .18; }
.record:hover .record__glyph,
.record:focus-visible .record__glyph { opacity: 1; }

/* Touch has no hover, so a hover-only affordance is invisible on every phone.
   There the glyph simply lives in the label. */
@media (hover: none) {
  .record__glyph { opacity: .55; }
  .record:hover .record__title, .record:hover .record__side { opacity: 1; }
  .record__title { opacity: .9; }
}
```

- [ ] **Step 4: The picker**

Add after the `.deck__hint` rules:

```css
/* ---- The picker ---- */
.picker { list-style: none; margin: .95rem 0 0; padding: 0; }
.picker__item + .picker__item { border-top: 1px solid var(--line); }
.picker__btn {
  display: grid; grid-template-columns: auto 1fr; align-items: center; gap: .55rem;
  width: 100%; padding: .42rem .2rem; margin: 0;
  border: 0; background: none; font: inherit; text-align: left; color: inherit;
  cursor: pointer; transition: background-color .18s ease, padding-left .25s var(--ease);
}
.picker__btn:hover { background: rgba(199, 125, 255, .07); padding-left: .5rem; }
.picker__text { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; }
.picker__title {
  font-size: .78rem; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.picker__artist {
  font-family: var(--mono); font-size: .64rem; color: var(--muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* The mark is the needle: an outline when idle, filled while playing. Plum,
   not pop — the magenta on this page means "past its own speed" and nothing
   else. */
.picker__mark {
  width: 9px; height: 9px; border-radius: 50%;
  border: 1.5px solid var(--muted); background: transparent;
  transition: background-color .18s ease, border-color .18s ease;
}
.picker__btn[aria-pressed="true"] .picker__mark { background: var(--plum); border-color: var(--plum); }
.picker__btn[aria-pressed="true"] .picker__title { color: var(--plum); }
/* Loading says so in words rather than animating. The only `pulse` keyframe in
   this file glows `--pop`, which is reserved for "past its own speed", and it
   is declared inside a prefers-reduced-motion block so it would do nothing for
   the visitors most likely to need the feedback. */
.picker__btn[data-state="loading"] .picker__mark { border-color: var(--plum); }
.picker__btn[data-state="loading"] .picker__artist::after { content: "  b7 loading"; }
.picker__btn[data-state="failed"] { cursor: not-allowed; }
.picker__btn[data-state="failed"] .picker__title { color: var(--muted); text-decoration: line-through; }
.picker__btn[data-state="failed"] .picker__artist::after { content: "  b7 unavailable"; }

/* Mute. Quiet by default — it is a safety rail, not a feature to advertise. */
.mute {
  display: flex; align-items: center; gap: .45rem;
  margin-top: .55rem; padding: .3rem .2rem;
  border: 0; background: none; cursor: pointer;
  font-family: var(--mono); font-size: .64rem; letter-spacing: .06em;
  color: var(--muted); transition: color .18s ease;
}
.mute:hover { color: var(--ink); }
.mute__mark {
  width: 9px; height: 9px; border-radius: 1px;
  background: var(--plum); transition: background-color .18s ease;
}
.mute[aria-pressed="true"] .mute__mark { background: transparent; box-shadow: inset 0 0 0 1.5px var(--muted); }
```

- [ ] **Step 5: Credits and exam rows become plain**

The credit buttons and the `.rec__cue` button are both gone. Move `.rec__cue`'s layout onto `.rec` itself and drop the interactive states:

```css
.ledger__list { list-style: none; margin: 0; padding: 0; }
.rec {
  border-top: 1px solid var(--line);
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.85rem;
  padding: 0.78rem 0.25rem;
}
```

Delete the `.rec__cue`, `.rec__cue:hover` and `.rec__cue[aria-pressed="true"]` rules.

Replace the `.credit` rules with a plain-text style:

```css
.credit { color: inherit; }
```

Delete `.credit:hover` and `.credit[aria-pressed="true"]`.

In `index.html`, the credits become spans:

```html
      <p class="credit-label">On heavy rotation</p>
      <ul class="credits">
        <li><span class="credit">Hiromi Uehara</span></li>
        <li><span class="credit">Erroll Garner</span></li>
        <li><span class="credit">Bill Evans</span></li>
        <li><span class="credit">Anomalie</span></li>
        <li><span class="credit">insaneintherain</span></li>
      </ul>
```

Note the label copy loses "— pick one to put it on the record", which is no longer true.

- [ ] **Step 6: Needle cursor over the label**

At `style.css:726`, add a state so the pointer agrees with the affordance:

```css
  .needle.is-record { --ns: .55; background: var(--plum); border-color: var(--plum); }
  .needle.is-label  { --ns: .3;  background: var(--ink); border-color: var(--ink); }
```

- [ ] **Step 7: Run the tests and commit**

Run: `npm test`
Expected: PASS, 97 tests (this task is markup and CSS; nothing new to assert in Node — Task 10 verifies it in a browser).

```bash
git add index.html style.css
git commit -m "feat: picker under the record, and a visible pause in its centre

The glow moves from .deck to a new square .deck__platter. It is sized in
percentages of its parent, and .deck is about to be much taller than the
record — the same mistake that once left it 17px off-centre.

Credits and exam rows lose their buttons; the record's label is the only
thing that names what is playing."
```

---

### Task 9: Wire it up

**Files:**
- Modify: `js/main.js:1-8` (imports), `js/main.js:26-56` (deck + cue wiring), `js/main.js:340-355` (frame loop)

**Interfaces:**
- Consumes: everything from Tasks 1-8
- Produces: a working feature

- [ ] **Step 1: Replace the cue-button wiring with the picker**

In `js/main.js`, add the imports:

```js
import { TRACKS, trackPickerHTML } from "../tracks.js";
import { createDeckAudio } from "./audio/deck-audio.js";
```

Delete the whole `cueButtons` block (`js/main.js:44-56`) and put this after the `createDeck` call:

```js
// ---------------------------------------------------------------- the music

const audio = createDeckAudio({
  onState({ id, status }) {
    const btn = pickerButtons.find((b) => b.dataset.track === id);
    if (!btn) return;
    btn.dataset.state = status;
    btn.setAttribute("aria-pressed", String(status === "playing"));
    if (status === "failed") btn.disabled = true;
  },
});

let pickerButtons = [];
let playing = null;

// No picker at all where there is no AudioWorklet: a list of tracks that
// cannot play is worse than a record that was only ever a picture.
if (audio.isSupported()) {
  document.getElementById("track-picker").innerHTML = trackPickerHTML(TRACKS);
  pickerButtons = [...document.querySelectorAll(".picker__btn")];

  for (const btn of pickerButtons) {
    btn.addEventListener("click", () => {
      const track = TRACKS.find((t) => t.id === btn.dataset.track);
      if (!track) return;

      if (playing === track.id) {          // pressing the playing one lifts the needle
        playing = null;
        audio.stop();
        deck.cue(null);
        for (const b of pickerButtons) b.setAttribute("aria-pressed", "false");
        return;
      }

      playing = track.id;
      for (const b of pickerButtons) {
        b.setAttribute("aria-pressed", "false");
        if (b !== btn) delete b.dataset.state;
      }
      deck.cue(track.title, track.artist);
      // A stopped record is silent by design, so a track picked while it is
      // stopped would play nothing and say nothing. Drop the needle and start
      // the platter. This is also the reduced-motion path, where it starts still.
      deck.setPaused(false);
      kick();
      audio.load(track);
    });
  }
}
```

`kick()` is declared later in the file with `function kick()`, so it is hoisted and safe to call here.

Then the mute toggle, still inside the `if (audio.isSupported())` block:

```js
  const muteBtn = document.getElementById("mute");
  muteBtn.hidden = false;
  muteBtn.addEventListener("click", () => {
    const next = muteBtn.getAttribute("aria-pressed") !== "true";
    muteBtn.setAttribute("aria-pressed", String(next));
    muteBtn.querySelector(".mute__label").textContent = next ? "Sound off" : "Sound on";
    audio.setMuted(next);
  });
```

Muting leaves the record turning and the needle tracking, so unmuting lands
where the music would have been — the same thing a volume knob does, and the
opposite of what stopping does.

- [ ] **Step 2: Feed the engine from the frame loop**

In `frame()`, after `deck.step(dt)`:

```js
  deck.step(dt);
  // The record is the clock. Everything the audio does — pitch, reverse,
  // silence at a standstill — follows from this one line.
  audio.setTurns(deck.state.turns);
```

- [ ] **Step 3: Keep the loop alive while music plays**

The loop idles itself under reduced motion when nothing is moving. A playing record must keep it running, or the target messages stop and the audio drifts to a halt. Change the tail of `frame()`:

```js
  if (!reduced || deck.isBusy() || playing) raf = requestAnimationFrame(frame);
  else raf = 0;
```

- [ ] **Step 4: Verify by hand in a browser**

```bash
python -m http.server 8777
```

Open `http://localhost:8777/`, pick a track, confirm sound, drag the record backwards, confirm it scratches, click the centre, confirm it stops.

- [ ] **Step 5: Run the tests and commit**

Run: `npm test`
Expected: PASS, 97 tests.

```bash
git add js/main.js
git commit -m "feat: wire the picker, the record, and the audio together

The frame loop hands the record's rotation to the engine once per frame;
everything the audio does follows from that. Picking a track also starts
a stopped record, since a stopped record is silent by design and would
otherwise play nothing with nothing on screen explaining why."
```

---

### Task 10: Measured verification, then docs

The evidence for this feature is partly an absence — no flutter, no click, no drift. **A no-op and a pass look identical here**, so verify by measurement, not by eye or ear.

**Files:**
- Modify: `README.md`, `PRODUCT.md`, `DESIGN.md`

- [ ] **Step 1: Instrument, measure, and record the numbers**

Serve locally, then in the browser console (or via devtools automation) capture the worklet telemetry. Add a temporary `window.__deck = { audio, deck }` if needed, and **remove it before committing**.

Assert all of:

| Check | Threshold |
|---|---|
| Idle rate spread over ~2s | < 0.02 (the spike measured 0.095 without the audio-clock fix) |
| Head position advance at idle | ≈ 44100 samples/sec in a 44.1kHz context |
| Backward drag | reported head goes negative while RMS stays > 0.1 |
| Held still | RMS < 0.02 |
| Console messages | zero |
| A 404 track | that row reads "unavailable", page still works |

If the idle spread is not under 0.02, **stop** — the audio-clock anchoring in Task 3 is not doing its job, and shipping it means shipping audible wow.

- [ ] **Step 2: Re-verify on the live URL**

```bash
git push origin main
gh api repos/kwhan1115/kwhan1115.github.io/pages/builds/latest --jq '.status'
```

Wait for `built`, then repeat the idle-spread and reverse-drag measurements against `https://kwhan1115.github.io/`. A local pass is not a live pass — the worklet is loaded from a Blob URL and the assets are served by a different host.

- [ ] **Step 3: Update the docs**

- `README.md` — a line on how to add a track (one entry in `tracks.js`, one file in `assets/audio/`).
- `PRODUCT.md` — the record plays; the picker is the way in; the credits list is no longer interactive.
- `DESIGN.md` — the record is now an instrument as well as an image; the centre label is the transport; the magenta rule still holds and the picker uses plum.

- [ ] **Step 4: Commit**

```bash
git add README.md PRODUCT.md DESIGN.md
git commit -m "docs: record the turntable audio feature

Adding a track is one line in tracks.js plus one file in assets/audio."
git push origin main
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: manifest → 5, `turns` → 1, mapping → 2, DSP → 3, engine → 4, deck/transport → 6, UI → 8, wiring → 9, error handling → 4 and 8, accessibility → 8, testing → every task, asset pipeline → 5, verification → 10. The spec's `js/deck.test.js` requirement is met as a pure `pressIntent` rather than a DOM test, because the repo has no jsdom and adding one would break the zero-dependency constraint.

**Two design decisions the spec did not anticipate, both recorded above:**

1. **The playback origin.** The record has been turning since page load, so its rotation count is meaningless to a track that just went on. Without an anchor the needle would drop megasamples into the buffer and the chase would run at the clamp for seconds. Task 4 captures `origin` at load.
2. **The glow.** `.deck::before` is sized in percentages of `.deck`, and the picker makes `.deck` much taller than the record. Task 8 moves it to a square `.deck__platter`. `style.css:332` records that this exact bug already happened once.

**A third problem caught on review, now fixed:** the picker's loading state
originally reused the `pulse` keyframe. That animates `box-shadow: var(--pop)` —
the magenta this page reserves for "running past its own speed" — and it is
declared inside a `prefers-reduced-motion: no-preference` block, so it would
have been inert for exactly the visitors who most need clear state feedback.
Loading now says "loading" in words.

**Known gaps, deliberate:** none. The mute control the spec's accessibility
section requires is built in Tasks 8 and 9.
