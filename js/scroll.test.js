import { test } from "node:test";
import assert from "node:assert/strict";
import { scrollProgress, activeSection, staggerDelays } from "./scroll.js";

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

test("staggerDelays caps the total wait so long lists still feel prompt", () => {
  const d = staggerDelays(40, 60, 900);
  assert.equal(d.length, 40);
  assert.equal(d[0], 0);
  assert.ok(d[39] <= 900, `last delay ${d[39]} should be capped at 900`);
  // still strictly increasing, just compressed
  for (let i = 1; i < d.length; i++) assert.ok(d[i] > d[i - 1]);
});
