# Design

<!-- impeccable:design-schema 1 -->

## World

**"Liner Notes" — a jazz LP record sleeve, and the record plays.** Grounded in Kyuwon's jazz-piano world (Hiromi, Evans, Garner, Anomalie). The page is a record sleeve: a bold marquee cover, and the content laid out like sleeve copy — liner-note prose, a personnel/track credit list, a catalog-numbered menu, a contact-sheet photo strip, and the exam progress as a pressed-in ledger/scorecard.

The vinyl is not decoration, and it is no longer only a picture of an instrument — it is one. Draggable, throwable, scratchable, and it actually plays: an AudioWorklet reads a track off the record's own rotation, so a backward drag scratches real audio and a held record is silent. A five-row picker beneath it is the way in; the record's centre label is the transport and means one thing only — what's playing, or nothing. Musician names and exam rows used to be able to cue their own name onto that label; they don't any more, because a row that could put an exam name where the label is now supposed to say the truth would be making it lie. Everything else stays quiet around it.

Two anti-references, both deliberate. The dark rounded-card link-in-bio this replaced: no uniform rounded cards, no accent-rail callouts, no glowing halos, no emoji. And the dev-portfolio template the interactivity was drawn from (`ttokkime.github.io/jamie-portfolio`, shown as a reference 2026-07-29): its interaction vocabulary was taken, its layout was not — no `01. / 02.` numbered eyebrows over a card grid, no constellation hero, no skills chips.

## Ground scene

