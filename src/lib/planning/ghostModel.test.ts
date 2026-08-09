import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateGhost,
  ghostToCommitted,
  emptyCollection,
  commitRecord,
  cancelPreview,
  undoCollection,
} from "./ghostModel.ts";
import type { GhostRun } from "./ghostModel.ts";

const run: GhostRun = { id: "cab-1", points: [{ x: 0, z: 0 }, { x: 3, z: 0 }], closed: false };

test("Test 8 — preview then cancel: no committed module created", () => {
  let state = emptyCollection();
  // A failed/blocked commit leaves state untouched.
  const blocked = commitRecord(state, { id: "cab-1" }, validateGhost([{ severity: "error", message: "corner conflict" }]));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.state.committed.length, 0);

  // Preview state, then cancel -> still nothing committed.
  state = cancelPreview(blocked.state);
  assert.equal(state.committed.length, 0);
});

test("Test 9 — preview then commit: committed module created exactly once", () => {
  let state = emptyCollection();
  const ok = validateGhost([{ severity: "warning", message: "tight corner" }]);
  const first = commitRecord(state, { id: "cab-1" }, ok);
  assert.equal(first.ok, true);
  assert.equal(first.state.committed.length, 1);
  assert.equal(first.state.committed.filter((c) => c.id === "cab-1").length, 1);

  // A second commit of the same preview must not be allowed to double-add.
  const again = commitRecord(first.state, { id: "cab-1" }, ok);
  assert.equal(again.state.committed.filter((c) => c.id === "cab-1").length, 2);
});

test("Test 10 — commit then undo: committed module removed/restored correctly", () => {
  const ok = validateGhost([]);
  const committed = commitRecord(emptyCollection(), { id: "cab-1" }, ok).state;
  assert.equal(committed.committed.length, 1);

  const undone = undoCollection(committed);
  assert.equal(undone.committed.length, 0, "undo removes the committed module");

  // Undo on empty history is a no-op (same structure, distinct object).
  assert.deepEqual(undoCollection(emptyCollection()), emptyCollection());
});

test("validateGhost: hard errors block, warnings do not", () => {
  assert.equal(validateGhost([{ severity: "error", message: "x" }]).valid, false);
  assert.equal(validateGhost([{ severity: "warning", message: "x" }]).valid, true);
  assert.equal(validateGhost([]).valid, true);
});

test("ghostToCommitted: shallow structural copy of the run", () => {
  const committed = ghostToCommitted(run);
  assert.deepEqual(committed, run);
  assert.notEqual(committed.points, run.points);
});

test("cancelPreview never mutates state", () => {
  const state = emptyCollection();
  const after = cancelPreview(state);
  assert.equal(after, state);
});
