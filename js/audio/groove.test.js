import { test } from "node:test";
import assert from "node:assert/strict";
import { SECONDS_PER_TURN, MAX_RATE, samplesFromTurns, clampRate, rateFromVel } from "./groove.js";
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
