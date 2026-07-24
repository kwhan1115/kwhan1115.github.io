// Actuarial exam data + pure render helpers for the "Liner Notes" exam ledger.
// Imported by index.html (as a module) and by exams.test.js under `node --test`.
// Every figure (overall count + per-credential progress) derives from the data.

// CAS (Casualty Actuarial Society) track. Credentials are cumulative milestones
// on the ordered list: first 6 -> ACAS, all 9 -> FCAS.
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

const TIER_META = {
  ACAS: { label: "Associate", abbr: "ACAS", requires: 6 },
  FCAS: { label: "Fellow",    abbr: "FCAS", requires: 9 },
};

const LABEL = { passed: "Passed", scheduled: "Scheduled", notStarted: "Not started" };
const pad2 = (n) => String(n).padStart(2, "0");

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
  const stat = status === "scheduled" && exam.note ? escapeHTML(exam.note) : LABEL[status];
  return `<li class="rec rec--${status}">` +
    `<span class="rec__mark" aria-hidden="true"></span>` +
    `<span class="rec__name">${escapeHTML(exam.name)}</span>` +
    `<span class="rec__stat">${stat}</span>` +
    `</li>`;
}

export function renderExams(exams) {
  const { passed, total } = computeSummary(exams);

  // group by tier, preserving first-appearance order (untiered -> single group)
  const groups = [];
  for (const e of exams) {
    const key = e.tier ?? "";
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, items: [] }; groups.push(g); }
    g.items.push(e);
  }

  const tiersHTML = groups.map((g) => {
    const meta = TIER_META[g.key];
    const head = meta
      ? `<div class="ledger__tierhead">` +
          `<span class="ledger__cred">${meta.label} <span class="ledger__abbr">${meta.abbr}</span></span>` +
          `<span class="ledger__prog">${pad2(credentialProgress(exams, meta.requires).passed)} / ${pad2(meta.requires)}</span>` +
        `</div>`
      : "";
    return `<div class="ledger__tier">${head}<ol class="ledger__list">${g.items.map(examRowHTML).join("")}</ol></div>`;
  }).join("");

  return `<div class="ledger">` +
      `<div class="ledger__masthead">` +
        `<span class="ledger__figure">` +
          `<span class="ledger__num" data-to="${passed}">${pad2(passed)}</span>` +
          `<span class="ledger__slash">/</span>` +
          `<span class="ledger__num" data-to="${total}">${pad2(total)}</span>` +
        `</span>` +
        `<span class="ledger__caption">exams cleared · CAS track</span>` +
      `</div>` +
      tiersHTML +
    `</div>`;
}
