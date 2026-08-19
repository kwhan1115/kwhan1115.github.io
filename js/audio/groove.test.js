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
