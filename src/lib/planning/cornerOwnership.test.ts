import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCorners } from "./cornerOwnership.ts";
import type { CornerEdge, CornerLayerReservations } from "./cornerOwnership.ts";

function seg(id: string, key: string, ax: number, az: number, bx: number, bz: number): CornerEdge {
  return { id, segmentKey: key, a: { x: ax, z: az }, b: { x: bx, z: bz } };
}

function blockedWith(map: Record<string, CornerLayerReservations>) {
  return map;
}

test("Test 1 — straight wall: no corner reservation", () => {
  const edges = [
    seg("r1", "r1#0", 0, 0, 3, 0),
    seg("r2", "r2#0", 3, 0, 6, 0), // collinear (parallel, not perpendicular)
  ];
  const result = detectCorners(edges);
  assert.equal(result.turns.length, 0);
  assert.deepEqual(result.reservations, {});
});

test("Test 1b — unrelated far segments: no corner", () => {
  const edges = [
    seg("r1", "r1#0", 0, 0, 3, 0),
    seg("r2", "r2#0", 6, 6, 6, 9),
  ];
  const result = detectCorners(edges);
  assert.equal(result.turns.length, 0);
});

test("Test 2 — L corner: one owner and one reserved return", () => {
  const edges = [
    seg("r1", "r1#0", 0, 0, 3, 0),
    seg("r2", "r2#0", 3, 0, 3, 3),
  ];
  const result = detectCorners(edges);
  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0].ownerKey, "r1#0");
  assert.equal(result.turns[0].returnKey, "r2#0");
  // r2 (non-owner) reserves a base return 625mm and a top return 350mm at its start.
  assert.deepEqual(result.reservations["r2#0"]?.base, [{ start: 0, end: 625 }]);
  assert.deepEqual(result.reservations["r2#0"]?.top, [{ start: 0, end: 350 }]);
});

test("Test 3 — reverse segment order: deterministic ownership", () => {
  const forward = detectCorners([
    seg("r1", "r1#0", 0, 0, 3, 0),
    seg("r2", "r2#0", 3, 0, 3, 3),
  ]);
  const reversed = detectCorners([
    seg("r2", "r2#0", 3, 0, 3, 3),
    seg("r1", "r1#0", 0, 0, 3, 0),
  ]);
  assert.equal(reversed.turns.length, 1);
  assert.equal(reversed.turns[0].ownerKey, forward.turns[0].ownerKey);
  assert.equal(reversed.turns[0].returnKey, forward.turns[0].returnKey);
  assert.deepEqual(reversed.reservations, forward.reservations);
});

test("Test 4 — U kitchen: two independent corner reservations", () => {
  const edges = [
    seg("rB", "rB#0", 0, 0, 3, 0),
    seg("rL", "rL#0", 0, 0, 0, 3),
    seg("rR", "rR#0", 3, 0, 3, 3),
  ];
  const result = detectCorners(edges);
  assert.equal(result.turns.length, 2);
  // Both side runs back off from the corners they touch.
  assert.deepEqual(result.reservations["rL#0"]?.base, [{ start: 0, end: 625 }]);
  assert.deepEqual(result.reservations["rR#0"]?.base, [{ start: 0, end: 625 }]);
  // The bottom run owns both corners: it must NOT be blocked against itself.
  assert.equal(result.reservations["rB#0"], undefined);
});

test("Test 5 — corner + obstacle at the corner: error diagnostic, NO reservation, never overlaps", () => {
  const edges = [
    seg("r1", "r1#0", 0, 0, 3, 0),
    seg("r2", "r2#0", 3, 0, 3, 3),
  ];
  // A door sits right at r2's corner end.
  const blocked = blockedWith({
    "r2#0": { base: [{ start: 0, end: 900 }], top: [] },
  });
  const result = detectCorners(edges, blocked);
  assert.equal(result.turns.length, 0, "no reservation when unresolvable");
  assert.equal(result.reservations["r2#0"], undefined);
  assert.ok(result.diagnostics.some((d) => d.severity === "error"));
});

test("Test 5b — corner + obstacle away from corner: return avoids the opening", () => {
  const edges = [
    seg("r1", "r1#0", 0, 0, 3, 0),
    seg("r2", "r2#0", 3, 0, 3, 3),
  ];
  // Door on r2 far from the corner.
  const blocked = blockedWith({
    "r2#0": { base: [{ start: 2000, end: 2900 }], top: [] },
  });
  const result = detectCorners(edges, blocked);
  assert.equal(result.turns.length, 1);
  const ret = result.reservations["r2#0"]?.base[0];
  assert.ok(ret, "return reserved");
  // Return [0,625] must not overlap the door [2000,2900].
  assert.ok(ret.end <= 2000 || ret.start >= 2900, "return overlaps the opening");
});

test("Test 6 — insufficient space: return clamps to full short segment + warning, never overlaps", () => {
  const edges = [
    seg("r1", "r1#0", 0, 0, 3, 0),
    seg("r2", "r2#0", 3, 0, 3, 0.4), // only 400mm long
  ];
  const result = detectCorners(edges);
  assert.equal(result.turns.length, 1);
  const ret = result.reservations["r2#0"]?.base[0];
  assert.ok(ret, "return reserved");
  assert.equal(ret.end - ret.start, 400, "clamped to the full short segment");
  assert.ok(result.diagnostics.some((d) => d.severity === "warning"));
});

test("Test 7 — parallel segments: no false corner", () => {
  const edges = [
    seg("r1", "r1#0", 0, 0, 3, 0),
    seg("r2", "r2#0", 0, 2, 3, 2), // parallel, offset
  ];
  const result = detectCorners(edges);
  assert.equal(result.turns.length, 0);
});

test("Internal corners of a single run are left to planRunLayout", () => {
  const edges = [
    seg("r1", "r1#0", 0, 0, 3, 0),
    seg("r1", "r1#1", 3, 0, 3, 3), // same run id
  ];
  const result = detectCorners(edges);
  assert.equal(result.turns.length, 0);
  assert.deepEqual(result.reservations, {});
});
