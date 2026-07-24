// Actuarial exam data + pure render helpers.
// Imported by index.html (as a module) to inject the tracker, and by
// exams.test.js under `node --test`. Summary + credential progress derive
// from the data so nothing can drift.

// CAS (Casualty Actuarial Society) track. Credentials are cumulative
// milestones on the ordered exam list: first 6 -> ACAS, all 9 -> FCAS.
export const EXAMS = [
  { name: "Exam 1 · Probability",    status: "passed",     tier: "ACAS" },
  { name: "Exam 2 · Financial Math", status: "passed",     tier: "ACAS" },
  { name: "MAS-I",                   status: "passed",     tier: "ACAS" },
  { name: "MAS-II",                  status: "scheduled",  tier: "ACAS", note: "Up next" },
  { name: "Exam 5",                  status: "notStarted", tier: "ACAS" },
  { name: "Exam 6",                  status: "notStarted", tier: "ACAS" },
  { name: "Exam 7",                  status: "notStarted", tier: "FCAS" },
  { name: "Exam 8",                  status: "notStarted", tier: "FCAS" },
  { name: "Exam 9",                  status: "notStarted", tier: "FCAS" },
];

// Credential metadata keyed by tier. `requires` = how many exams (from the
// start of the list) that credential needs.
const TIER_META = {
  ACAS: { label: "Associate", sub: "ACAS", requires: 6 },
  FCAS: { label: "Fellow",    sub: "FCAS", requires: 9 },
};

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

// Passed exams among the first `requires` of the ordered list.
export function credentialProgress(exams, requires) {
  const passed = exams.slice(0, requires).filter((e) => e.status === "passed").length;
  return { passed, requires };
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

  // Group by tier, preserving first-appearance order. Untiered exams fall
  // into a single headerless group (backward compatible).
  const groups = [];
  for (const e of exams) {
    const key = e.tier ?? "";
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, items: [] }; groups.push(g); }
    g.items.push(e);
  }

  const groupsHTML = groups.map((g) => {
    const meta = TIER_META[g.key];
    const head = meta
      ? `<div class="exam-tier__head">` +
          `<span class="exam-tier__name">${meta.label} · <b>${meta.sub}</b></span>` +
          `<span class="exam-tier__count">${credentialProgress(exams, meta.requires).passed} / ${meta.requires}</span>` +
        `</div>`
      : "";
    return `<div class="exam-tier">${head}<ul class="exam-list">${g.items.map(examRowHTML).join("")}</ul></div>`;
  }).join("");

  return `<div class="exam-summary">` +
      `<span class="exam-summary__count">${passed} of ${total} exams passed</span>` +
      `<div class="exam-bar" role="progressbar" aria-valuenow="${passed}" aria-valuemin="0" aria-valuemax="${total}" aria-label="Exams passed">` +
        `<div class="exam-bar__fill" style="width: ${pct}%"></div>` +
      `</div>` +
    `</div>` + groupsHTML;
}
