import { test } from "node:test";
import assert from "node:assert/strict";
import { pressIntent } from "./deck.js";

test("a click on the centre label pauses", () => {
  assert.equal(pressIntent({ onLabel: true, didDrag: false, keyboard: false }), "toggle");
});

test("a click on the outer disc does nothing", () => {
  // The disc is the instrument; the label is the transport. One pause target,
  // so the centre actually means something.
  assert.equal(pressIntent({ onLabel: false, didDrag: false, keyboard: false }), "ignore");
});

test("a drag that began on the label spins the record, it does not pause it", () => {
  // Otherwise the middle of the instrument is a dead zone.
  assert.equal(pressIntent({ onLabel: true, didDrag: true, keyboard: false }), "ignore");
});

test("a drag on the outer disc does nothing either", () => {
  assert.equal(pressIntent({ onLabel: false, didDrag: true, keyboard: false }), "ignore");
});

test("the keyboard always pauses, wherever the pointer happens to be", () => {
  // There is one focusable control, and space or enter on it is the transport.
  // A keyboard press reports no coordinates, so it can never be "on the label".
  assert.equal(pressIntent({ onLabel: false, didDrag: false, keyboard: true }), "toggle");
  assert.equal(pressIntent({ onLabel: false, didDrag: true, keyboard: true }), "toggle");
});
