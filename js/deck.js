// The playable record: pointer drag, throw, scratch, keyboard, and the label
// that other sections cue tracks onto.
//
// Physics lives in spin.js (pure, tested). This module owns the state and the
// DOM, and reports back whenever the visible label or speed changes.

import { IDLE_VEL, wrapAngle, shortestDelta, velocityFromSamples, speedLabel, stepSpin } from "./spin.js";

// A throw faster than this is almost certainly a flick of the wrist against a
// trackpad rather than an intention, and it makes the label unreadable.
const MAX_THROW = 2600;

// Below this much pointer travel it was a click, not a drag — restore the spin
// the record had rather than stopping it dead.
const DRAG_SLOP = 4;

// Only the last moments of a drag decide the throw; a pause before letting go
// should read as setting the record down gently.
const THROW_WINDOW = 160;

/**
 * What a press on the record means.
 *
 * The disc is the instrument and the centre label is the transport, so only the
 * label answers a click. `keyboard` is a press with no coordinates (a
 * MouseEvent with `detail === 0`), which cannot be "on the label" and must
 * still work — it is the only way a keyboard user can stop the music.
 */
export function pressIntent({ onLabel, didDrag, keyboard }) {
  if (keyboard) return "toggle";
  if (didDrag) return "ignore";
  return onLabel ? "toggle" : "ignore";
}

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
  // Set at pointerdown, where e.target is still trustworthy — see the click
  // listener below for why it cannot be re-derived there.
  let pressedOnLabel = false;

  const centre = () => {
    const r = root.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const angleFrom = (e) => {
    const c = centre();
    return (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI;
  };

  function report() {
    // speedLabel folds `paused` in, not just `vel`: rpmLabel alone can't tell
    // a genuinely stopped record from one mid-brake at the same nominal RPM,
    // which is exactly how a permanent "Now playing" survived a record that
    // had actually gone silent — "Stopped" is a string no rpmLabel bucket
    // ever produces, so a transition into or out of pause always differs
    // from lastLabel and always reaches onChange, even when vel itself
    // hasn't moved yet (e.g. the instant setPaused(false) runs, before the
    // next frame's physics nudges vel away from 0).
    const label = speedLabel(state.vel, paused);
    if (label === lastLabel) return;
    lastLabel = label;
    const speed = label === "— scratching —" ? "reverse" : label.replace(" RPM", "");
    sideEl.textContent = cued ? cued.sub : `${speed} · stereo`;
    onChange?.({ speed: label, title: cued ? cued.title : "Side A", vel: state.vel, paused });
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
    // setPointerCapture above also retargets the click event that follows a
    // real pointer press to the capturing element (root), so by the time
    // click fires, e.target is always the record and never the label --
    // pointerdown is the only moment in the gesture where the true target
    // is still visible, so it has to be captured here.
    pressedOnLabel = !!(e.target instanceof Element && e.target.closest(".record__label"));
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
    // The pointer is driving, so stepSpin is not running — the drag has to keep
    // the audio clock moving itself, or the one gesture that should make the
    // most interesting sound would make none.
    state.turns += delta / 360;
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
    if (!reduced) setPaused(false);
  }

  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);

  // A mouse drag ends in a click event too, and only the centre label is the
  // transport. `e.detail === 0` means the press came from the keyboard, which
  // reports no coordinates and so pressIntent ignores onLabel for it entirely
  // — pressedOnLabel only has to be fresh for a real pointer click, and it
  // is, because pointerdown above overwrites it on every single press.
  root.addEventListener("click", (e) => {
    const intent = pressIntent({ onLabel: pressedOnLabel, didDrag, keyboard: e.detail === 0 });
    didDrag = false;
    if (intent === "toggle") togglePaused();
  });

  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      state.angle = wrapAngle(state.angle + dir * 18);
      state.vel += dir * 260;
      if (!reduced) setPaused(false);
      markUsed();
      paint();
      report();
    }
  });

  // `silent` lets construction set the initial paused state without marking
  // the record "used" — markUsed() hides the "drag me" hint, and that hint
  // must survive until an actual interaction, not disappear at load time.
  function setPaused(value, { silent = false } = {}) {
    paused = value;
    root.setAttribute("aria-pressed", String(!paused));
    root.classList.toggle("is-stopped", paused);
    if (!silent) markUsed();
  }

  function togglePaused() {
    setPaused(!paused);
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
    // Same reasoning as report(): use speedLabel, not rpmLabel, so cueing a
    // track while the record is still paused (the moment before main.js
    // unpauses it) doesn't announce a speed the record isn't actually at.
    onChange?.({ speed: speedLabel(state.vel, paused), title: cued ? cued.title : "Side A", vel: state.vel, paused });
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
  // reduced it starts still, so say so — through setPaused, so the
  // aria-pressed attribute and the is-stopped class can never disagree about
  // whether the record is stopped. Silent because this is construction, not
  // a user interaction, and must not hide the "drag me" hint before anyone
  // has touched the record.
  if (reduced) setPaused(true, { silent: true });

  paint();
  report();
  return { step, cue, isBusy, setPaused, state };
}