A friend taps the Instagram bio link at night, in bed, on a phone, expecting something fun and personal. → committed **dark** ground (night, jazz club, and Kyuwon's Gengar identity), not a category default.

## Color (Committed — plum owns whole regions)

| Token | Hex | Role |
|---|---|---|
| `--ground` | `#160E1F` | page ground (deep aubergine-black, purple bias) |
| `--panel` | `#20132E` | pressed panels / sleeve fields |
| `--line` | `#3B2A50` | hairline rules, dividers |
| `--ink` | `#F3ECF6` | primary text (warm, purple-biased off-white) |
| `--muted` | `#A897B8` | secondary text — tinted mauve, never gray |
| `--plum` | `#C77DFF` | Gengar accent, marks, links |
| `--plum-deep` | `#7A3FB5` | deep plum fields, duotone shadow |
| `--pop` | `#FF3D6E` | Gengar-eye magenta — reserved for the one thing that is *live right now* |

`--pop` rule: not "used once" but "means live." Two uses, one meaning — the up-next exam's marker, and the record's status when it is spun past its own speed (over 62 RPM, or backwards). Both are transient or singular; a third use would dilute it. The rule held through the record learning to actually play: the picker's marks and its loading/playing states are plum, not pop — a played track is a normal, ongoing state, not the "past its own speed" moment `--pop` is reserved for.

Duotone photos: grayscale image tinted plum (shadows `#1E1230`, highlights `#D9B8FF`). True colour is revealed through a spotlight that **follows the pointer** across the photo — the duotone doesn't switch off, it gets pushed back. Keyboard focus and touch reveal the whole frame, since there is no pointer to follow.

## Type

- **Anton** — display marquee: the name, section headers, the big ledger figure. Poster-weight condensed grotesque (Blue Note marquee lineage). Uppercase, tracking to -0.02em, never tighter than -0.04em, display ≤6rem.
- **Archivo** (400/500/600/800) — body, the "Hi friends" note, nav, general structure. Grotesque workhorse; the record's running text is grotesque, not an editorial serif.
- **Cutive Mono** — typewriter mono for small catalog/credit/ledger metadata only (measurement + personnel credits, like typed sleeve notes). Never as a "technical costume" for body.

Banned defaults deliberately avoided: Newsreader / Space Grotesk / Space Mono / IBM Plex / editorial-serif clichés.

## Structure & rules

- **Cover-first, and the cover owns the first screen** (where there's height for it — a phone gets natural stacking instead, since the same rule just opens holes there). Sleeve copy runs to the edges: catalog kicker at the top, the name block through the middle with the record beside it, a status strip along the foot carrying `Now playing — Side A · 33⅓ RPM` (pulsing plum cue dot) and the `drag the record` hint. The hint retires permanently the first time the record is touched. **No portrait** — removed 2026-07-29 at Kyuwon's request; the name takes the space.
- **Persistent navigation.** A sticky topbar with the six section names and ONE indicator that slides to the section being read — not a per-item highlight. Narrow screens drop the topbar name, and the list scrolls horizontally under a fade mask rather than clipping. `main.js` derives both the blocks and the nav links from `main .block` and `.topbar__nav a`, so the two must stay aligned — **anything in the topbar that is not a section must live outside `.topbar__nav`** or it is counted as one.
- **Six sections, and the seventh thing is a link out, not a section** (2026-10-30). The friend map was briefly built as a seventh section and Kyuwon asked for it discreet instead: `.topbar__map`, a 15px authored mark plus a mono label, past the nav behind a short hairline, muted until hover. **It stretches to the full 52px topbar** so a 15px mark still has a real tap target, with the divider on a `::before` so the hit area can grow without the hairline growing with it. Below 560px the label and the divider both go and the mark stands alone; the anchor's `aria-label` carries the name at every width.
- **The nav does not shrink to fit, and the numbers are the point.** At 360px the six names need **349px**. With nothing beside them they get 331px — already 19px over, which is why the fade mask exists. The map link costs them **24px** more, for 42px of overflow. The seventh *section* cost 52px, so the discreet link is the cheaper of the two, but **neither is free: anything placed right of the nav is taken out of the nav's room.** A second utility link needs a different treatment, not another item.
- **Waveform progress bar**, full width, directly under the topbar — the page drawn as audio. Bar heights come from each section's real share of the document, so longer sections read louder and the shape is a picture of *this* page; the texture is deterministic so a resize never reshuffles it. Plum fills up to where you've read, section boundaries are notches, and it can be **dragged to seek**, naming the section under the pointer as you go. The waveform, its marks and the playhead all live on the *progress* axis (not the document axis) so they agree with each other and with the nav.
  - `aria-hidden` on purpose: the nav above already does this job accessibly, and the waveform is a pointer-only shortcut layered on top. `touch-action: pan-y` so a vertical swipe from the top of a phone still scrolls.
  - Rejected first attempt (2026-07-29): a tonearm riding the left margin, with the needle tracking scroll depth. Correct metaphor, and Kyuwon disliked how it looked. A piano-key strip and a tracklist timeline were offered alongside the waveform; he picked the waveform. **Legibility as a progress control beat personal resonance** — don't reach back for the tonearm.
- **The record is a control, not an image — and now an instrument, not a picture of one.** A real `<button>`: drag to spin, throw for momentum, drag backwards to scratch, arrow keys to nudge, space to stop. Under an AudioWorklet, that scratch is real: the worklet's read head tracks the record's rotation sample-for-sample, so dragging backwards plays the track backwards and a held record goes silent, none of it tuned by ear. The picker underneath — five rows, plum marks, same plum as everywhere else — is how a track gets picked; the record's centre label is the transport, counter-rotating so it stays readable, and it now carries only one thing: what is actually playing. `touch-action: pan-y`, never `none`: a vertical swipe over the biggest object on a phone screen must still scroll the page.
- **No uniform cards.** Blocks are differentiated by role (liner prose / credit list / menu / contact sheet / ledger), separated by hairline rules and spacing rhythm, not a stack of identical rounded rectangles.
- **Exam status is a marker + label**, never a colored `border-left` rail. Passed = filled plum dot; up-next = magenta `--pop` dot (+ a single deliberate glow, the one neon moment); not-started = hollow muted ring. Figures use `Anton`/tabular; row metadata uses `Cutive Mono`.
- **Links** are a listed set with real inline SVG brand marks, hairline-separated — not big pill buttons.
- **Depth** = offset+blur shadows (e.g. `0 14px 34px rgba(0,0,0,.45)`), never a zero-offset colored halo.
- **Motion — the record plays.** One motion metaphor, carried everywhere: cueing up and playing an LP.
  - *Focal (cover, on load):* one orchestrated ~1.1s sequence — the record is cued up onto the platter and spins up while the name marquee wipes in line by line, then the status strip, nav and rail arrive.
  - *Signature (interactive):* the record itself. Spin physics settle exponentially back to 33⅓; pause brakes noticeably faster than a throw settles, so stopping reads as deliberate.
  - *Ambient canvas:* a groove field centred on the record — dust riding concentric grooves, brighter the faster it spins — plus motes drifting page-wide through the stage light. The cursor shoves particles off their track and they ease back.
  - *Scroll:* each section reveals **in its own register**, never one shared fade. Liner note types a line at a time (line count measured at the current width); links tick in and lean magnetically toward the cursor; credits deal in like cards; menu items stamp down; contact-sheet frames develop; ledger rows stamp in with the count-up.
  - *Cursor:* a plum ring trails the pointer and becomes a needle over the record. The real cursor is never hidden — it stays the thing you aim with.
  - *Rules:* all motion gated behind `prefers-reduced-motion: no-preference`. **One** `requestAnimationFrame` drives physics, canvas and equalizer — never one loop per system. It halts when the tab is hidden. Under reduced motion there is no canvas, no load sequence and no idle spin, but a drag still works and brakes to a stop: the visitor asked for that motion themselves.
- **Scale, don't stretch.** Past 1600px the reading measure is already at its ceiling, so the *root* font size steps up (1600 / 2000 / 2400px) and everything in `rem` grows with it — type, the record, spacing — while the column widens only enough to keep its proportion. Below 1600px the root is untouched, so the tuned desktop layout renders unchanged. The cover's height is capped at 860px: a name and a record spread across 1400px of monitor is a canyon, not a sleeve.
- **Anything striped or repeated gets a fixed unit and flexible spacing, never the reverse.** The waveform's bars are a fixed 3px with the leftover absorbed by the gaps. Letting them flex to fill is what made them wider than they were tall at 2560px — twice. A short count should open the spacing, not fatten the marks.
- **Single-theme dark** by deliberate commitment (see Ground scene).

## Constraints

Static `index.html` + `style.css` + `exams.js` + `js/*.js` ES modules; no framework/build. Exam ledger renders from `exams.js` data (tracker figures always derive from data). Mobile-first; must hold at 360px. Google Fonts via `<link>` (GitHub Pages, no Artifact CSP). Semantic HTML, AA contrast, keyboard focus, alt text.

Pure logic is unit-tested under `node --test`: `js/spin.js` (physics), `js/scroll.js` (rail progress, active section, stagger), `exams.js` (ledger), `tracks.js` (the picker's render), and `js/audio/` (turn-to-sample mapping, the scratch DSP). DOM wiring is verified in a real browser. The audio evidence is largely an absence — no flutter, no click, no drift, silence when the record is held still — so it is verified by reading `AudioWorklet` telemetry (idle rate spread, head position, RMS), never by ear.

**No-JS contract:** the head script adds `.js` pre-paint so reveals can hide content without a flash, and sets a 2.5s timer that removes it again unless `main.js` has claimed `.ready`. A broken or blocked module therefore shows the whole page rather than hiding it behind reveals that never fire.
