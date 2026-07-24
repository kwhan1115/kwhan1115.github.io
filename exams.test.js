import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMS, computeSummary, credentialProgress, examRowHTML, renderExams } from "./exams.js";

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
  assert.match(html, /1 of 2 exams passed/);
  assert.equal((html.match(/<li /g) || []).length, 2);
  assert.match(html, /width:\s*50%/);
});

test("credentialProgress counts passed within the first N exams only", () => {
  const exams = [
    { name: "1", status: "passed" },
    { name: "2", status: "passed" },
    { name: "3", status: "notStarted" },
    { name: "4", status: "passed" }, // beyond the first 3 — must not count for requires=3
  ];
  assert.deepEqual(credentialProgress(exams, 3), { passed: 2, requires: 3 });
  assert.deepEqual(credentialProgress(exams, 4), { passed: 3, requires: 4 });
});

test("renderExams shows ACAS and FCAS tier headers with credential progress", () => {
  const html = renderExams(EXAMS);
  // headline over all 9
  assert.match(html, /3 of 9 exams passed/);
  // both credentials labeled
  assert.match(html, /Associate/);
  assert.match(html, /ACAS/);
  assert.match(html, /Fellow/);
  assert.match(html, /FCAS/);
  // progress toward each credential
  assert.match(html, /3 \/ 6/); // ACAS
  assert.match(html, /3 \/ 9/); // FCAS
  // two tier groups
  assert.equal((html.match(/class="exam-tier"/g) || []).length, 2);
});

test("EXAMS default data is well-formed (9 exams, valid status + tier)", () => {
  assert.ok(Array.isArray(EXAMS) && EXAMS.length === 9);
  for (const e of EXAMS) {
    assert.ok(e.name, "exam has name");
    assert.ok(["passed", "scheduled", "notStarted"].includes(e.status), "valid status");
    assert.ok(["ACAS", "FCAS"].includes(e.tier), "valid tier");
  }
});
