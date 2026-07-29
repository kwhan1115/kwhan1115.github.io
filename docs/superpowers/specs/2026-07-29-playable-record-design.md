# Design — "The Playable Record"

Interactivity pass on `kwhan1115.github.io`. Approved by Kyuwon 2026-07-29.

## Brief

> "A lot of interactive elements, dynamic, animations. Also, remove my main picture from the website. A clean name showing at the top is fine. Let's keep it with the deep purple theme."
> Reference shown: `https://ttokkime.github.io/jamie-portfolio/`
> Follow-up: "don't let the amount of animation stop you. I want it to look impressive. Taking away can come later."

Decision (logged to the vault Prediction Log): **keep the existing "Liner Notes" identity, take the reference's interaction vocabulary, not its layout.** The reference's numbered-eyebrow + card-grid structure is the widely-cloned dev-portfolio template; its genuinely good parts are the interactive canvas hero, scroll progress, sticky nav with active tracking, and per-section animated moments. Those get rebuilt as record-native things.

## The single idea

**The record plays — and now the visitor plays it.**

Today the vinyl is decoration that spins on a timer. It becomes the page's one interactive instrument: grabbable, throwable, scrubbable, and *addressable from other sections*. Every other animation on the page is downstream of it. Boldness is spent here; everything else stays disciplined.

## What changes

### 1. Hero — portrait out, deck in

`assets/avatar.jpg` is removed from the page (file stays in the repo; other photos keep their sections). The name takes the space it vacates.

```
┌─────────────────────────────────────────────────────┐
│ ▌ KYUWON HAN              about  music  food  exams │  sticky nav, sliding underline
├─────────────────────────────────────────────────────┤
│ ⌇                                                   │
│ ⌇   PERSONAL RECORD — No. 01 — kwhan1115            │
│ ⌇                                                   │
│ ⌇    K Y U W O N                  ╭─────────╮       │
│ ⌇    H A N                       (  ◉ label  )      │  ← draggable
│ ⌇                                 ╰─────────╯       │
│ ⌇   ● now playing — side a · 33⅓ rpm                │  ← live region
│ ⌇     drag the record ↗                             │  ← hint, fades after first drag
└─────────────────────────────────────────────────────┘
  ↑ tonearm rail (fixed, desktop)
```

**Spin physics.** Pointer-down grabs and freezes; pointer-move rotates 1:1 with the angle around the record's center; pointer-up releases with angular velocity derived from the last ~5 movement samples. Friction decays it back toward the idle 33⅓ rpm. Over-speed states relabel the record — `45 RPM`, `78 RPM` — and negative velocity reads `— scratching —`. The equalizer bars in the Music section are driven by the same angular velocity, so spinning the record up top visibly agitates a section further down.

