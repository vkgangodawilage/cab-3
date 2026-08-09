import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyPlacedItem,
  computePlacedOverlapViolations,
  aggregateAll,
} from "./planVerification.ts";
import type {
  MeasuredModule,
  PlannedPlacedItem,
  MeasuredPlacedWithElevation,
  VerifyThresholds,
} from "./planVerification.ts";
import { VERIFY_DEFAULTS } from "./config.ts";

const T: VerifyThresholds = { ...VERIFY_DEFAULTS };

// Wall A: horizontal from (0,0) to (3,0), outward normal +z.
function planned(overrides: Partial<PlannedPlacedItem> = {}): PlannedPlacedItem {
  return {
    id: "item-1",
    catalogId: "pantry-tower",
    label: "Tall Pantry",
    wallId: "wall#0",
    elevation: "floor",
    widthMm: 800,
    heightMm: 2100,
    depthMm: 600,
    centerXmm: 1500,
    centerYmm: 1050,
    centerZmm: 375, // WALL_THICKNESS/2 (75) + depth/2 (300)
    rotationY: 0,
    wallSegA: { x: 0, z: 0 },
    wallSegB: { x: 3, z: 0 },
    backOffsetMm: 375,
    blockedMm: [],
    reservedMm: [],
    ...overrides,
  };
}

function measured(overrides: Partial<MeasuredModule> = {}): MeasuredModule {
  return {
    widthMm: 800,
    heightMm: 2100,
    depthMm: 600,
    centerX: 1500,
    centerY: 1050,
    centerZ: 375,
    rotationY: 0,
    ...overrides,
  };
}

test("Test 1 — catalog dimensions when no custom dims (planned width = catalog)", () => {
  // verifyPlacedItem's planned width is supplied by the caller; assert the
  // planned values flow into the result unchanged when actual matches.
  const r = verifyPlacedItem(planned(), measured(), T);
  assert.equal(r.dimensions.width.plannedMm, 800);
  assert.equal(r.dimensions.height.plannedMm, 2100);
  assert.equal(r.dimensions.depth.plannedMm, 600);
});

test("Test 2 — custom width overrides catalog width in planned dims", () => {
  const r = verifyPlacedItem(planned({ widthMm: 1000 }), measured({ widthMm: 1000 }), T);
  assert.equal(r.dimensions.width.plannedMm, 1000);
  assert.equal(r.dimensions.width.status, "PASS");
});

test("Test 3 — exact match: PASS", () => {
  const r = verifyPlacedItem(planned(), measured(), T);
  assert.equal(r.status, "PASS");
});

test("Test 4 — small dimension difference within tolerance: PASS", () => {
  const r = verifyPlacedItem(planned(), measured({ widthMm: 812 }), T); // +12 <= 20
  assert.equal(r.dimensions.width.status, "PASS");
});

test("Test 5 — large dimension difference: ERROR", () => {
  const r = verifyPlacedItem(planned(), measured({ widthMm: 900 }), T); // +100 > 45
  assert.equal(r.dimensions.width.status, "ERROR");
  assert.equal(r.status, "ERROR");
});

test("Test 6 — position within tolerance: PASS", () => {
  const r = verifyPlacedItem(planned(), measured({ centerX: 1520 }), T); // +20 <= 25
  assert.equal(r.position.x.status, "PASS");
});

test("Test 7 — position error: ERROR", () => {
  const r = verifyPlacedItem(planned(), measured({ centerX: 1600 }), T); // +100 > 80
  assert.equal(r.position.x.status, "ERROR");
  assert.equal(r.status, "ERROR");
});

test("Test 8 — correct wall anchor: PASS", () => {
  const r = verifyPlacedItem(planned(), measured(), T);
  assert.equal(r.wallDistance.status, "PASS");
  assert.equal(r.rotationStatus, "PASS");
  assert.equal(r.alongWall.status, "PASS");
});

test("Test 9 — wrong wall anchor: ERROR", () => {
  // Measured centre sits far from the wall line.
  const r = verifyPlacedItem(planned(), measured({ centerZ: 2000 }), T);
  assert.equal(r.wallDistance.status, "ERROR");
  assert.equal(r.status, "ERROR");
});

test("Test 10 — blocked opening penetration: ERROR", () => {
  const r = verifyPlacedItem(
    planned({ blockedMm: [{ start: 1200, end: 1800 }] }), // item spans 1100..1900
    measured(),
    T
  );
  assert.equal(r.obstacleViolations.length, 1);
  assert.equal(r.status, "ERROR");
});

test("Test 11 — reserved corner region penetration: ERROR", () => {
  const r = verifyPlacedItem(
    planned({ reservedMm: [{ start: 0, end: 625 }] }), // item starts at 1100
    measured({ centerX: 300 }), // item now spans 0..600 -> inside reservation
    T
  );
  assert.equal(r.cornerViolations.length, 1);
  assert.equal(r.status, "ERROR");
});

test("Test 12 — intentional arrangement: no false overlap", () => {
  // Two items on different elevations (floor + wall) at the same XZ.
  const a: MeasuredPlacedWithElevation = { id: "a", elevation: "floor", measured: measured({ centerX: 0, centerZ: 0 }) };
  const b: MeasuredPlacedWithElevation = { id: "b", elevation: "wall", measured: measured({ centerX: 0, centerZ: 0 }) };
  assert.deepEqual(computePlacedOverlapViolations([a, b], 0.005), []);
});

test("Test 13 — unexpected overlap: ERROR", () => {
  const a: MeasuredPlacedWithElevation = { id: "a", elevation: "floor", measured: measured({ centerX: 0, centerZ: 0 }) };
  const b: MeasuredPlacedWithElevation = { id: "b", elevation: "floor", measured: measured({ centerX: 700, centerZ: 0 }) };
  const violations = computePlacedOverlapViolations([a, b], 0.005);
  assert.equal(violations.length, 1);
  assert.ok(violations[0].includes("overlaps"));
});

test("Test 14 — missing runtime object: ERROR (not measured)", () => {
  const r = verifyPlacedItem(planned(), null, T);
  assert.equal(r.status, "ERROR");
  assert.equal(r.measured, false);
  assert.ok(r.diagnostics.some((d) => d.includes("not measured")));
});

test("Test 15 — deleted item excluded from aggregation", () => {
  // aggregateAll only counts the placed results it is given; a deleted item is
  // simply not in the list.
  const r = verifyPlacedItem(planned(), measured(), T);
  const all = aggregateAll([], [r], [], 0);
  assert.equal(all.placedCount, 1);
  const empty = aggregateAll([], [], [], 0);
  assert.equal(empty.placedCount, 0);
  assert.equal(empty.placedErrors, 0);
});

test("Test 16 — determinism: same inputs -> same result", () => {
  const p = planned();
  const m = measured({ widthMm: 812 });
  const a = verifyPlacedItem(p, m, T);
  const b = verifyPlacedItem(p, m, T);
  assert.deepEqual(a, b);

  const allA = aggregateAll([], [a], [], 0);
  const allB = aggregateAll([], [b], [], 0);
  assert.deepEqual(allA, allB);
});

test("aggregateAll includes placed counts and rolls them into overall", () => {
  const ok = verifyPlacedItem(planned(), measured(), T);
  const bad = verifyPlacedItem(planned(), measured({ centerX: 2000 }), T);
  const all = aggregateAll([], [ok, bad], [], 0);
  assert.equal(all.placedPassed, 1);
  assert.equal(all.placedErrors, 1);
  assert.equal(all.overall, "ERROR");
});
