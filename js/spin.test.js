import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_RPM, IDLE_VEL, rpmToDeg, degToRpm,
  wrapAngle, shortestDelta, velocityFromSamples, rpmLabel, stepSpin,
} from "./spin.js";

test("rpm and degrees-per-second convert both ways", () => {
  assert.equal(rpmToDeg(1), 6);
  assert.equal(degToRpm(6), 1);
  assert.ok(Math.abs(IDLE_VEL - rpmToDeg(IDLE_RPM)) < 1e-9);
});

test("wrapAngle keeps angles in [0, 360)", () => {
  assert.equal(wrapAngle(0), 0);
  assert.equal(wrapAngle(359), 359);
  assert.equal(wrapAngle(360), 0);
  assert.equal(wrapAngle(370), 10);
  assert.equal(wrapAngle(-10), 350);
  assert.equal(wrapAngle(-730), 350);
});

test("shortestDelta takes the short way round the circle", () => {
  assert.equal(shortestDelta(10, 20), 10);
  assert.equal(shortestDelta(20, 10), -10);
  // 350 -> 10 is +20 forward, not -340
  assert.equal(shortestDelta(350, 10), 20);
  // 10 -> 350 is -20 backward, not +340
  assert.equal(shortestDelta(10, 350), -20);
});

test("velocityFromSamples returns degrees per second over the sample window", () => {
  // 90 degrees in 0.5s -> 180 deg/s
  const v = velocityFromSamples([
    { angle: 0, t: 0 },
    { angle: 45, t: 250 },
    { angle: 90, t: 500 },
  ]);
  assert.ok(Math.abs(v - 180) < 1e-6, `expected ~180, got ${v}`);
});

test("velocityFromSamples goes negative when dragged backwards", () => {
  const v = velocityFromSamples([
    { angle: 90, t: 0 },
    { angle: 0, t: 500 },
  ]);
  assert.ok(v < 0, `expected negative, got ${v}`);
  assert.ok(Math.abs(v + 180) < 1e-6);
});

test("velocityFromSamples unwraps across the 0/360 seam", () => {
  // 350 -> 10 across the seam is +20 degrees, not -680
  const v = velocityFromSamples([
    { angle: 350, t: 0 },
    { angle: 10, t: 1000 },
  ]);
  assert.ok(Math.abs(v - 20) < 1e-6, `expected ~20, got ${v}`);
});

test("velocityFromSamples is 0 for degenerate input", () => {
  assert.equal(velocityFromSamples([]), 0);
  assert.equal(velocityFromSamples([{ angle: 5, t: 10 }]), 0);
  // zero elapsed time must not divide by zero
  assert.equal(velocityFromSamples([{ angle: 0, t: 7 }, { angle: 90, t: 7 }]), 0);
});

test("velocityFromSamples ignores samples older than the window", () => {
  // the ancient sample would drag the average down if it counted
  const v = velocityFromSamples([
    { angle: 0, t: 0 },
    { angle: 0, t: 5000 },
    { angle: 170, t: 5500 },
  ], 600);
  assert.ok(Math.abs(v - 340) < 1e-6, `expected ~340, got ${v}`);
});

test("rpmLabel names the real record speeds", () => {
  assert.equal(rpmLabel(rpmToDeg(33.33)), "33⅓ RPM");
  assert.equal(rpmLabel(rpmToDeg(45)), "45 RPM");
  assert.equal(rpmLabel(rpmToDeg(78)), "78 RPM");
});

test("rpmLabel reports scratching only for meaningful reverse spin", () => {
  assert.equal(rpmLabel(rpmToDeg(-30)), "— scratching —");
  // a hair below zero is drift, not a scratch
  assert.equal(rpmLabel(rpmToDeg(-0.5)), "33⅓ RPM");
});

test("rpmLabel tops out rather than inventing a speed", () => {
  assert.equal(rpmLabel(rpmToDeg(400)), "OVERSPUN");
});

test("stepSpin advances the angle by velocity and wraps", () => {
  const s = { angle: 350, vel: 200, grabbed: false };
  stepSpin(s, 0.1);
  // 350 + 20 = 370 -> 10
  assert.ok(Math.abs(s.angle - 10) < 1e-6, `got ${s.angle}`);
});

test("stepSpin decays a thrown record back toward idle", () => {
  const s = { angle: 0, vel: IDLE_VEL * 6, grabbed: false };
  for (let i = 0; i < 600; i++) stepSpin(s, 1 / 60);
  assert.ok(Math.abs(s.vel - IDLE_VEL) < 1, `expected ~idle, got ${s.vel}`);
});

test("stepSpin brings a reversed record back to forward idle", () => {
  const s = { angle: 0, vel: -900, grabbed: false };
  for (let i = 0; i < 600; i++) stepSpin(s, 1 / 60);
  assert.ok(s.vel > 0, `expected forward spin, got ${s.vel}`);
  assert.ok(Math.abs(s.vel - IDLE_VEL) < 1);
});

test("stepSpin decays toward a full stop when paused", () => {
  const s = { angle: 0, vel: IDLE_VEL, grabbed: false };
  for (let i = 0; i < 600; i++) stepSpin(s, 1 / 60, { paused: true });
  assert.ok(Math.abs(s.vel) < 0.5, `expected ~0, got ${s.vel}`);
});

test("stepSpin leaves a grabbed record alone — the pointer drives it", () => {
  const s = { angle: 120, vel: 999, grabbed: true };
  stepSpin(s, 1 / 60);
  assert.equal(s.angle, 120);
  assert.equal(s.vel, 999);
});

test("stepSpin is frame-rate independent", () => {
  const slow = { angle: 0, vel: 1200, grabbed: false };
  const fast = { angle: 0, vel: 1200, grabbed: false };
  for (let i = 0; i < 30; i++) stepSpin(slow, 1 / 30);
  for (let i = 0; i < 120; i++) stepSpin(fast, 1 / 120);
  assert.ok(Math.abs(slow.vel - fast.vel) < 2, `${slow.vel} vs ${fast.vel}`);
});

test("stepSpin survives a zero or negative frame time without NaN", () => {
  const s = { angle: 42, vel: 300, grabbed: false };
  stepSpin(s, 0);
  stepSpin(s, -1);
  assert.ok(Number.isFinite(s.angle));
  assert.ok(Number.isFinite(s.vel));
  assert.equal(s.angle, 42);
});

test("stepSpin clamps an absurd frame time (tab was backgrounded)", () => {
  const s = { angle: 0, vel: 4000, grabbed: false };
  stepSpin(s, 30); // 30 seconds between frames
  assert.ok(Number.isFinite(s.angle) && Number.isFinite(s.vel));
  assert.ok(s.vel < 4000, "velocity should have decayed, not exploded");
});
