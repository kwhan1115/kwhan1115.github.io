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

test("credentialProgress counts passed within the first N exams only", () => {
  const exams = [
    { name: "1", status: "passed" },
    { name: "2", status: "passed" },
    { name: "3", status: "notStarted" },
    { name: "4", status: "passed" },
  ];
  assert.deepEqual(credentialProgress(exams, 3), { passed: 2, requires: 3 });
  assert.deepEqual(credentialProgress(exams, 4), { passed: 3, requires: 4 });
});

test("examRowHTML includes name, status class, and scheduled note", () => {
  const html = examRowHTML({ name: "Exam FAM", status: "scheduled", note: "Up next" });
  assert.match(html, /rec--scheduled/);
  assert.match(html, /Exam FAM/);
  assert.match(html, /Up next/);
});

test("examRowHTML escapes HTML in user content", () => {
  const html = examRowHTML({ name: "<b>x</b>", status: "passed" });
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /&lt;b&gt;/);
});

test("renderExams renders one record row per exam", () => {
  const html = renderExams([
    { name: "A", status: "passed" },
    { name: "B", status: "scheduled" },
  ]);
  assert.equal((html.match(/class="rec /g) || []).length, 2);
  assert.match(html, /01/); // padded passed
  assert.match(html, /02/); // padded total
});

test("renderExams shows ACAS/FCAS ledger with padded credential figures", () => {
  const html = renderExams(EXAMS);
  assert.match(html, /exams cleared/);
  assert.match(html, /Associate/);
  assert.match(html, /ACAS/);
  assert.match(html, /Fellow/);
  assert.match(html, /FCAS/);
  assert.match(html, /03 \/ 06/); // ACAS progress
  assert.match(html, /03 \/ 09/); // FCAS progress
  assert.equal((html.match(/class="ledger__tier"/g) || []).length, 2);
  assert.equal((html.match(/class="rec /g) || []).length, 9);
});

test("EXAMS default data is well-formed (9 exams, valid status + tier)", () => {
  assert.ok(Array.isArray(EXAMS) && EXAMS.length === 9);
  for (const e of EXAMS) {
    assert.ok(e.name, "exam has name");
    assert.ok(["passed", "scheduled", "notStarted"].includes(e.status), "valid status");
    assert.ok(["ACAS", "FCAS"].includes(e.tier), "valid tier");
  }
});
