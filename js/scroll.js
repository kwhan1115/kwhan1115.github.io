// Scroll maths for the tonearm rail, the nav's active section, and reveal
// timing. Pure — the DOM wiring that consumes these lives in main.js.
// Unit-tested in scroll.test.js.

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** How far down the record we are, 0 to 1. A page that doesn't scroll is 0. */
export function scrollProgress(scrollY, docHeight, viewportH) {
  const range = docHeight - viewportH;
  if (range <= 0) return 0;
  return clamp01(scrollY / range);
}

/**
 * Index of the section currently being read.
 *
 * A section becomes active once its top crosses a reading line set a third of
 * the way down the viewport — not the very top edge, which would flip the nav
 * a beat before you can actually read anything. The last section wins at the
 * bottom of the page even if it is too short to reach that line.
 *
 * `tops` are document-space offsets, in document order. Returns -1 for none.
 */
export function activeSection(tops, { scrollY, viewportH, docHeight, line = 0.35 }) {
  if (!Array.isArray(tops) || tops.length === 0) return -1;
  if (docHeight > 0 && scrollY + viewportH >= docHeight - 2) return tops.length - 1;

  const readingLine = scrollY + viewportH * line;
  let active = 0;
  for (let i = 0; i < tops.length; i++) if (tops[i] <= readingLine) active = i;
  return active;
}

/**
 * Per-child delays (ms) for a staggered reveal.
 * `cap` compresses the spacing so a long list — nine exams, nine foods —
 * still finishes promptly instead of trickling in for two seconds.
 */
export function staggerDelays(count, step, cap) {
  if (!(count > 0)) return [];
  const span = (count - 1) * step;
  const each = cap != null && span > cap ? cap / (count - 1) : step;
  return Array.from({ length: count }, (_, i) => i * each);
}
