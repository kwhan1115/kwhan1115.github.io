import { test } from "node:test";
import assert from "node:assert/strict";
import { scrollProgress, activeSection, staggerDelays, waveHeights } from "./scroll.js";

test("scrollProgress runs 0 to 1 across the scrollable range", () => {
  // 3000px document, 1000px viewport -> 2000px of travel
  assert.equal(scrollProgress(0, 3000, 1000), 0);
  assert.equal(scrollProgress(1000, 3000, 1000), 0.5);
  assert.equal(scrollProgress(2000, 3000, 1000), 1);
});

test("scrollProgress clamps past both ends (rubber-band scrolling)", () => {
  assert.equal(scrollProgress(-200, 3000, 1000), 0);
  assert.equal(scrollProgress(9999, 3000, 1000), 1);
});

test("scrollProgress is 0 when the page does not scroll", () => {
  assert.equal(scrollProgress(0, 800, 1000), 0);
  assert.equal(scrollProgress(0, 1000, 1000), 0);
});

const opts = (scrollY, extra = {}) => ({ scrollY, viewportH: 1000, docHeight: 5000, ...extra });

test("activeSection picks the last section above the reading line", () => {
  const tops = [0, 1200, 2400, 3600];
  // reading line sits at scrollY + 35% of viewport = scrollY + 350
  assert.equal(activeSection(tops, opts(0)), 0);
  assert.equal(activeSection(tops, opts(900)), 1);   // line 1250 >= 1200
  assert.equal(activeSection(tops, opts(2100)), 2);  // line 2450 >= 2400
});

test("activeSection resolves an exact hit to the newer section", () => {
  const tops = [0, 1000, 2000];
  // line lands exactly on the second section's top
  assert.equal(activeSection(tops, opts(650)), 1);
});

test("activeSection holds the first section while scrolled above everything", () => {
  const tops = [900, 1800];
  assert.equal(activeSection(tops, opts(0)), 0);
});

test("activeSection snaps to the last section at the bottom of the page", () => {
  const tops = [0, 1200, 2400, 4800];
  // the final section is too short to ever cross the reading line
  assert.equal(activeSection(tops, opts(4000)), 3);
});

test("activeSection returns -1 when there are no sections", () => {
  assert.equal(activeSection([], opts(500)), -1);
});

test("staggerDelays spaces children out in order", () => {
  assert.deepEqual(staggerDelays(4, 60), [0, 60, 120, 180]);
  assert.deepEqual(staggerDelays(1, 60), [0]);
  assert.deepEqual(staggerDelays(0, 60), []);
});

const bands = [
  { start: 0, end: 1000 },    // short
  { start: 1000, end: 5000 }, // long
  { start: 5000, end: 6000 }, // short
];

test("waveHeights returns one bar per request, all in range", () => {
  const h = waveHeights(bands, 6000, 64);
  assert.equal(h.length, 64);
  for (const v of h) assert.ok(v >= 0.1 && v <= 1, `bar out of range: ${v}`);
});

test("waveHeights is identical on every call — a resize must not reshuffle it", () => {
  assert.deepEqual(waveHeights(bands, 6000, 40), waveHeights(bands, 6000, 40));
});

test("waveHeights makes longer sections louder", () => {
  const h = waveHeights(bands, 6000, 120);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const shortBars = h.slice(0, 20);   // first band, 1000 tall
  const longBars = h.slice(20, 100);  // second band, 4000 tall
  assert.ok(mean(longBars) > mean(shortBars),
    `long band ${mean(longBars)} should out-amplitude short band ${mean(shortBars)}`);
});

test("waveHeights varies bar to bar rather than drawing a flat block", () => {
  const h = waveHeights(bands, 6000, 60);
  assert.ok(new Set(h.map((v) => v.toFixed(3))).size > 30, "waveform is too uniform to read as audio");
});

test("waveHeights survives having nothing to describe", () => {
  assert.deepEqual(waveHeights([], 6000, 3), [0.12, 0.12, 0.12]);
  assert.deepEqual(waveHeights(bands, 0, 3), [0.12, 0.12, 0.12]);
  assert.deepEqual(waveHeights(bands, 6000, 0), []);
});

test("waveHeights places a bar past the last band without falling over", () => {
  const h = waveHeights([{ start: 0, end: 100 }], 1000, 8);
  assert.equal(h.length, 8);
  for (const v of h) assert.ok(Number.isFinite(v));
});

test("staggerDelays caps the total wait so long lists still feel prompt", () => {
  const d = staggerDelays(40, 60, 900);
  assert.equal(d.length, 40);
  assert.equal(d[0], 0);
  assert.ok(d[39] <= 900, `last delay ${d[39]} should be capped at 900`);
  // still strictly increasing, just compressed
  for (let i = 1; i < d.length; i++) assert.ok(d[i] > d[i - 1]);
});
