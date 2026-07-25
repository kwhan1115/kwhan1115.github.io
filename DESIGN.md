# Design

<!-- impeccable:design-schema 1 -->

## World

**"Liner Notes" — a jazz LP record sleeve.** Grounded in Kyuwon's jazz-piano world (Hiromi, Evans, Kapustin, Garner). The page is a record sleeve: a bold marquee cover, a tinted duotone portrait, and the content laid out like sleeve copy — liner-note prose, a personnel/track credit list, a catalog-numbered menu, a contact-sheet photo strip, and the exam progress as a pressed-in ledger/scorecard. This replaces the prior generic dark-purple rounded-card link-in-bio. The old look is anti-reference: no uniform rounded cards, no accent-rail callouts, no glowing halos, no emoji.

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
| `--pop` | `#FF3D6E` | Gengar-eye magenta — spent ONCE (the "up next" exam) |

Duotone photos: grayscale image tinted plum (shadows `#1E1230`, highlights `#D9B8FF`); reveal true color on hover/focus — the signature interaction.

## Type

- **Anton** — display marquee: the name, section headers, the big ledger figure. Poster-weight condensed grotesque (Blue Note marquee lineage). Uppercase, tracking to -0.02em, never tighter than -0.04em, display ≤6rem.
- **Archivo** (400/500/600/800) — body, the "Hi friends" note, nav, general structure. Grotesque workhorse; the record's running text is grotesque, not an editorial serif.
- **Cutive Mono** — typewriter mono for small catalog/credit/ledger metadata only (measurement + personnel credits, like typed sleeve notes). Never as a "technical costume" for body.

Banned defaults deliberately avoided: Newsreader / Space Grotesk / Space Mono / IBM Plex / editorial-serif clichés.

## Structure & rules

- **Cover-first.** One hero kicker (a catalog line) — a kicker is a system used once, NOT an eyebrow repeated over every section. Section headers are large Anton marquee titles, left-aligned, not small tracked eyebrows.
- **No uniform cards.** Blocks are differentiated by role (liner prose / credit list / menu / contact sheet / ledger), separated by hairline rules and spacing rhythm, not a stack of identical rounded rectangles.
- **Exam status is a marker + label**, never a colored `border-left` rail. Passed = filled plum dot; up-next = magenta `--pop` dot (+ a single deliberate glow, the one neon moment); not-started = hollow muted ring. Figures use `Anton`/tabular; row metadata uses `Cutive Mono`.
- **Links** are a listed set with real inline SVG brand marks, hairline-separated — not big pill buttons.
- **Depth** = offset+blur shadows (e.g. `0 14px 34px rgba(0,0,0,.45)`), never a zero-offset colored halo.
- **Motion — the record plays.** One motion metaphor, carried everywhere: cueing up and playing an LP.
  - *Focal (cover, on load):* the vinyl is cued up onto the platter — slides out of the sleeve, spins up, tucks behind the portrait — while the name marquee wipes in.
  - *Interactive:* on fine pointers the deck tilts in 3D toward the cursor, the aura drifting with it.
  - *Scroll:* each section wipes in like a marquee light and its rows tick in staggered like a tracklist — role-specific reveals, not identical section fades.
  - *Ambiance:* vinyl spins, equalizer plays, aura breathes, the one magenta "up next" light pulses, orbs drift (desktop). The signature duotone→color photo reveal stays.
  - *Rules:* all motion gated behind `prefers-reduced-motion: no-preference`; loops pause offscreen; scroll reveals are JS-gated so content is fully visible without JS.
- **Single-theme dark** by deliberate commitment (see Ground scene).

## Constraints

Static `index.html` + `style.css` + `exams.js`; no framework/build. Exam ledger renders from `exams.js` data (tracker figures always derive from data). Mobile-first; must hold at 360px. Google Fonts via `<link>` (GitHub Pages, no Artifact CSP). Semantic HTML, AA contrast, keyboard focus, alt text.
