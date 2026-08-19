// The playable record: pointer drag, throw, scratch, keyboard, and the label
// that other sections cue tracks onto.
//
// Physics lives in spin.js (pure, tested). This module owns the state and the
// DOM, and reports back whenever the visible label or speed changes.

import { IDLE_VEL, wrapAngle, shortestDelta, velocityFromSamples, rpmLabel, stepSpin } from "./spin.js";

// A throw faster than this is almost certainly a flick of the wrist against a
// trackpad rather than an intention, and it makes the label unreadable.
const MAX_THROW = 2600;

// Below this much pointer travel it was a click, not a drag — restore the spin
// the record had rather than stopping it dead.
const DRAG_SLOP = 4;

// Only the last moments of a drag decide the throw; a pause before letting go
// should read as setting the record down gently.
const THROW_WINDOW = 160;

export function createDeck(root, { onChange, reduced = false } = {}) {
  const titleEl = root.querySelector(".record__title");
  const sideEl = root.querySelector(".record__side");
  const defaults = { title: titleEl.innerHTML, side: sideEl.textContent };

  const state = { angle: 0, vel: reduced ? 0 : IDLE_VEL, grabbed: false, turns: 0 };
  let paused = reduced;
  let cued = null;              // the track another section put on, if any
  let samples = [];
  let lastPointerAngle = 0;
  let travel = 0;
  let velBeforeGrab = 0;
  let didDrag = false;
  let lastLabel = "";

  const centre = () => {
    const r = root.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const angleFrom = (e) => {
    const c = centre();
    return (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI;
  };

  function report() {
    const label = rpmLabel(state.vel);
    if (label === lastLabel) return;
    lastLabel = label;
    const speed = label === "— scratching —" ? "reverse" : label.replace(" RPM", "");
    sideEl.textContent = cued ? cued.sub : `${speed} · stereo`;
    onChange?.({ speed: label, title: cued ? cued.title : "Side A", vel: state.vel });
  }

  function paint() {
    root.style.setProperty("--angle", `${state.angle.toFixed(2)}deg`);
  }

  // Once the record has been touched the "drag me" hint has done its job.
  const markUsed = () => root.closest(".cover")?.classList.add("is-used");

  // ---- pointer ----------------------------------------------------------

  root.addEventListener("pointerdown", (e) => {
    // Capture keeps the drag alive when the pointer leaves the disc, but it
    // throws for a pointer the browser isn't tracking — never let that abort
    // the grab.
    try { root.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    state.grabbed = true;
    root.classList.add("is-grabbed");
    markUsed();
    velBeforeGrab = state.vel;
    state.vel = 0;
    travel = 0;
    didDrag = false;
    lastPointerAngle = angleFrom(e);
    samples = [{ angle: state.angle, t: e.timeStamp }];
  });

  root.addEventListener("pointermove", (e) => {
    if (!state.grabbed) return;
    const now = angleFrom(e);
    const delta = shortestDelta(lastPointerAngle, now);
    lastPointerAngle = now;
    travel += Math.abs(delta);
    if (travel > DRAG_SLOP) didDrag = true;
    state.angle = wrapAngle(state.angle + delta);
    samples.push({ angle: state.angle, t: e.timeStamp });
    if (samples.length > 12) samples.shift();
    paint();
  });

  function release() {
    if (!state.grabbed) return;
    state.grabbed = false;
    root.classList.remove("is-grabbed");
    if (!didDrag) {
      state.vel = velBeforeGrab; // it was a click; don't punish it
      return;
    }
    const v = velocityFromSamples(samples, THROW_WINDOW);
    state.vel = Math.max(-MAX_THROW, Math.min(MAX_THROW, v));
    // With motion reduced the throw plays out and then stops. Spinning forever
    // is the ambient animation they turned off; the throw is the one they asked
    // for.
    if (!reduced) {
      paused = false;
      root.setAttribute("aria-pressed", "true");
    }
  }

  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);

  // A mouse drag ends in a click event too. Only treat it as a press when the
  // pointer didn't actually move, or when it came from the keyboard.
  root.addEventListener("click", (e) => {
    if (didDrag && e.detail !== 0) { didDrag = false; return; }
    togglePaused();
  });

  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      state.angle = wrapAngle(state.angle + dir * 18);
      state.vel += dir * 260;
      if (!reduced) {
        paused = false;
        root.setAttribute("aria-pressed", "true");
      }
      markUsed();
      paint();
      report();
    }
  });

  function togglePaused() {
    paused = !paused;
    root.setAttribute("aria-pressed", String(!paused));
    markUsed();
  }

  // ---- cueing -----------------------------------------------------------

  /** Put a track on the record. Passing null puts the sleeve back to default. */
  function cue(title, sub) {
    cued = title ? { title, sub: sub || "" } : null;
    titleEl.textContent = cued ? cued.title : "";
    if (!cued) titleEl.innerHTML = defaults.title;
    sideEl.textContent = cued ? cued.sub : defaults.side;
    lastLabel = ""; // force the next report through so the status line updates
    root.classList.remove("is-cued");
    void root.offsetWidth; // restart the flash
    root.classList.add("is-cued");
    onChange?.({ speed: rpmLabel(state.vel), title: cued ? cued.title : "Side A", vel: state.vel });
  }

  // ---- frame ------------------------------------------------------------

  function step(dt) {
    stepSpin(state, dt, { paused });
    paint();
    report();
  }

  /** True while anything is still moving — lets main.js idle the loop. */
  const isBusy = () => state.grabbed || Math.abs(state.vel) > 0.5;

  // The markup says the record is playing, because normally it is. With motion
  // reduced it starts still, so say so.
  if (reduced) root.setAttribute("aria-pressed", "false");

  paint();
  report();
  return { step, cue, isBusy, state };
}
