# Personal Hub Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page dark "Gengar" link-in-bio site and deploy it to GitHub Pages at `https://kwhan.github.io`.

**Architecture:** One static `index.html` + `style.css`, no framework or bundler. The only dynamic piece is the actuarial exam tracker: exam data lives in a small ES module (`exams.js`) with pure render helpers, imported both by the page (to inject the tracker) and by a node test file. The "X of N passed" summary derives from the data so it can never drift.

**Tech Stack:** Hand-authored HTML5 + CSS3. Vanilla ES modules. Node's built-in test runner (`node --test`) — no dependencies installed.

## Global Constraints

- Single static page. No framework, bundler, backend, database, or analytics. (verbatim: "No build pipeline, bundler, or framework.")
- Deploy target: GitHub Pages **user site**. Repo name MUST be exactly `kwhan.github.io`.
- Dark-only Gengar palette — exact tokens: `--bg:#2B1B3D`, `--surface:#3A2456`, `--surface-hi:#4A2E6B`, `--accent:#C77DFF`, `--accent-bright:#E0AFFF`, `--danger:#FF5C6E`, `--text:#E8E0F0`, `--muted:#A99BC0`, `--ok:#7FE0A8`.
- Mobile-first; must render correctly from 360px width to desktop.
- Semantic HTML, AA contrast, focus-visible outlines, avatar `alt` text.
- No installed dependencies. Tests use node's built-in `node --test` (requires Node 18+). ES modules enabled via `"type":"module"` in `package.json`.
- **Local verification requires a local HTTP server** (`python -m http.server 8000`), NOT `file://` — ES module imports are blocked over `file://`.
- Content values in this plan are working defaults; owner swaps real blurb/about/exam-list/photo. Swap points are marked `<!-- SWAP -->`.

---

## File Structure

```
kwhan.github.io/
├── index.html        # page structure + static blocks + module mount
├── style.css         # Gengar theme, all styling, responsive
├── exams.js          # EXAMS data + pure helpers (computeSummary, examRowHTML, renderExams)
├── exams.test.js     # node --test unit tests for exams.js
├── package.json      # { type: module, scripts.test }
├── assets/
│   └── avatar.svg    # initials placeholder avatar
├── README.md
└── docs/superpowers/ # spec + this plan (already present)
```

---

### Task 1: Exam data module + unit tests

**Files:**
- Create: `exams.js`
- Create: `exams.test.js`
- Create: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `EXAMS: Array<{ name: string, status: "passed"|"scheduled"|"notStarted", note?: string }>`
  - `computeSummary(exams): { passed: number, total: number }`
  - `examRowHTML(exam): string` — one `<li>` HTML string
  - `renderExams(exams): string` — full summary + `<ul>` HTML string

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "kwhan-github-io",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Write the failing test file `exams.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMS, computeSummary, examRowHTML, renderExams } from "./exams.js";

test("computeSummary counts passed and total", () => {
  const s = computeSummary([
    { name: "A", status: "passed" },
    { name: "B", status: "passed" },
    { name: "C", status: "notStarted" },
  ]);
  assert.deepEqual(s, { passed: 2, total: 3 });
});

test("computeSummary handles empty list", () => {
  assert.deepEqual(computeSummary([]), { passed: 0, total: 0 });
});

test("examRowHTML includes name, status class, and note", () => {
  const html = examRowHTML({ name: "Exam FAM", status: "scheduled", note: "Oct 2026" });
  assert.match(html, /exam--scheduled/);
  assert.match(html, /Exam FAM/);
  assert.match(html, /Oct 2026/);
});

test("examRowHTML escapes HTML in user content", () => {
  const html = examRowHTML({ name: "<b>x</b>", status: "passed" });
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /&lt;b&gt;/);
});

test("renderExams reflects summary, bar width, and one row per exam", () => {
  const html = renderExams([
    { name: "A", status: "passed" },
    { name: "B", status: "scheduled" },
  ]);
  assert.match(html, /1 of 2 passed/);
  assert.equal((html.match(/<li /g) || []).length, 2);
  assert.match(html, /width:\s*50%/);
});

test("EXAMS default data is well-formed", () => {
  assert.ok(Array.isArray(EXAMS) && EXAMS.length > 0);
  for (const e of EXAMS) {
    assert.ok(e.name, "exam has name");
    assert.ok(["passed", "scheduled", "notStarted"].includes(e.status), "valid status");
  }
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test`
Expected: FAIL — `Cannot find module './exams.js'` (or import error).

- [ ] **Step 4: Write minimal implementation `exams.js`**