**Affordance.** Nobody guesses a decorative record is draggable. After the load sequence it wobbles once, and a mono `drag the record ↗` hint sits beneath it until the first drag (then it's gone for good, per session).

**Keyboard + a11y.** The record is a real `<button>`: `aria-label="Record — drag or use arrow keys to spin"`, ← / → nudge, Space toggles idle spin (`aria-pressed`). The `now playing` line is `aria-live="polite"` so its label changes are announced.

### 2. Groove field canvas

One `<canvas>` behind the hero. Concentric groove arcs centered on the record, with particles riding them like dust in the groove. The cursor pushes particles off their track; they ease back. This is the reference's constellation, made vinyl-native.

Particle count `clamp(40, viewportArea / 9000, 140)`; DPR capped at 2; the loop pauses when the hero leaves the viewport.

### 3. Tonearm rail + sticky nav

Desktop: a fixed tonearm on the left whose needle rides down as the page scrolls, with a tick per section — the page read as one side of a record. Sections light their tick when active.

All widths: sticky top nav, name at left, section anchors at right, one sliding underline that travels to the active section (not a per-item highlight). Active section comes from a scroll-position calculation, `aria-current="true"` on the live one.

Mobile: rail collapses to a 2px plum progress line pinned to the top edge; nav becomes a compact scrollable row.

This also closes a real gap — the current site has no navigation at all.

### 4. Per-section moments

Each block gets a reveal that fits its role, replacing today's single shared fade:

| Section | Moment |
|---|---|
| Liner notes | Types in line by line, like a typed sleeve note |
| Find me | Rows tick in staggered; brand marks spring; magnetic hover pulls the row toward the cursor |
| Music | Credits deal in like a tracklist; equalizer driven by live record speed; **each musician is a button that swaps the record's label** |
| Food | Menu items stamp in with catalog numbers |
| Photos | Contact-sheet frames "develop" (duotone resolves in); pointer-position drives the colour reveal instead of snapping |
| Exam record | Rows stamp in with the existing count-up; **each row is a button that puts that exam on the record label** (9 exams = 9 tracks on a side) |

### 5. Atmosphere

Dust motes drifting through the stage light across the whole page, cursor-reactive, sharing the canvas and the loop with the groove field. Custom cursor on fine pointers: a plum ring that swells over interactive elements and becomes a **needle** over the record.

### 6. Cross-section binding

The musician buttons and exam rows write to the record label and the `now playing` line. That is what makes the page one instrument instead of a stack of sections — an interaction in the last section changes the first screen. Nothing fake is claimed: no audio plays, and the copy says what it is.

### 7. Load sequence (one orchestrated moment)

Cueing up a record, ~1.1s total: aurora fades up → tonearm swings in → the record slides out from behind the name, drops onto the platter and spins up 0 → 33⅓ → name wipes in per line → kicker and `now playing` fade → nav and hint arrive. Runs once, skipped entirely under reduced motion.

## Architecture

Stays static — no framework, no bundler, no build step (`PRODUCT.md` constraint). The inline `<script>` in `index.html` is past what one block should hold, so it splits:

| File | Responsibility |
|---|---|
| `exams.js` | *(unchanged)* exam data + pure render helpers |
| `js/spin.js` | **pure** spin physics: step, momentum from samples, rpm labelling |
| `js/deck.js` | pointer/keyboard wiring for the record; owns deck state |
| `js/scroll.js` | **pure** scroll progress + active-section resolution, plus rail/nav/reveal wiring |
| `js/stage.js` | the canvas: groove field + dust motes; draws, never owns time |
| `js/lightbox.js` | photo lightbox, extended with prev/next and arrow keys |
| `js/main.js` | wiring + the single `requestAnimationFrame` loop |

**One rAF loop**, owned by `main.js`: it steps deck physics, then hands the resulting angle to `stage.draw`. Four animation systems, one clock — no competing loops.

## Testing

`node --test` at the repo root, matching `exams.test.js`:

- `spin.test.js` — decay converges on idle; momentum from sample list; reverse scrub yields negative velocity; rpm labels at each boundary; `dt = 0` produces no NaN.
- `scroll.test.js` — progress clamps to 0–1; active section is the one crossing the reading line; ties resolve to the later section; empty section list doesn't throw.
- `exams.test.js` — unchanged, must stay green.

DOM wiring is verified in a real browser with screenshots, not unit-tested.

## Quality floor

- Full content readable with JavaScript disabled; every reveal is JS-gated.
- `prefers-reduced-motion: reduce` → no load sequence, no auto-spin, no particles, no reveals, everything visible. User-initiated drag still works.
- Holds at 360px; the record scales to ~62vw and the rail becomes a top bar.
- Visible keyboard focus on every interactive element, including the record and the new buttons.
- AA contrast maintained on the dark ground.
- Loops pause offscreen; `will-change` only on the transforming record.

## Token note

`DESIGN.md` currently says `--pop` (`#FF3D6E`) is spent **once**, on the up-next exam. This design spends it a second time: the record's over-speed label. Same meaning both times — *live right now* — and the second use is transient and user-triggered. `DESIGN.md` gets amended to state the rule as "reserved for the one thing that is live," not "used once."

## Out of scope

- Audio of any kind.
- A Gengar character sprite (rejected previously).
- Reordering or adding photos — still an open question from 2026-07-24.
- Changing the exam data.
