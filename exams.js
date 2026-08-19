// Actuarial exam data + pure render helpers for the "Liner Notes" exam ledger.
// Imported by index.html (as a module) and by exams.test.js under `node --test`.
// Every figure (overall count + per-credential progress) derives from the data.

// CAS (Casualty Actuarial Society) track. Credentials are cumulative milestones
// on the ordered list: first 6 -> ACAS, all 9 -> FCAS.
export const EXAMS = [
  { name: "Exam 1 · Probability",    status: "passed",     tier: "ACAS" },
  { name: "Exam 2 · Financial Math", status: "passed",     tier: "ACAS" },
  { name: "MAS-I",                   status: "passed",     tier: "ACAS" },
  { name: "MAS-II",                  status: "scheduled",  tier: "ACAS", note: "Studying", date: "Sitting Oct" },
  { name: "Exam 5",                  status: "notStarted", tier: "ACAS" },
  { name: "Exam 6",                  status: "notStarted", tier: "ACAS" },
  { name: "Exam 7",                  status: "notStarted", tier: "FCAS" },
  { name: "Exam 8",                  status: "notStarted", tier: "FCAS" },
  { name: "Exam 9",                  status: "notStarted", tier: "FCAS" },
];

// The non-exam requirements. Deliberately a separate list rather than more
// entries in EXAMS: the headline figure counts *exams* cleared, and the
// credential maths walks the first N of the ordered exam list, so mixing these
// in would silently corrupt both.
// The three DISCs are listed individually rather than as one line: two are
// done and one isn't, and a single "CAS DISCs" row could only be honest about
// that by hiding the detail.
export const REQUIREMENTS = [
  { name: "CAS DISC · DA",             status: "passed",     tier: "ACAS" },
  { name: "CAS DISC · RM",             status: "passed",     tier: "ACAS" },
  { name: "CAS DISC · IA",             status: "notStarted", tier: "ACAS" },
  { name: "PCPA Exam",                 status: "notStarted", tier: "ACAS" },
  { name: "PCPA Project",              status: "notStarted", tier: "ACAS" },
  { name: "Course on Professionalism", status: "notStarted", tier: "ACAS" },
];

const TIER_META = {
  ACAS: { label: "Associate", abbr: "ACAS", requires: 6 },
  FCAS: { label: "Fellow",    abbr: "FCAS", requires: 9 },
};

const STATUSES = ["passed", "waiting", "scheduled", "notStarted"];
const LABEL = {
  passed: "Passed",
  waiting: "Waiting for results",
  scheduled: "Scheduled",
  notStarted: "Not started",
};
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

// A row in the ledger. Not a control: the record's label names whatever is
// playing, and a row that could overwrite it would be making the label lie.
export function examRowHTML(exam) {
  const status = STATUSES.includes(exam.status) ? exam.status : "notStarted";
  const label = exam.note ? escapeHTML(exam.note) : LABEL[status];
  const date = exam.date ? `<span class="rec__date">${escapeHTML(exam.date)}</span>` : "";
  const name = escapeHTML(exam.name);
  return `<li class="rec rec--${status}">` +
    `<span class="rec__mark" aria-hidden="true"></span>` +
    `<span class="rec__name">${name}</span>` +
    `<span class="rec__stat"><span class="rec__label">${label}</span>${date}</span>` +
  `</li>`;
}

// The non-exam requirements for a credential, shown under that credential's
// exams with their own count — they are not exams and must never be added to
// the exam figures.
function requirementsHTML(items) {
  const done = items.filter((i) => i.status === "passed").length;
  return `<div class="ledger__misc">` +
      `<div class="ledger__subhead">` +
        `<span class="ledger__misclabel">Misc requirements</span>` +
        `<span class="ledger__prog">${pad2(done)} / ${pad2(items.length)}</span>` +
      `</div>` +
      `<ol class="ledger__list">${items.map(examRowHTML).join("")}</ol>` +
    `</div>`;
}

export function renderExams(exams, requirements = []) {
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
    const misc = requirements.filter((r) => (r.tier ?? "") === g.key);
    return `<div class="ledger__tier">${head}<ol class="ledger__list">${g.items.map(examRowHTML).join("")}</ol>` +
      (misc.length ? requirementsHTML(misc) : "") +
    `</div>`;
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
