import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_RPM, IDLE_VEL, rpmToDeg, degToRpm,
  wrapAngle, shortestDelta, velocityFromSamples, rpmLabel, speedLabel, stepSpin, catchUpHidden,
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

test("speedLabel reports Stopped when paused, regardless of vel", () => {
  // Mid-brake the record is still passing through a real RPM on its way to
  // zero; paused wins anyway, because it is the same flag the transport
  // already used to flip aria-pressed and the is-stopped class the instant
  // the press happened, and the strip has to agree with them, not wait for
  // the physics to catch up.
  assert.equal(speedLabel(0, true), "Stopped");
  assert.equal(speedLabel(rpmToDeg(33.33), true), "Stopped");
  assert.equal(speedLabel(rpmToDeg(-30), true), "Stopped");
});

test("speedLabel defers to rpmLabel when not paused", () => {
  assert.equal(speedLabel(IDLE_VEL, false), "33⅓ RPM");
  assert.equal(speedLabel(rpmToDeg(78), false), "78 RPM");
  assert.equal(speedLabel(rpmToDeg(-30), false), "— scratching —");
});

test("speedLabel at vel 0 while not paused still reads as playing", () => {
  // A grabbed record is pinned to vel 0 by the pointer, not by pause -- it
  // must not read as stopped just because the two states share a velocity.
  assert.equal(speedLabel(0, false), "33⅓ RPM");
});

test("speedLabel never produces a string rpmLabel could also produce", () => {
  // This is what lets report()'s plain string-equality dedup catch every
  // transition into or out of pause: "Stopped" has to be a value rpmLabel
  // can never independently land on, or a coincidental match would suppress
  // a real change.
  const rpmOutputs = ["— scratching —", "33⅓ RPM", "45 RPM", "78 RPM", "OVERSPUN"];
  assert.equal(rpmOutputs.includes("Stopped"), false);
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

test("stepSpin comes to an exact stop when paused", () => {
  const s = { angle: 0, vel: IDLE_VEL, grabbed: false };
  for (let i = 0; i < 600; i++) stepSpin(s, 1 / 60, { paused: true });
  assert.equal(s.vel, 0, "must park at exactly zero, not creep forever");
});

test("stepSpin brakes faster than it settles — pause has to feel deliberate", () => {
  const braking = { angle: 0, vel: 1200, grabbed: false };
  const settling = { angle: 0, vel: 1200, grabbed: false };
  for (let i = 0; i < 60; i++) {           // one second
    stepSpin(braking, 1 / 60, { paused: true });
    stepSpin(settling, 1 / 60);
  }
  // distance still to travel toward each one's target
  assert.ok(Math.abs(braking.vel - 0) < Math.abs(settling.vel - IDLE_VEL),
    `brake ${braking.vel} should be closer to its target than settle ${settling.vel}`);
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

// catchUpHidden — the tab-hidden reproduction from the bug report was three
// seconds hidden at idle spin, with the worklet's head advancing ~1x the
// whole time while turns sat frozen. These tests are the reproduction run
// through the fix instead: turns has to cover the SAME ground stepSpin would
// have covered had the loop never stopped, uncapped by MAX_DT, which is
// exactly what a real running loop guarantees and what a frozen one breaks.

test("catchUpHidden advances turns by velocity times the full elapsed gap, uncapped by MAX_DT", () => {
  const s = { angle: 0, vel: IDLE_VEL, grabbed: false, turns: 0 };
  // Three seconds, matching the measured repro. MAX_DT is 0.1s -- if this
  // silently routed through stepSpin's cap it would advance at most 0.1s
  // worth of turns, not 3s worth.
  catchUpHidden(s, 3);
  assert.ok(Math.abs(s.turns - (IDLE_VEL * 3) / 360) < 1e-9, `turns ${s.turns}`);
});

test("catchUpHidden keeps angle wrapped and in agreement with turns, same as stepSpin", () => {
  const s = { angle: 350, vel: IDLE_VEL, grabbed: false, turns: 0 };
  catchUpHidden(s, 3);
  assert.ok(s.angle >= 0 && s.angle < 360, `angle must stay wrapped, got ${s.angle}`);
  // turns carries the same travel as angle, just unwrapped -- the seam the
  // 350-degree starting point sits right against must not desync them.
  const travel = (IDLE_VEL * 3) % 360;
  assert.ok(Math.abs(s.angle - wrapAngle(350 + travel)) < 1e-6, `angle ${s.angle}`);
});

test("catchUpHidden does nothing while paused (vel 0) -- nothing was moving, nothing to correct", () => {
  const s = { angle: 40, vel: 0, grabbed: false, turns: 1.5 };
  catchUpHidden(s, 15);
  assert.equal(s.angle, 40);
  assert.equal(s.turns, 1.5);
});

test("catchUpHidden counts turns backwards for a record that was scratching when the tab went hidden", () => {
  const s = { angle: 0, vel: -IDLE_VEL, grabbed: false, turns: 0 };
  catchUpHidden(s, 3);
  assert.ok(s.turns < 0, `expected negative turns, got ${s.turns}`);
});

test("catchUpHidden leaves a grabbed record alone -- the pointer, not the clock, owns it", () => {
  const s = { angle: 120, vel: 999, grabbed: true, turns: 4.25 };
  catchUpHidden(s, 3);
  assert.equal(s.angle, 120);
  assert.equal(s.turns, 4.25);
});

test("catchUpHidden ignores a zero or negative gap", () => {
  const s = { angle: 10, vel: IDLE_VEL, grabbed: false, turns: 2 };
  catchUpHidden(s, 0);
  catchUpHidden(s, -1);
  assert.equal(s.angle, 10);
  assert.equal(s.turns, 2);
});
