// Wiring. Every module below draws or reacts; none of them owns time — this
// file runs the page's single animation frame and hands out the delta.

import { EXAMS, REQUIREMENTS, renderExams } from "../exams.js";
import { scrollProgress, activeSection, waveHeights } from "./scroll.js";
import { createDeck } from "./deck.js";
import { createStage } from "./stage.js";
import { createLightbox } from "./lightbox.js";

const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;

// The head script hides everything behind `.js` until this runs. Claim it
// immediately so its safety timer doesn't undo the gate mid-setup.
root.classList.add("ready");

// ---------------------------------------------------------------- content

document.getElementById("exam-tracker").innerHTML = renderExams(EXAMS, REQUIREMENTS);
document.getElementById("year").textContent = new Date().getFullYear();

// ---------------------------------------------------------------- the deck

const nowText = document.querySelector(".cover__now-text");
const nowLine = document.querySelector(".cover__now");
const topNow = document.querySelector(".topbar__now");
const topNowText = document.querySelector(".topbar__now-text");

const deck = createDeck(document.querySelector(".record"), {
  reduced,
  onChange({ speed, title, vel }) {
    nowText.textContent = `Now playing — ${title} · ${speed}`;
    // Reserve the magenta for the one thing that's live: a record being run
    // past its own speed.
    nowLine.classList.toggle("cover__now--fast", Math.abs(vel) > 372 || vel < -12);
    const cued = title !== "Side A";
    topNow.hidden = !cued;
    if (cued) topNowText.textContent = title;
  },
});

// Any section can put a track on the record. Pressing the cued one takes it off.
const cueButtons = [...document.querySelectorAll("[data-cue]")];
for (const btn of cueButtons) {
  btn.setAttribute("aria-pressed", "false");
  btn.addEventListener("click", () => {
    const wasOn = btn.getAttribute("aria-pressed") === "true";
    for (const b of cueButtons) b.setAttribute("aria-pressed", "false");
    if (wasOn) { deck.cue(null); return; }
    btn.setAttribute("aria-pressed", "true");
    deck.cue(btn.dataset.cue, btn.dataset.sub);
  });
}

// ---------------------------------------------------------------- the stage

const canvas = document.querySelector(".stage");
const stage = reduced ? null : createStage(canvas);
const record = document.querySelector(".record");

// Called every frame, not just on scroll: the cue-up animation slides the deck
// ~100px during the first second, and a focus sampled once at startup leaves
// the groove field centred where the record used to be.
function measureFocus() {
  if (!stage) return;
  const r = record.getBoundingClientRect();
  const off = r.bottom < -200 || r.top > window.innerHeight + 200;
  stage.setFocus(off ? null : { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 });
}

// ---------------------------------------------------------------- equalizer

const bars = [...document.querySelectorAll(".eq i")];
function drawEq(vel, t) {
  const amp = Math.min(1, Math.abs(vel) / 700);
  for (let i = 0; i < bars.length; i++) {
    const f = 3 + i * 1.7;
    const wave = Math.abs(Math.sin((t / 1000) * f + i));
    bars[i].style.setProperty("--h", (0.16 + amp * (0.3 + 0.5 * wave)).toFixed(3));
  }
}

// -------------------------------------------------- waveform, nav, reveals

const cover = document.querySelector(".cover");
const blocks = [...document.querySelectorAll("main .block")];
const navLinks = [...document.querySelectorAll(".topbar__nav a")];
const indicator = document.querySelector(".topbar__ind");
const navList = document.querySelector(".topbar__nav ul");

const wave = document.querySelector(".wave");
const waveDim = wave.querySelector(".wave__bars--dim");
const waveLit = wave.querySelector(".wave__bars--lit");
const waveMarks = wave.querySelector(".wave__marks");
const waveTip = wave.querySelector(".wave__tip");
const bandNames = ["Cover", ...navLinks.map((a) => a.textContent.trim())];

let spots = [];   // document offsets: the cover, then each block
let edges = [];   // the same boundaries in progress space, 0–1
let barCount = 0;
let activeIdx = -2;