```js
// Actuarial exam data + pure render helpers.
// Imported by index.html (as a module) to inject the tracker, and by
// exams.test.js under `node --test`. Summary always derives from the data.

// <!-- SWAP --> Replace with real exams and statuses.
export const EXAMS = [
  { name: "Exam P",   status: "passed" },
  { name: "Exam FM",  status: "passed" },
  { name: "Exam FAM", status: "scheduled", note: "Oct 2026" },
  { name: "Exam SRM", status: "notStarted" },
];

const LABEL = { passed: "Passed", scheduled: "Scheduled", notStarted: "Not started" };
const ICON  = { passed: "✅", scheduled: "🟣", notStarted: "⚪" };

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function computeSummary(exams) {
  const passed = exams.filter((e) => e.status === "passed").length;
  return { passed, total: exams.length };
}

export function examRowHTML(exam) {
  const status = ["passed", "scheduled", "notStarted"].includes(exam.status) ? exam.status : "notStarted";
  const icon = ICON[status];
  const label = LABEL[status];
  const note = exam.note ? ` · ${escapeHTML(exam.note)}` : "";
  return `<li class="exam exam--${status}">` +
    `<span class="exam__icon" aria-hidden="true">${icon}</span>` +
    `<span class="exam__name">${escapeHTML(exam.name)}</span>` +
    `<span class="exam__status">${label}${note}</span>` +
    `</li>`;
}

export function renderExams(exams) {
  const { passed, total } = computeSummary(exams);
  const pct = total ? Math.round((passed / total) * 100) : 0;
  const rows = exams.map(examRowHTML).join("");
  return (
    `<div class="exam-summary">` +
      `<span class="exam-summary__count">${passed} of ${total} passed</span>` +
      `<div class="exam-bar" role="progressbar" aria-valuenow="${passed}" aria-valuemin="0" aria-valuemax="${total}" aria-label="Exams passed">` +
        `<div class="exam-bar__fill" style="width: ${pct}%"></div>` +
      `</div>` +
    `</div>` +
    `<ul class="exam-list">${rows}</ul>`
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS — all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add exams.js exams.test.js package.json
git commit -m "feat: add exam tracker data module with derived summary + tests"
```

---

### Task 2: HTML skeleton + static content blocks

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: nothing yet (module wiring happens in Task 4). Provides `<section id="exam-tracker">` mount point.
- Produces: semantic page structure with element IDs/classes the CSS (Task 3) and module (Task 4) target.

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kyuwon Han</title>
  <meta name="description" content="Kyuwon Han — actuary in training and Android developer.">
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main class="card">

    <!-- Intro + photo -->
    <header class="intro">
      <img class="avatar" src="./assets/avatar.svg" width="112" height="112"
           alt="Kyuwon Han avatar">
      <h1 class="intro__name">Kyuwon Han</h1>
      <!-- SWAP --> <p class="intro__blurb">Actuary in training · Android developer</p>
    </header>

    <!-- Link buttons -->
    <nav class="links" aria-label="My links">
      <a class="link" href="https://github.com/kwhan">
        <span class="link__icon" aria-hidden="true">⌨</span>
        <span class="link__label">GitHub</span>
      </a>
      <a class="link" href="https://instagram.com/kwhan1115">
        <span class="link__icon" aria-hidden="true">📷</span>
        <span class="link__label">Instagram</span>
      </a>
      <a class="link" href="mailto:kwhan1115@gmail.com">
        <span class="link__icon" aria-hidden="true">✉</span>
        <span class="link__label">Email</span>
      </a>
    </nav>

    <!-- Now / about -->
    <section class="about" aria-labelledby="about-h">
      <h2 id="about-h" class="section-title">About</h2>
      <!-- SWAP --> <p>Actuary in training and Android developer. I build small,
        useful things — like Gengarchat, an on-device auto-reply app. Currently
        working through the actuarial exam sequence.</p>
    </section>

    <!-- Actuarial exam tracker (populated by module in Task 4) -->
    <section class="exams" aria-labelledby="exams-h">
      <h2 id="exams-h" class="section-title">Actuarial exams</h2>
      <div id="exam-tracker"></div>
      <noscript><p class="muted">Enable JavaScript to see exam progress.</p></noscript>
    </section>

    <footer class="foot">
      <p class="muted">© <span id="year">2026</span> Kyuwon Han</p>
    </footer>

  </main>
