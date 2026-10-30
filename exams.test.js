import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMS, REQUIREMENTS, computeSummary, credentialProgress, examRowHTML, renderExams } from "./exams.js";

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

test("examRowHTML omits date node when no date given", () => {
  const html = examRowHTML({ name: "Exam 5", status: "notStarted" });
  assert.doesNotMatch(html, /rec__date/);
});

test("an exam row is not a control", () => {
  // The record's label names what is playing now. A row that put an exam name
  // on it would be making the label lie.
  const html = examRowHTML({ name: "MAS-II", status: "scheduled", note: "Studying", date: "Sitting Oct" });
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /data-cue/);
  assert.doesNotMatch(html, /aria-label/);
  assert.doesNotMatch(html, /aria-pressed/);
  assert.match(html, /Sitting Oct/);
});

test("no rendered exam row is a control", () => {
  const html = renderExams(EXAMS, REQUIREMENTS);
  // Positive assertion: rows actually rendered. Without it, the negative assertions
  // would pass vacuously if renderExams returned an empty string or broke entirely.
  assert.match(html, /rec__name/);
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /data-cue/);
});

test("examRowHTML escapes HTML in the name", () => {
  const html = examRowHTML({ name: '"><script>', status: "passed" });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
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
    assert.ok(["passed", "waiting", "scheduled", "notStarted"].includes(e.status), "valid status");
    assert.ok(["ACAS", "FCAS"].includes(e.tier), "valid tier");
  }
});

test("a sat-but-unmarked exam reads as waiting for results", () => {
  const html = examRowHTML({ name: "MAS-II", status: "waiting", date: "Taken Jul 29" });
  assert.match(html, /rec--waiting/);
  assert.match(html, /Waiting for results/);
  assert.match(html, /Taken Jul 29/);
  assert.doesNotMatch(html, /Up next|Scheduled/);
});

// Attempt 3 was sat on 29 Oct 2026; the CAS holds results ~3 weeks. The row must
// say it has been sat, and must still not creep into the cleared count.
test("MAS-II is sat and awaiting results, not a cleared exam", () => {
  const mas2 = EXAMS.find((e) => e.name === "MAS-II");
  assert.equal(mas2.status, "waiting");
  const html = examRowHTML(mas2);
  assert.match(html, /rec--waiting/);
  assert.match(html, /Waiting for results/);
  assert.match(html, /Taken Oct 29/);
  assert.equal(computeSummary(EXAMS).passed, 3);
});

test("a waiting exam is not counted as passed", () => {
  const s = computeSummary([
    { name: "A", status: "passed" },
    { name: "B", status: "waiting" },
  ]);
  assert.deepEqual(s, { passed: 1, total: 2 });
});

test("REQUIREMENTS are well-formed and separate from the exams", () => {
  assert.ok(Array.isArray(REQUIREMENTS) && REQUIREMENTS.length === 6);
  for (const r of REQUIREMENTS) {
    assert.ok(r.name, "requirement has name");
    assert.ok(["passed", "waiting", "scheduled", "notStarted"].includes(r.status), "valid status");
    assert.equal(r.tier, "ACAS", "these are ACAS requirements");
    assert.ok(!EXAMS.some((e) => e.name === r.name), "a requirement must not also be an exam");
  }
});

test("a completed requirement counts toward the misc tally only", () => {
  const done = REQUIREMENTS.filter((r) => r.status === "passed").length;
  assert.equal(done, 2, "DA and RM are done");
  // ...and none of that leaks into the exam summary
  assert.deepEqual(computeSummary(EXAMS), { passed: 3, total: 9 });
});

test("requirements never touch the exam figures", () => {
  const withReqs = renderExams(EXAMS, REQUIREMENTS);
  const without = renderExams(EXAMS);
  for (const figure of [/exams cleared/, /03 \/ 06/, /03 \/ 09/]) {
    assert.match(withReqs, figure);
    assert.match(without, figure);
  }
  // the headline count still says 9 exams, not 13
  assert.match(withReqs, /data-to="9"/);
  assert.deepEqual(computeSummary(EXAMS), { passed: 3, total: 9 });
  assert.deepEqual(credentialProgress(EXAMS, 6), { passed: 3, requires: 6 });
});

test("requirements render under their credential with their own count", () => {
  const html = renderExams(EXAMS, REQUIREMENTS);
  assert.match(html, /ledger__misc/);
  assert.match(html, /Misc requirements/);
  assert.match(html, /02 \/ 06/); // DA and RM done, IA still open
  for (const name of ["CAS DISC · DA", "CAS DISC · RM", "CAS DISC · IA",
                      "PCPA Exam", "PCPA Project", "Course on Professionalism"]) {
    assert.ok(html.includes(name), `${name} is listed`);
  }
  // and they sit inside the ACAS tier, ahead of the FCAS block
  assert.ok(html.indexOf("Misc requirements") < html.indexOf("Fellow"), "misc block belongs to ACAS");
});

test("renderExams without requirements renders no misc block at all", () => {
  const html = renderExams(EXAMS);
  assert.doesNotMatch(html, /ledger__misc/);
  assert.doesNotMatch(html, /Misc requirements/);
});

test("a credential with no requirements gets no misc block", () => {
  const html = renderExams(EXAMS, REQUIREMENTS);
  // FCAS has none defined, so only one misc block exists on the page.
  // Match the exact class so `ledger__misclabel` doesn't count as a block.
  assert.equal((html.match(/class="ledger__misc"/g) || []).length, 1);
});
