# Personal Hub Website — Design Spec

**Date:** 2026-07-24
**Owner:** Kyuwon Han
**Status:** Approved design, content pending

## Goal

A single-page "link-in-bio" personal hub — casual, fun, points visitors at Kyuwon's links and gives a quick sense of who he is. Primary viewers: friends and internet strangers arriving from a social bio link (so: mobile-first).

## Approach

**One static `index.html` + `style.css`, served by GitHub Pages. No build step, no framework, no JS toolchain.**

Rejected alternatives:
- **Static-site generator (Astro/Hugo/Eleventy):** built for many pages / a blog. This is one page. Build tooling buys nothing.
- **React/Vite SPA:** heavy toolchain for a page with no app logic. Overkill.

Rationale: the content is text, link rows, and one small progress widget. Plain HTML/CSS loads instantly, never breaks, and stays editable forever with no toolchain. A tiny sprinkle of vanilla JS is allowed only if a block genuinely needs it (see Exam Tracker — it does not strictly need JS; static markup is fine).

## Site Structure

Single centered column, `max-width ~600px`, vertical scroll. Blocks top to bottom:

1. **Intro + photo** — round avatar, name, one-line blurb, optional small Gengar accent mark.
2. **Link buttons** — full-width rounded rows with icon + label, purple glow on hover. Confirmed links:
   - GitHub — `https://github.com/<username>`
   - Email — `kwhan1115@gmail.com` (mailto)
   - Instagram — `https://instagram.com/kwhan1115` (@kwhan1115)
   - (room for more — LinkedIn/X/etc. if provided)
3. **Now / about** — short prose block: background (actuary + Android dev), what he's up to.
4. **Actuarial exam tracker** — custom block. See component spec below.

Order and presence of blocks is fixed for v1. No nav bar (single screen-scroll page).

## Visual Design

Dark "Gengar" theme, consistent with Kyuwon's terminal scheme.

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#2B1B3D` | page background |
| `--surface` | `#3A2456` | cards / link rows |
| `--surface-hi` | `#4A2E6B` | hover surface |
| `--accent` | `#C77DFF` | primary purple (links, glow) |
| `--accent-bright` | `#E0AFFF` | headings / highlights |
| `--danger` | `#FF5C6E` | red accent (Gengar eyes motif) |
| `--text` | `#E8E0F0` | body text |
| `--muted` | `#A99BC0` | secondary text |
| `--ok` | `#7FE0A8` | exam "passed" |

- **Type:** system sans stack (`-apple-system, Segoe UI, Roboto, sans-serif`) for zero-dependency loading. Optional single web font for the name heading only; if used, `font-display: swap`. Default: system stack, no web font.
- **Interactivity:** subtle purple box-shadow glow on link-row hover; smooth `transition`. Respect `prefers-reduced-motion`.
- **Responsive:** mobile-first. Column fluid to ~600px then centered with side padding. Must look right at 360px width (phone) — the primary case.
- **Accessibility:** semantic HTML (`<main>`, `<h1>`, `<nav>`/list for links, `<section>`), AA contrast (palette chosen to pass on `--bg`), focus-visible outlines, alt text on avatar, links are real `<a>` elements.

## Exam Tracker Component

Shows actuarial exam progress at a glance.

- **Summary header:** "X of N passed" + a horizontal progress bar filled to X/N in `--accent`.
- **Per-exam rows:** one pill/row each with exam name + status indicator. Three states:
  - `passed` — ✅ / `--ok`
  - `scheduled` — 🟣 (in progress / date set), optional date label
  - `not-started` — ⚪ / `--muted`
- **Data model:** a plain list, each item `{ name, status: passed|scheduled|notStarted, note? }`. Rendered as static HTML (hand-authored or trivially templated). No backend.
- Summary count derives from the list.

## Content Configuration

These are user-supplied values. Placeholders below are defaults to build against; Kyuwon overwrites with real content during implementation. Marking a field `[PENDING]` means "waiting on real value" — it is content data, not an unresolved design decision.

| Field | Default / placeholder | Status |
|-------|----------------------|--------|
| Name | "Kyuwon Han" | confirmed |
| Blurb (1 line) | "Actuary in training · Android developer" | `[PENDING]` tone/wording |
| Avatar | initials "KH" on purple, OR Gengar-style mark | `[PENDING]` real photo? |
| GitHub URL | `github.com/kwhan` (assumed username) | `[PENDING]` confirm username |
| Instagram | `@kwhan1115` | confirmed |
| Email | `kwhan1115@gmail.com` | confirmed |
| Other links | — | optional, none yet |
| About text | draft from "actuary + Android dev, builds Gengarchat" | `[PENDING]` real text |
| Exam list | e.g. `P ✅, FM ✅, FAM 🟣, SRM ⚪` (illustrative) | `[PENDING]` real list + statuses |

## Repo / File Structure

```
<username>.github.io/          # repo name MUST equal <github-username>.github.io
├── index.html
├── style.css
├── assets/
│   └── avatar.(png|svg)
├── docs/superpowers/specs/    # this spec
└── README.md
```

Deployment: GitHub **user site**. Push to the `<username>.github.io` repo's default branch → Settings → Pages → serve from branch root. Live at `https://<username>.github.io`. Custom domain deferred (not v1).

## Non-Goals (v1 / YAGNI)

- No blog, CMS, or multi-page routing.
- No build pipeline, bundler, or framework.
- No backend, database, or forms.
- No analytics/tracking.
- No projects section (deliberately dropped by owner).
- No dark/light toggle — dark only.

## Success Criteria

- Loads as a single self-contained page on GitHub Pages at `https://<username>.github.io`.
- Renders correctly and legibly at 360px (phone) through desktop.
- All four blocks present; links work; exam tracker shows correct passed/N summary.
- Passes basic a11y: semantic structure, AA contrast, keyboard-focusable links, avatar alt text.
- Editable by hand with no tooling.