</body>
</html>
```

- [ ] **Step 2: Verify structure programmatically**

Run:
```bash
node -e "const h=require('fs').readFileSync('index.html','utf8'); for (const id of ['exam-tracker','about-h','exams-h']) if(!h.includes('id=\"'+id+'\"')) throw new Error('missing '+id); if(!h.includes('lang=\"en\"')||!h.includes('viewport')) throw new Error('missing lang/viewport'); console.log('structure OK');"
```
Expected: `structure OK`

- [ ] **Step 3: Verify it renders in a browser**

Run: `python -m http.server 8000` then open `http://localhost:8000`.
Expected: Unstyled but complete page — avatar (broken until Task 4 adds the file), name, blurb, three links, About paragraph, "Actuarial exams" heading with empty tracker area. All text legible.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add page skeleton and static content blocks"
```

---

### Task 3: Gengar theme stylesheet + responsive layout

**Files:**
- Create: `style.css`

**Interfaces:**
- Consumes: class/ID names from `index.html` (Task 2) and the exam-tracker markup produced by `renderExams` (Task 1): `.exam-summary`, `.exam-summary__count`, `.exam-bar`, `.exam-bar__fill`, `.exam-list`, `.exam`, `.exam--passed/scheduled/notStarted`, `.exam__icon/__name/__status`.
- Produces: final visual styling. No interface for later tasks.

- [ ] **Step 1: Create `style.css`**

```css
:root {
  --bg: #2B1B3D;
  --surface: #3A2456;
  --surface-hi: #4A2E6B;
  --accent: #C77DFF;
  --accent-bright: #E0AFFF;
  --danger: #FF5C6E;
  --text: #E8E0F0;
  --muted: #A99BC0;
  --ok: #7FE0A8;
  --radius: 14px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: radial-gradient(1200px 600px at 50% -10%, #3a2358 0%, var(--bg) 60%);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.55;
  display: flex;
  justify-content: center;
  padding: 32px 16px 64px;
}

.card { width: 100%; max-width: 600px; }

/* Intro */
.intro { text-align: center; margin-bottom: 28px; }
.avatar {
  border-radius: 50%;
  border: 3px solid var(--accent);
  box-shadow: 0 0 24px rgba(199, 125, 255, 0.35);
  background: var(--surface);
}
.intro__name { margin: 16px 0 4px; font-size: 1.9rem; color: var(--accent-bright); }
.intro__blurb { margin: 0; color: var(--muted); }

/* Links */
.links { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }
.link {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px;
  background: var(--surface);
  border: 1px solid transparent;
  border-radius: var(--radius);
  color: var(--text); text-decoration: none;
  font-weight: 600;
  transition: transform .15s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
}
.link:hover {
  background: var(--surface-hi);
  border-color: var(--accent);
  box-shadow: 0 0 18px rgba(199, 125, 255, 0.35);
  transform: translateY(-1px);
}
.link:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 2px; }
.link__icon { font-size: 1.2rem; width: 1.4rem; text-align: center; }

/* Sections */
.section-title {
  font-size: .8rem; text-transform: uppercase; letter-spacing: .12em;
  color: var(--accent); margin: 0 0 12px;
}
.about, .exams { margin-bottom: 32px; }
.about p { margin: 0; }
.muted { color: var(--muted); }

/* Exam tracker */
.exam-summary { margin-bottom: 14px; }
.exam-summary__count { font-weight: 700; color: var(--accent-bright); }
.exam-bar {
  margin-top: 8px; height: 10px; border-radius: 999px;
  background: var(--surface); overflow: hidden;
}
.exam-bar__fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent-bright));
  transition: width .4s ease;
}
.exam-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.exam {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; background: var(--surface); border-radius: var(--radius);
  border-left: 3px solid var(--muted);
}
.exam--passed    { border-left-color: var(--ok); }
.exam--scheduled { border-left-color: var(--accent); }
.exam__icon { font-size: 1.05rem; }
.exam__name { font-weight: 600; }
.exam__status { margin-left: auto; color: var(--muted); font-size: .9rem; }

/* Footer */
.foot { text-align: center; }