// The waveform lives on the progress axis, not the document axis, so the
// playhead and the section marks agree with each other. An edge sits where
// that section actually takes over — the same crossing the nav uses.
function measureSpots() {
  const y = window.scrollY;
  const docH = document.documentElement.scrollHeight;
  const vh = window.innerHeight;
  spots = [cover, ...blocks].map((el) => el.getBoundingClientRect().top + y);
  edges = spots.map((top) => scrollProgress(top - vh * 0.35, docH, vh));
  drawWave();
}

function drawWave() {
  const bands = edges.map((start, i) => ({ start, end: i + 1 < edges.length ? edges[i + 1] : 1 }));
  // ~5px of pitch per bar: a fixed 3px bar plus 2px of breathing room. The
  // count scales with width so the pitch stays put on a wide monitor.
  const want = Math.max(40, Math.min(1000, Math.round(wave.clientWidth / 5)));
  const heights = waveHeights(bands, 1, want);

  if (want !== barCount) {
    const bars = heights.map(() => "<i></i>").join("");
    waveDim.innerHTML = bars;
    waveLit.innerHTML = bars;
    barCount = want;
  }
  for (let i = 0; i < want; i++) {
    const h = heights[i].toFixed(3);
    waveDim.children[i].style.setProperty("--h", h);
    waveLit.children[i].style.setProperty("--h", h);
  }
  // Skip edges[0]: the start of the page is not a boundary between anything.
  waveMarks.innerHTML = edges.slice(1)
    .map((p) => `<i style="--at:${(p * 100).toFixed(2)}%"></i>`).join("");
}

// ---- scrubbing ----------------------------------------------------------

const bandAt = (p) => {
  let i = 0;
  for (let k = 0; k < edges.length; k++) if (edges[k] <= p) i = k;
  return i;
};

function seek(clientX) {
  const r = wave.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  const range = document.documentElement.scrollHeight - window.innerHeight;
  // `instant` because the page scrolls smoothly by default, and a smooth
  // animation chasing every drag frame lags behind the finger.
  window.scrollTo({ top: p * range, behavior: "instant" });
  return p;
}

function showTip(clientX) {
  const r = wave.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  wave.style.setProperty("--tip", `${(p * 100).toFixed(2)}%`);
  waveTip.textContent = bandNames[bandAt(p)] ?? "";
}

