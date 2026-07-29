// Scroll maths for the waveform progress bar, the nav's active section, and
// reveal timing. Pure — the DOM wiring that consumes these lives in main.js.
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

// Deterministic 0–1 noise. The waveform has to look sampled rather than
// generated, but it must also be identical on every load and every resize —
// a bar that changes height when you rotate your phone reads as a glitch.
function texture(n) {
  const x = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Bar heights (0–1) for the waveform progress bar.
 *
 * The shape is the page's own: each band is a section, and its amplitude is
 * how much of the document that section takes up. Longer sections read louder,
 * so the waveform is a picture of this page rather than decorative noise.
 *
 * `bands` are { start, end } document offsets in order. Bars falling outside
 * every band (rounding at the very end) inherit the last band's amplitude.
 */
export function waveHeights(bands, docHeight, barCount) {
  if (!(barCount > 0)) return [];
  if (!Array.isArray(bands) || bands.length === 0 || !(docHeight > 0)) {
    return Array.from({ length: barCount }, () => 0.12);
  }

  const longest = Math.max(...bands.map((b) => b.end - b.start), 1e-9);
  const amplitudes = bands.map((b) => 0.4 + 0.6 * ((b.end - b.start) / longest));

  return Array.from({ length: barCount }, (_, i) => {
    const pos = ((i + 0.5) / barCount) * docHeight;
    let band = bands.findIndex((b) => pos >= b.start && pos < b.end);
    if (band === -1) band = pos < bands[0].start ? 0 : bands.length - 1;
    const h = amplitudes[band] * (0.32 + 0.68 * texture(i));
    // Real audio rarely flatlines, and a bar shorter than it is wide stops
    // reading as a bar at all.
    return Math.min(1, Math.max(0.24, h));
  });
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
