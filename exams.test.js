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