let scrubbing = false;
wave.addEventListener("pointerdown", (e) => {
  scrubbing = true;
  wave.classList.add("is-scrubbing");
  try { wave.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  seek(e.clientX);
  showTip(e.clientX);
});
wave.addEventListener("pointermove", (e) => {
  wave.classList.add("is-hover");
  showTip(e.clientX);
  if (scrubbing) seek(e.clientX);
});
wave.addEventListener("pointerleave", () => wave.classList.remove("is-hover"));
const endScrub = () => { scrubbing = false; wave.classList.remove("is-scrubbing"); };
wave.addEventListener("pointerup", endScrub);
wave.addEventListener("pointercancel", endScrub);

function moveIndicator(link) {
  if (!link) { indicator.classList.remove("is-on"); return; }
  indicator.classList.add("is-on");
  indicator.style.setProperty("--ind-w", `${link.offsetWidth}px`);
  indicator.style.setProperty("--ind-x", `${link.offsetLeft - navList.scrollLeft}px`);
}

function onScroll() {
  const y = window.scrollY;
  const vh = window.innerHeight;
  const docH = document.documentElement.scrollHeight;
  const prog = scrollProgress(y, docH, vh);

  wave.style.setProperty("--prog", prog.toFixed(4));

  // spots[0] is the cover, which owns no nav item — hence the -1.
  const idx = activeSection(spots, { scrollY: y, viewportH: vh, docHeight: docH }) - 1;
  if (idx !== activeIdx) {
    activeIdx = idx;
    navLinks.forEach((a, i) => {
      if (i === idx) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    moveIndicator(navLinks[idx]);
  }
}

navList.addEventListener("scroll", () => moveIndicator(navLinks[activeIdx]), { passive: true });
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", () => {
  stage?.resize();
  measureSpots();
  onScroll();
  measureLines();
});

// The liner note types in a line at a time, so it has to know how many lines
// it actually wraps to at this width.
const liner = document.querySelector(".liner__note");
function measureLines() {
  const lh = parseFloat(getComputedStyle(liner).lineHeight);
  if (!lh) return;
  liner.style.setProperty("--lines", String(Math.max(1, Math.round(liner.clientHeight / lh))));
}

function countUp(el) {
  const to = Number(el.dataset.to) || 0;
  const dur = 750, t0 = performance.now();
  (function frame(t) {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = String(Math.round(p * to)).padStart(2, "0");
    if (p < 1) requestAnimationFrame(frame);
  })(t0);
}

function startReveals() {
  measureSpots();
  measureLines();
  onScroll();

  if (!("IntersectionObserver" in window)) {
    blocks.forEach((b) => b.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      io.unobserve(e.target);
      if (!reduced) e.target.querySelectorAll(".ledger__num").forEach(countUp);
    }
  }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
  blocks.forEach((b) => io.observe(b));
}

// Wait for the display font before measuring: Anton is much taller than the
// fallback, so measuring early puts every section in view at once and the
// scroll reveals all fire on load.
if (document.fonts?.ready) document.fonts.ready.then(() => requestAnimationFrame(startReveals));
else window.addEventListener("load", startReveals);

// ---------------------------------------------------------------- lightbox

createLightbox(
  document.getElementById("lightbox"),
  [...document.querySelectorAll(".sheet__frame, .met__frame")],
);

// ------------------------------------------------- pointer-driven polish

// Photos: a spotlight of true colour follows the pointer across the duotone.
for (const shot of document.querySelectorAll(".shot")) {
  shot.addEventListener("pointermove", (e) => {
    const r = shot.getBoundingClientRect();
    shot.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    shot.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    shot.style.setProperty("--r", `${Math.round(Math.min(r.width, r.height) * 0.62)}px`);
  });
  shot.addEventListener("pointerleave", () => shot.style.setProperty("--r", "0px"));
}

if (finePointer && !reduced) {
  // Links lean toward the cursor.
  for (const wire of document.querySelectorAll(".wire")) {
    wire.addEventListener("pointermove", (e) => {
      const r = wire.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      wire.style.setProperty("--magx", `${(dx * 12).toFixed(1)}px`);
      wire.style.setProperty("--magy", `${(dy * 7).toFixed(1)}px`);
    });
    wire.addEventListener("pointerleave", () => {
      wire.style.setProperty("--magx", "0px");
      wire.style.setProperty("--magy", "0px");
    });
  }

  // A ring trailing the cursor that turns into a needle over the record. The
  // real cursor is never hidden — it stays the thing you aim with.
  const needle = document.querySelector(".needle");
  window.addEventListener("pointermove", (e) => {
    needle.classList.add("is-on");
    needle.style.setProperty("--nx", `${e.clientX}px`);
    needle.style.setProperty("--ny", `${e.clientY}px`);
    stage?.setPointer(e.clientX, e.clientY);
    const t = e.target instanceof Element ? e.target : null;
    needle.classList.toggle("is-record", !!t?.closest(".record"));
    needle.classList.toggle("is-over", !!t?.closest("a, button") && !t.closest(".record"));
  }, { passive: true });
  window.addEventListener("pointerleave", () => needle.classList.remove("is-on"));
} else if (!reduced) {
  window.addEventListener("pointermove", (e) => stage?.setPointer(e.clientX, e.clientY), { passive: true });
}

// ---------------------------------------------------------------- the clock

let raf = 0;
let last = performance.now();

function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  // Read layout before this frame's writes, so there's one flush per frame
  // rather than a write/read ping-pong.
  measureFocus();
  deck.step(dt);
  stage?.draw(dt, deck.state.vel);
  drawEq(deck.state.vel, now);

  // With motion reduced nothing animates on its own, so the loop only runs
  // while the visitor is actually spinning the record.
  if (!reduced || deck.isBusy()) raf = requestAnimationFrame(frame);
  else raf = 0;
}

function kick() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function halt() {
  if (!raf) return;
  cancelAnimationFrame(raf);
  raf = 0;
}

document.addEventListener("visibilitychange", () => (document.hidden ? halt() : kick()));
if (reduced) {
  record.addEventListener("pointerdown", kick);
  record.addEventListener("keydown", kick);
  record.addEventListener("click", kick);
}
measureFocus();
kick();
