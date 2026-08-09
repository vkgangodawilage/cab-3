import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyModule,
  moduleObstacleViolation,
  gapStatus,
  obbOverlap,
  computeOverlapViolations,
  aggregateRun,
  aggregateAll,
} from "./planVerification.ts";
import type {
  MeasuredModule,
  PlannedModule,
  MeasuredWithKind,
  VerifyThresholds,
} from "./planVerification.ts";
import { VERIFY_DEFAULTS } from "./config.ts";

const T: VerifyThresholds = { ...VERIFY_DEFAULTS };

function planned(overrides: Partial<PlannedModule> = {}): PlannedModule {
  return {
    id: "cab#base#0",
    layer: "base",
    kind: "double-door",
    widthMm: 800,
    depthMm: 600,
    heightMm: 860,
    centerXmm: 1000,
    centerYmm: 430,
    centerZmm: 0,
    rotationY: 0,
    tMm: 1000,
    blockedBaseMm: [],
    blockedTopMm: [],
    ...overrides,
  };
}

function measured(overrides: Partial<MeasuredModule> = {}): MeasuredModule {
  return {
    widthMm: 800,
    heightMm: 860,
    depthMm: 600,
    centerX: 1000,
    centerY: 430,
    centerZ: 0,
    rotationY: 0,
    ...overrides,
  };
}

function mw(m: MeasuredModule): MeasuredWithKind {
  return { id: "m", layer: "base", kind: "double-door", measured: m };
}

test("Test 1 — exact match: PASS", () => {
  const r = verifyModule(planned(), measured(), T);
  assert.equal(r.status, "PASS");
  assert.equal(r.dimensions.width.status, "PASS");
  assert.equal(r.position.x.status, "PASS");
});

test("Test 2 — small dimension difference within soft tolerance: PASS", () => {
  const r = verifyModule(planned(), measured({ widthMm: 815 }), T); // +15mm <= 20
  assert.equal(r.status, "PASS");
  assert.equal(r.dimensions.width.status, "PASS");
});

test("Test 3 — dimension error beyond hard tolerance: ERROR", () => {
  const r = verifyModule(planned(), measured({ widthMm: 900 }), T); // +100mm > 45
  assert.equal(r.status, "ERROR");
  assert.equal(r.dimensions.width.status, "ERROR");
  assert.ok(r.diagnostics.some((d) => d.includes("width")));
});

test("Test 4 — position within tolerance: PASS", () => {
  const r = verifyModule(planned(), measured({ centerX: 1010 }), T); // +10mm <= 25
  assert.equal(r.position.x.status, "PASS");
  assert.equal(r.status, "PASS");
});

test("Test 5 — position error: ERROR", () => {
  const r = verifyModule(planned(), measured({ centerX: 1100 }), T); // +100mm > 80
  assert.equal(r.position.x.status, "ERROR");
  assert.equal(r.status, "ERROR");
});

test("Test 6 — wall gap within tolerance: PASS", () => {
  assert.equal(gapStatus(10, T), "PASS");
});

test("Test 7 — unexpected wall gap: WARNING then ERROR by threshold", () => {
  assert.equal(gapStatus(30, T), "WARNING"); // >20 soft, <=60 hard
  assert.equal(gapStatus(70, T), "ERROR"); // >60 hard
});

test("Test 8 — module outside usable interval: ERROR violation", () => {
  const p = planned({ tMm: 1000, blockedBaseMm: [{ start: 800, end: 1200 }] });
  const v = moduleObstacleViolation(p, measured(), T);
  assert.ok(v, "expected an obstacle violation");
  assert.ok(v!.includes("blocked interval"));
});

test("Test 9 — obstacle penetration surfaced through the run", () => {
  const p = planned({ tMm: 1000, blockedBaseMm: [{ start: 800, end: 1200 }] });
  const run = aggregateRun({
    runId: "cab",
    runLengthMm: 2000,
    baseReservedMm: 0,
    plannedModules: [p],
    measured: { [p.id]: measured() },
    thresholds: T,
  });
  assert.equal(run.obstacleViolations.length, 1);
  assert.equal(run.status, "ERROR");
});

test("Test 10 — intentional corner reservation is NOT an overlap", () => {
  // l-corner modules (diagonal door/footprint) are skipped.
  const corner: MeasuredWithKind = { id: "corner", layer: "base", kind: "l-corner", measured: measured({ centerX: 0, centerZ: 0 }) };
  const adjacent: MeasuredWithKind = { id: "adj", layer: "base", kind: "filler", measured: measured({ centerX: 200, centerZ: 200 }) };
  assert.deepEqual(computeOverlapViolations([corner, adjacent], 0.005), []);

  // Corner reservations are empty regions -> no module, nothing to flag.
  assert.deepEqual(computeOverlapViolations([], 0.005), []);
});

test("Test 11 — unexpected cabinet overlap: ERROR", () => {
  const a = mw(measured({ centerX: 0, centerZ: 0 }));
  const b = mw(measured({ centerX: 700, centerZ: 0 })); // 800-wide boxes overlap
  assert.equal(obbOverlap(
    { cx: 0, cz: 0, hw: 0.4, hd: 0.3, rotation: 0 },
    { cx: 0.7, cz: 0, hw: 0.4, hd: 0.3, rotation: 0 }
  ), true);
  const violations = computeOverlapViolations([a, b], 0.005);
  assert.equal(violations.length, 1);
  assert.ok(violations[0].includes("overlaps"));
});

test("Test 12 — run + overall aggregation counts", () => {
  const p1 = planned({ id: "a", tMm: 1000, blockedBaseMm: [] });
  const p2 = planned({ id: "b", tMm: 1800 });
  const p3 = planned({ id: "c", tMm: 2600 });
  const run = aggregateRun({
    runId: "r1",
    runLengthMm: 3400,
    baseReservedMm: 0,
    plannedModules: [p1, p2, p3],
    measured: {
      [p1.id]: measured(),
      [p2.id]: measured({ widthMm: 900 }), // ERROR
      [p3.id]: measured(),
    },
    thresholds: T,
  });
  assert.equal(run.plannedCount, 3);
  assert.equal(run.measuredCount, 3);
  assert.equal(run.status, "ERROR");

  const all = aggregateAll([run], [], [], 0);
  assert.equal(all.moduleCount, 3);
  assert.equal(all.passed, 2);
  assert.equal(all.warnings, 0);
  assert.equal(all.errors, 1);
  assert.equal(all.overall, "ERROR");
});

test("Test 13 — determinism: same inputs -> same result", () => {
  const p = planned();
  const m = measured({ widthMm: 815 });
  const a = verifyModule(p, m, T);
  const b = verifyModule(p, m, T);
  assert.deepEqual(a, b);

  const runA = aggregateRun({ runId: "r", runLengthMm: 1000, baseReservedMm: 200, plannedModules: [p], measured: { [p.id]: m }, thresholds: T });
  const runB = aggregateRun({ runId: "r", runLengthMm: 1000, baseReservedMm: 200, plannedModules: [p], measured: { [p.id]: m }, thresholds: T });
  assert.deepEqual(runA, runB);
});

test("Missing measured module -> ERROR, not silently skipped", () => {
  const r = verifyModule(planned(), null, T);
  assert.equal(r.status, "ERROR");
  assert.equal(r.measured, false);
  assert.ok(r.diagnostics.some((d) => d.includes("not measured")));
});
