// Actuarial exam data + pure render helpers.
// Imported by index.html (as a module) to inject the tracker, and by
// exams.test.js under `node --test`. Summary always derives from the data.

// CAS (Casualty Actuarial Society) exam track.
export const EXAMS = [
  { name: "Exam 1 · Probability",    status: "passed" },
  { name: "Exam 2 · Financial Math", status: "passed" },
  { name: "MAS-I",                   status: "passed" },
  { name: "MAS-II",                  status: "scheduled", note: "Up next" },
  { name: "Exam 5",                  status: "notStarted" },
  { name: "Exam 6",                  status: "notStarted" },
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
