import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKS, trackPickerHTML } from "./tracks.js";

test("TRACKS is well-formed", () => {
  assert.ok(Array.isArray(TRACKS) && TRACKS.length > 0);
  for (const t of TRACKS) {
    assert.ok(t.id && typeof t.id === "string", "has an id");
    assert.ok(t.artist, "has an artist");
    assert.ok(t.title, "has a title");
    assert.match(t.src, /^\.\/assets\/audio\/[\w-]+\.m4a$/, `${t.id} src is a local m4a`);
  }
});

test("track ids are unique", () => {
  // The id is the value of data-track in the markup, so a duplicate would make
  // two rows fight over the same button state.
  assert.equal(new Set(TRACKS.map((t) => t.id)).size, TRACKS.length);
});

test("every track carries a real artist name, not a filename", () => {
  for (const t of TRACKS) assert.doesNotMatch(t.artist, /[-_/.]m4a|assets/i);
});

test("trackPickerHTML renders one button per track, keyed by id", () => {
  const html = trackPickerHTML(TRACKS);
  for (const t of TRACKS) {
    assert.ok(html.includes(`data-track="${t.id}"`), `${t.id} has a button`);
    assert.ok(html.includes(t.title), `${t.title} is named`);
  }
  assert.equal((html.match(/<button/g) || []).length, TRACKS.length);
});

test("every picker button starts unpressed", () => {
  const html = trackPickerHTML(TRACKS);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, TRACKS.length);
  assert.doesNotMatch(html, /aria-pressed="true"/);
});

test("trackPickerHTML escapes its input", () => {
  const html = trackPickerHTML([
    { id: "x&y", artist: '<script>alert(1)</script>', title: 'A "quoted" thing', src: "./assets/audio/x.m4a" },
  ]);
  assert.doesNotMatch(html, /<script>/);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("data-track=\"x&amp;y\""));
});

test("the accessible name says what pressing the button does", () => {
  const html = trackPickerHTML([
    { id: "a", artist: "Someone", title: "Something", src: "./assets/audio/a.m4a" },
  ]);
  assert.match(html, /aria-label="Play Something by Someone\."/);
});
