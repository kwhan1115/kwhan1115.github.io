// Spin physics for the hero record. Pure — no DOM, no time source of its own.
// The deck owns state; this module only advances it. Unit-tested in spin.test.js.
//
// Angles are degrees. Velocities are degrees per second, because that is what
// a CSS `rotate()` wants; RPM only shows up at the label boundary.

export const IDLE_RPM = 33 + 1 / 3;

export const rpmToDeg = (rpm) => rpm * 6; // 1 rpm = 360deg / 60s
export const degToRpm = (deg) => deg / 6;

export const IDLE_VEL = rpmToDeg(IDLE_RPM); // 200 deg/s

// How quickly a thrown record settles back to idle. Time constant in seconds:
// after `SETTLE` the gap to idle has shrunk to ~37% of what it was.
const SETTLE = 0.55;

// Stopping is a deliberate act, so it answers faster than a throw settles —
// otherwise pressing pause looks like nothing happened.
const BRAKE = 0.24;

// A backgrounded tab hands back a huge dt. Cap it so one frame can't teleport
// the record halfway round the label.
const MAX_DT = 0.1;

export function wrapAngle(deg) {
  const a = deg % 360;
  return a < 0 ? a + 360 : a;
}

// Signed short way from `a` to `b` — always in [-180, 180). An exact half-turn
// has no short way; it resolves backwards.
export function shortestDelta(a, b) {
  return wrapAngle(b - a + 180) - 180;
}

/**
 * Angular velocity (deg/s) implied by recent pointer samples.
 * `samples` is oldest-first: [{ angle, t }] with `t` in milliseconds.
 * Samples older than `windowMs` are dropped so a pause before release reads as
 * a gentle let-go, not as the speed from before the pause. If that leaves
 * fewer than two, the last two are used regardless of age — a slow drag still
 * deserves a velocity.
 */
export function velocityFromSamples(samples, windowMs = 500) {
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  const newest = samples[samples.length - 1];
  let used = samples.filter((s) => newest.t - s.t <= windowMs);
  if (used.length < 2) used = samples.slice(-2);

  const elapsed = (newest.t - used[0].t) / 1000;
  if (elapsed <= 0) return 0;

  // Sum short-way deltas so a drag across the 0/360 seam doesn't read as a
  // near-full rotation backwards.
  let travelled = 0;
  for (let i = 1; i < used.length; i++) travelled += shortestDelta(used[i - 1].angle, used[i].angle);
  return travelled / elapsed;
}

/** The record's speed, named the way records name speeds. */
export function rpmLabel(vel) {
  const rpm = degToRpm(vel);
  if (rpm <= -2) return "— scratching —";
  if (rpm < 40) return "33⅓ RPM";
  if (rpm < 62) return "45 RPM";
  if (rpm < 150) return "78 RPM";
  return "OVERSPUN";
}

/**
 * Advance the deck one frame, in place.
 * `state` is { angle, vel, grabbed }. `dt` is seconds.
 * While grabbed the pointer owns the angle, so physics stays out of it.
 * Otherwise velocity eases toward idle (or toward a stop when paused) on an
 * exponential curve, which makes the result frame-rate independent.
 */
export function stepSpin(state, dt, { paused = false } = {}) {
  if (state.grabbed || !(dt > 0)) return state;
  const step = Math.min(dt, MAX_DT);
  const target = paused ? 0 : IDLE_VEL;
  const tau = paused ? BRAKE : SETTLE;

  state.vel = target + (state.vel - target) * Math.exp(-step / tau);
  // Exponential decay never quite reaches zero; park it once it's under a
  // fraction of a degree per second so the loop can idle.
  if (paused && Math.abs(state.vel) < 0.4) state.vel = 0;
  state.angle = wrapAngle(state.angle + state.vel * step);
  return state;
}