@media (max-width: 380px) {
  .intro__name { font-size: 1.6rem; }
  .link { padding: 12px 14px; }
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

- [ ] **Step 2: Verify styling in a browser at multiple widths**

Run: `python -m http.server 8000`, open `http://localhost:8000`, and use devtools responsive mode.
Expected: Dark purple background, glowing purple-bordered avatar, purple heading, three link rows that glow and lift on hover, uppercase section titles. At 360px width nothing overflows horizontally and text stays legible.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat: add Gengar dark theme and responsive layout"
```

---

### Task 4: Wire exam module + add avatar placeholder

**Files:**
- Modify: `index.html` (add module script before `</body>`)
- Create: `assets/avatar.svg`

**Interfaces:**
- Consumes: `EXAMS`, `renderExams` from `exams.js` (Task 1); `#exam-tracker`, `#year` from `index.html` (Task 2).
- Produces: fully populated exam tracker on page load. Final deliverable of the site build.

- [ ] **Step 1: Create `assets/avatar.svg` (initials placeholder)**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112" role="img" aria-label="KH">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4A2E6B"/>
      <stop offset="1" stop-color="#C77DFF"/>
    </linearGradient>
  </defs>
  <rect width="112" height="112" rx="56" fill="url(#g)"/>
  <text x="56" y="72" font-family="Segoe UI, Arial, sans-serif" font-size="44"
        font-weight="700" fill="#F5EEFF" text-anchor="middle">KH</text>
</svg>
```

- [ ] **Step 2: Add the module script to `index.html`**

Insert immediately before the closing `</body>` tag:

```html
  <script type="module">
    import { EXAMS, renderExams } from "./exams.js";
    document.getElementById("exam-tracker").innerHTML = renderExams(EXAMS);
    document.getElementById("year").textContent = new Date().getFullYear();
  </script>
```

- [ ] **Step 3: Verify the tracker populates in a browser**

Run: `python -m http.server 8000`, open `http://localhost:8000`.
Expected: Avatar shows "KH" gradient circle. Exam section shows "2 of 4 passed", a progress bar filled ~50%, and four rows (Exam P/FM Passed, Exam FAM Scheduled · Oct 2026, Exam SRM Not started) with correct left-border colors. Footer year is current. No console errors.

- [ ] **Step 4: Re-run unit tests to confirm nothing broke**

Run: `node --test`
Expected: PASS — all tests still green.

- [ ] **Step 5: Commit**

```bash
git add index.html assets/avatar.svg
git commit -m "feat: wire exam tracker into page and add placeholder avatar"
```

---

### Task 5: README + deploy to GitHub Pages

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the complete site (Tasks 1–4).
- Produces: live site at `https://kwhan.github.io`.

- [ ] **Step 1: Create `README.md`**

```markdown
# kwhan.github.io

My personal hub — single static page, dark Gengar theme, served by GitHub Pages.

## Edit

- Text/links: edit `index.html`.
- Exam list: edit the `EXAMS` array in `exams.js` (summary auto-updates).
- Theme colors: edit the `:root` tokens in `style.css`.
- Avatar: replace `assets/avatar.svg` (keep it square).

## Develop locally

Modules need a server (not `file://`):

    python -m http.server 8000    # then open http://localhost:8000

## Test

    node --test
```

- [ ] **Step 2: Commit the README**

```bash
git add README.md
git commit -m "docs: add README with edit and dev instructions"
```

- [ ] **Step 3: Create the GitHub repo (name MUST be `kwhan.github.io`)**

Preferred (GitHub CLI, if authenticated):
```bash
gh repo create kwhan.github.io --public --source=. --remote=origin --push
```
If `gh` is unavailable/unauthenticated, do it manually: create a public repo named exactly `kwhan.github.io` on github.com, then:
```bash
git remote add origin https://github.com/kwhan/kwhan.github.io.git
git push -u origin main
```
Expected: `main` pushed to `origin`.

- [ ] **Step 4: Enable GitHub Pages**

With `gh`:
```bash
gh api -X POST repos/kwhan/kwhan.github.io/pages -f "source[branch]=main" -f "source[path]=/" || echo "If this errors, enable Pages in Settings → Pages → Deploy from branch → main / root."
```
Otherwise: repo Settings → Pages → Source: "Deploy from a branch" → Branch `main`, folder `/ (root)` → Save.

- [ ] **Step 5: Verify the live site**

Wait ~1–2 minutes for the first Pages build, then open `https://kwhan.github.io`.
Expected: Same page as local — themed, avatar, working links, populated exam tracker. Verify on a phone (or 360px devtools) that layout holds.

---

## Self-Review

**1. Spec coverage:**
- Approach (static HTML/CSS, no framework) → Global Constraints + all tasks. ✓
- Blocks intro+photo / links / about / exam tracker → Task 2 (markup) + Task 3 (style) + Tasks 1&4 (tracker). ✓
- Visual design tokens/responsive/a11y → Task 3 (exact palette, 360px media query, focus-visible, reduced-motion) + Task 2 (semantic tags, alt). ✓
- Exam tracker data model + derived summary + three states → Task 1 (data + pure fns + tests), Task 3 (state styling), Task 4 (wiring). ✓
- Content configuration placeholders → `<!-- SWAP -->` markers in Tasks 1, 2. ✓
- Repo/deploy (user site, exact repo name) → Task 5 + Global Constraints. ✓
- Non-goals (no blog/CMS/build/backend/projects/toggle) → honored; nothing in plan adds them. ✓

**2. Placeholder scan:** No "TODO/TBD/handle edge cases" left as instructions. `<!-- SWAP -->` markers are intentional content-swap points with real default values, not missing code. ✓

**3. Type consistency:** `EXAMS`, `computeSummary`, `examRowHTML`, `renderExams` names + shapes identical across Task 1 (definition), Task 1 tests, and Task 4 (import). CSS class names in Task 3 match the strings emitted by `renderExams`/`examRowHTML` in Task 1 (`exam--passed`, `exam-bar__fill`, `exam-summary__count`, etc.). ✓
