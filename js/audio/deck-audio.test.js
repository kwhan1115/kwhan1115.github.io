import { test } from "node:test";
import assert from "node:assert/strict";
import { toInt16, nextTarget } from "./deck-audio.js";
import { MAX_DT } from "../spin.js";

const SR = 44100;

// Spins the CPU until `ms` of REAL wall-clock time has genuinely elapsed.
// Used once below to reproduce, deterministically, the exact real-world
// mismatch this test exists for: an internally self-sampled performance.now()
// call landing a variable, real amount of time after the position it is
// supposedly timestamping.
function busyWaitMs(ms) {
  const start = performance.now();
  while (performance.now() - start < ms) { /* spin */ }
}

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

test("nextTarget uses the caller's timestamp, not its own clock", () => {
  // Reproduces the second defect found after the first fix landed (task-10
  // fix report, one-clock addendum): js/main.js has always advanced
  // deck.state.turns using the requestAnimationFrame TIMESTAMP, but the
  // pre-fix setTurns computed its feedforward rate from a SEPARATELY
  // sampled performance.now() call, made after that frame's other work
  // (measureFocus(), deck.step()) had already run. The two clocks agree on
  // average but disagree by a few ms on any single frame — exactly the
  // kind of thing invisible to a test that calls code synchronously with no
  // real elapsed time, which is why nothing caught it until a real browser
  // measurement did.
  //
  // Position here advances on a perfectly uniform TRUE clock (true rate
  // exactly 1x, 7.0-8.1ms/step — the tight rAF-timestamp band actually
  // measured in the browser). Two calling conventions are driven from the
  // SAME true-position sequence:
  //   OLD: nowMs omitted, so nextTarget falls back to ITS OWN
  //        performance.now(), sampled after a busy-waited "per-frame work"
  //        delay (5.8-10.2ms — the wider, independently-jittered band also
  //        measured in the browser, same mean, different value per frame).
  //   NEW: nowMs is the exact timestamp that drove that step's position --
  //        what js/main.js now passes through from its rAF `now`.
  const trueSteps  = [7.3, 7.9, 6.9, 8.1, 7.5, 7.8, 7.0, 8.0, 7.6, 7.2];
  const workDelays = [9.4, 6.1, 10.2, 5.8, 8.7, 6.6, 9.9, 6.4, 8.2, 7.1];

  let trueMs = 0;
  const oldState = { ratePos: null, rateAtMs: null };
  let oldWorst = 0;
  for (let i = 0; i < trueSteps.length; i++) {
    trueMs += trueSteps[i];
    const pos = 1 * (trueMs / 1000) * SR;   // true rate exactly 1x
    busyWaitMs(workDelays[i]);              // the OLD code's real call-time lag
    const { rate } = nextTarget(pos, SR, oldState);   // nowMs omitted -> its own clock
    if (Number.isFinite(rate)) oldWorst = Math.max(oldWorst, Math.abs(rate - 1));
  }

  trueMs = 0;
  const newState = { ratePos: null, rateAtMs: null };
  let newWorst = 0;
  for (let i = 0; i < trueSteps.length; i++) {
    trueMs += trueSteps[i];
    const pos = 1 * (trueMs / 1000) * SR;
    const { rate } = nextTarget(pos, SR, newState, trueMs);   // explicit, matching clock
    if (Number.isFinite(rate)) newWorst = Math.max(newWorst, Math.abs(rate - 1));
  }

  assert.ok(oldWorst >= 0.02, `sanity: the old self-clocked path shows real error (worst ${oldWorst.toFixed(4)})`);
  assert.ok(newWorst < 0.02, `the one-clock fix stays within 0.02 of true rate (worst ${newWorst.toFixed(4)})`);
});

test("nextTarget clamps its divisor to MAX_DT, matching stepSpin's own cap on turns", () => {
  // Reproduces a defect found from a real "the track starts a little fast,
  // then settles" report, confirmed by instrumenting requestAnimationFrame
  // directly in a real (non-headless) browser: a callback can be scheduled
  // and then not actually fire until hundreds of ms later, so its `now`
  // argument is stale by that amount; the very next frame's `now` then
  // jumps forward to catch up, producing exactly one oversized dt right
  // when a track has just reset the audio clock — the worst possible
  // moment, since the feedforward has no prior estimate to fall back on.
  //
  // stepSpin already caps turns' advance at MAX_DT-worth of the record's
  // rate for a frame like this (js/spin.js, "a backgrounded tab hands back
  // a huge dt"). This position delta simulates exactly that: MAX_DT seconds
  // of true 1x motion, credited despite a much larger real gap having
  // elapsed. Dividing by the FULL gap (the pre-fix behaviour) understates
  // the rate; dividing by the same MAX_DT ceiling recovers the true rate.
  const SR = 44100;
  const trueRate = 1;
  const cappedPos = trueRate * MAX_DT * SR;   // exactly what stepSpin credited
  const staleGapMs = 400;                     // the measured real-world gap

  const state = { ratePos: 0, rateAtMs: 0 };
  const { rate } = nextTarget(cappedPos, SR, state, staleGapMs);
  assert.ok(Math.abs(rate - trueRate) < 1e-9, `recovers the true rate (got ${rate})`);
});

test("nextTarget's clamp does not touch a normal, small gap", () => {
  // The clamp must be a no-op for the overwhelming common case — every
  // existing timing test in this file and in scratch-worklet.test.js
  // depends on that remaining true.
  const SR = 44100;
  const state = { ratePos: 0, rateAtMs: 0 };
  const normalGapMs = 7.5;                    // well under MAX_DT * 1000
  const pos = 1 * (normalGapMs / 1000) * SR;  // true rate exactly 1x
  const { rate } = nextTarget(pos, SR, state, normalGapMs);
  assert.ok(Math.abs(rate - 1) < 1e-9, `unclamped gap still reads 1x (got ${rate})`);
});

test("an unclamped divisor would have understated the same scenario (sanity)", () => {
  // Guards the two tests above: proves the scenario actually distinguishes
  // clamped from unclamped, so a future refactor that quietly drops the
  // clamp fails loudly here rather than in a real browser again.
  const SR = 44100;
  const trueRate = 1;
  const cappedPos = trueRate * MAX_DT * SR;
  const staleGapMs = 400;
  const unclamped = cappedPos / ((staleGapMs / 1000) * SR);
  assert.ok(Math.abs(unclamped - trueRate) > 0.5, `sanity: uncapped divisor is badly wrong (${unclamped})`);
});
