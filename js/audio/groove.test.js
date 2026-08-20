import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECONDS_PER_TURN, MAX_RATE, samplesFromTurns, clampRate, rateFromVel,
  turnsFromSamples, shouldReanchor, REANCHOR_GAP_SECONDS,
} from "./groove.js";
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

test("rateFromVel is exactly 1 at IDLE_VEL", () => {
  // The same tuning fact as samplesFromTurns's idle-spin test, run from
  // velocity instead of position: idle spin has to seed the worklet at
  // real-time speed, or every track would start audibly off from frame one.
  assert.ok(Math.abs(rateFromVel(IDLE_VEL) - 1) < 1e-12);
});

test("rateFromVel is 0 for a held-still record and negative running backwards", () => {
  assert.equal(rateFromVel(0), 0);
  assert.ok(rateFromVel(-IDLE_VEL) < 0);
});

test("rateFromVel scales linearly with velocity", () => {
  assert.ok(Math.abs(rateFromVel(IDLE_VEL * 2) - 2) < 1e-12);
  assert.ok(Math.abs(rateFromVel(IDLE_VEL / 2) - 0.5) < 1e-12);
});

test("turnsFromSamples is the exact inverse of samplesFromTurns", () => {
  for (const turns of [0, 1, -2, 4.25, 133664 / (SECONDS_PER_TURN * 44100)]) {
    const samples = samplesFromTurns(turns, 44100);
    assert.ok(Math.abs(turnsFromSamples(samples, 44100) - turns) < 1e-9,
      `round-trip failed for ${turns} turns`);
  }
});

// shouldReanchor — the tab-hidden bug this exists as a backstop for produced
// a 133,664-sample gap after just three seconds hidden (the measured repro).
// These tests are the decision boundary itself: small gaps (telemetry
// staleness, ordinary chase residual) must chase; gaps on the order of what
// even a brief freeze produces must re-anchor instead.

test("shouldReanchor lets an ordinary telemetry-staleness gap chase", () => {
  // The worklet reports at most every 2400 samples (~54ms at 44.1kHz) --
  // comfortably smaller than the threshold with room to spare.
  assert.equal(shouldReanchor(100000, 100000 - 2400, 44100), false);
});

test("shouldReanchor lets ordinary chase residual chase", () => {
  // chase=50000 keeps in-flight residual on the order of ~800 samples even
  // during an active scratch (scratch-worklet.js's own chase comment: ~0.016
  // of rate spread times chase). This must never trip mid-gesture.
  assert.equal(shouldReanchor(100000, 100000 - 5000, 44100), false);
});

test("shouldReanchor re-anchors a gap the size of the real measured repro", () => {
  // Three seconds hidden at ~1x produced a 133,664-sample gap in the actual
  // browser measurement this fix was built against.
  assert.equal(shouldReanchor(133664, 0, 44100), true);
});

test("shouldReanchor's threshold sits exactly at REANCHOR_GAP_SECONDS of audio", () => {
  const sr = 44100;
  const edge = REANCHOR_GAP_SECONDS * sr;
  assert.equal(shouldReanchor(edge, 0, sr), false, "exactly at the threshold must not trip it");
  assert.equal(shouldReanchor(edge + 1, 0, sr), true, "one sample past it must");
});

test("shouldReanchor doesn't care which side of the gap the head is on", () => {
  // The record's computed target can be either ahead of or behind the
  // worklet's real head depending on which clock got stuck -- only the
  // magnitude of the disagreement matters.
  assert.equal(shouldReanchor(0, 200000, 44100), true);
  assert.equal(shouldReanchor(200000, 0, 44100), true);
});

test("shouldReanchor treats a non-finite target or cur as false, never as a reason to move origin", () => {
  // origin feeds every future setTurns call -- moving it off a NaN or
  // Infinity input would poison every position after it, the same failure
  // mode setTurns's own Number.isFinite guard exists to prevent.
  assert.equal(shouldReanchor(NaN, 0, 44100), false);
  assert.equal(shouldReanchor(0, NaN, 44100), false);
  assert.equal(shouldReanchor(Infinity, 0, 44100), false);
});
