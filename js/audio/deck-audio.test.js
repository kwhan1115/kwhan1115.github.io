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
