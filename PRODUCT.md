# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Kyuwon's friends and internet strangers who arrive from a social bio link (Instagram `@kwhan1115`), usually on a phone. Their job is to get a quick, true-to-him sense of who Kyuwon is and reach his links. No recruiter/professional-credibility pressure — this is a fun personal page, not a portfolio or resume.

## Product Purpose

A single-page personal hub ("link in bio") for Kyuwon Han. It exists to be a fun, honest snapshot of him and a jumping-off point to his profiles. Success = a visitor smiles, gets the gist of him, and taps through to a link.

## Positioning

Not a template link-in-bio. The differentiator is Kyuwon's specific personality made visible: an obsessive-favorites mind (running lists of favorite foods and musicians), a jazz-piano habit, a rotation of sports, and a self-aware casual voice. The content itself — his real lists, real photos, real exam record — is the thing a generic bio-link page could not copy.

## Operating Context

Opened primarily on mobile from a social profile link. Static site served by GitHub Pages at `https://kwhan1115.github.io`. Edited by hand and redeployed via `git push` (Pages CDN caches assets ~10 min). Skim-read in seconds, not studied.

## Capabilities and Constraints

- Single static page: `index.html` + `style.css` + `exams.js` + `js/` ES modules. No framework, bundler, backend, or analytics.
- The exam tracker renders from data in `exams.js` (`EXAMS` array + pure helpers). The "X of N passed" summary and ACAS/FCAS credential progress must always derive from the data, never be hand-typed.
- Pure logic carries `node --test` coverage: exam rendering, the record's spin physics, the scroll maths behind the rail and nav, and the turn-to-sample mapping and scratch DSP behind the record's audio.
- Must stay hand-editable with no toolchain and load instantly.
- Deploy target repo name is fixed: `kwhan1115.github.io`.
- Content sections: cover (name + playable record), about, links, music, food obsessions, photos, exam record. **Six, and deliberately still six.**
- **Friend map (2026-10-30)** — `/friend-map/`, a redacted public build of a separate private project (`Developer/friend-map`), reached from a **small link in the topbar**, not a section. It shipped as a full section first and Kyuwon asked for it discreet the same day; the section was removed rather than shrunk. The page is GENERATED into this repo by that project's `build_public.py --deploy`: **do not hand-edit `friend-map/index.html`**, the next build overwrites it. It keeps its own dark visual world rather than this site's plum one, because it is a page reached by a link, not a section of this site. It carries 82 real names with their rings, circles and metros, and `noindex, nofollow`.
- The record actually plays music: it's an AudioWorklet-driven turntable, not a spinning picture. The five-row picker under the record is the way in — press a row to drop the needle, press it again (or the record's centre label) to lift it. Dragging the record scratches the audio in real time, forward or backward, at whatever rate the hand moves it. The Music section's musician list and the exam rows are read-only now; the record's label means one thing — what's actually playing — so nothing else is allowed to write to it.

## Brand Commitments

- Name shown as "Kyuwon Han".
- Casual, warm, first-person voice in his own words — e.g. the About opens "Hi friends!" and closes "welcome to my little website!" Do not corporatize this copy.
- Gengar / purple is his standing color identity (matches his terminal theme and the Gengar-hoodie avatar). Keep purple as the identity color. **No portrait at the top** — `directly stated` 2026-07-29: "remove my main picture from the website. A clean name showing at the top is fine." The other photos stay.
- He does NOT want to be described as an "Android developer" and does not take credit for building apps ("I just used Claude for the work"). Keep app-building claims off the page.
- Real content only, in his exact wording where given (food + musician lists verbatim).

## Evidence on Hand

- Photos: `assets/photo1.jpg` (full hoodie shot), `assets/photo2.jpg` (street convex-mirror w/ film camera), `assets/photo3.jpg` (science-museum), `photo4`–`photo9` (friends), `music-hiromi.jpg`. Real, his own. `assets/avatar.jpg` is still in the repo but no longer on the page.
- Exam record (real): CAS track — Exam 1 (Probability) ✓, Exam 2 (Financial Math) ✓, MAS-I ✓ passed; MAS-II sat 2026-10-29 (attempt 3), awaiting results; Exams 5, 6 (finish ACAS), Exams 7, 8, 9 (finish FCAS) remaining. First 6 = ACAS (Associate), all 9 = FCAS (Fellow). 3 of 9 passed.
- Music: plays piano, percussion, a bit of drums, guitar, bass. Favorite musicians (verbatim): Hiromi Uehara, Erroll Garner, Bill Evans, Anomalie, insaneintherain. (Nikolai Kapustin removed 2026-08-19 at his request.) Spotify: `open.spotify.com/user/kwhan1115`.
- Food obsessions (verbatim): Chi Forest, Fruit Riot, Matcha Binch, Mike's Chicken, Mister O1's Extraordinary Pizza, Cruntin Crunchball Protein Shake, Costco Chicken Bake, Fresh Bowl's Mi Quang, Taco Bell Luxe Box.
- Links: GitHub `github.com/kwhan1115`, Instagram `@kwhan1115`, Email `kwhan1115@gmail.com`, Spotify (above).
- No fabricated testimonials, metrics, or claims — none exist and none should be invented.

## Product Principles

1. Personality over polish — the page should feel like Kyuwon, not a template. His voice and lists are the content.
2. Honest attribution — no overclaiming (no "developer" title, no taking credit for AI-built apps).
3. Mobile-first and instant — most visits are a phone tap from a bio link.
4. Truthful data — the exam record and lists reflect reality; the tracker derives its numbers from data.
5. Fun beats impressive — friends-first; delight and character outrank credibility signaling.

## Accessibility & Inclusion

No product-specific standard mandated, but keep it usable: semantic structure, legible contrast on the dark ground, keyboard-focusable links, and alt text on photos.
