import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyEndPanel,
  toPlannedEndPanel,
  aggregateRun,
  verifyPlacedItem,
  aggregateAll,
} from "./planVerification.ts";
import type {
  MeasuredModule,
  PlannedModule,
  PlannedPlacedItem,
  VerifyThresholds,
} from "./planVerification.ts";
import { deriveEndPanels } from "./endPanels.ts";
import type { EndPanelPlan, RunLike, WallLike } from "./endPanels.ts";
import { VERIFY_DEFAULTS } from "./config.ts";

const T: VerifyThresholds = { ...VERIFY_DEFAULTS };

function ep(overrides: Partial<EndPanelPlan> = {}): EndPanelPlan {
  return {
    id: "r1#endpanel#start#base",
    runId: "r1",
    side: "start",
    layer: "base",
    position: [-0.009, 0.43, 0.3],
    rotationY: 0,
    thicknessM: 0.018,
    depthM: 0.6,
    heightM: 0.86,
    material: "door",
    reason: "exposed",
    diagnostics: [],
    ...overrides,
  };
}

function meas(overrides: Partial<MeasuredModule> = {}): MeasuredModule {
  return {
    widthMm: 18,
    heightMm: 860,
    depthMm: 600,
    centerX: -9,
    centerY: 430,
    centerZ: 300,
    rotationY: 0,
    ...overrides,
  };
}

function run(id: string, pts: [number, number][], extra: Partial<RunLike> = {}): RunLike {
  return { id, points: pts.map(([x, z]) => ({ x, z })), closed: false, ...extra };
}
function wall(id: string, pts: [number, number][]): WallLike {
  return { id, points: pts.map(([x, z]) => ({ x, z })), closed: false };
}

test("Test 1 — exact base end panel -> PASS", () => {
  const r = verifyEndPanel(toPlannedEndPanel(ep()), meas(), T);
  assert.equal(r.status, "PASS");
  assert.equal(r.measured, true);
});

test("Test 2 — exact wall end panel -> PASS", () => {
  const wallPlan = ep({ layer: "wall", position: [-0.009, 1.9, 0.175], thicknessM: 0.018, depthM: 0.35, heightM: 0.8, material: "wallDoor" });
  const r = verifyEndPanel(
    toPlannedEndPanel(wallPlan),
    meas({ widthMm: 18, heightMm: 800, depthMm: 350, centerY: 1900, centerZ: 175 }),
    T
  );
  assert.equal(r.status, "PASS");
  assert.equal(r.dimensions.depth.status, "PASS");
});

test("Test 3 — small dimension difference within soft tolerance -> PASS", () => {
  const r = verifyEndPanel(toPlannedEndPanel(ep()), meas({ widthMm: 20 }), T); // +2mm <= 20
  assert.equal(r.dimensions.width.status, "PASS");
  assert.equal(r.status, "PASS");
});

test("Test 4 — soft-tolerance difference -> WARNING", () => {
  const r = verifyEndPanel(toPlannedEndPanel(ep()), meas({ widthMm: 48 }), T); // +30mm: 20 < 30 <= 45
  assert.equal(r.dimensions.width.status, "WARNING");
  assert.equal(r.status, "WARNING");
});

test("Test 5 — hard dimension mismatch -> ERROR", () => {
  const r = verifyEndPanel(toPlannedEndPanel(ep()), meas({ widthMm: 90 }), T); // +72mm > 45
  assert.equal(r.dimensions.width.status, "ERROR");
  assert.equal(r.status, "ERROR");
});

test("Test 6 — position within tolerance -> PASS", () => {
  const r = verifyEndPanel(toPlannedEndPanel(ep()), meas({ centerX: -30 }), T); // -21mm <= 25
  assert.equal(r.position.x.status, "PASS");
});

test("Test 7 — position beyond tolerance -> ERROR", () => {
  const r = verifyEndPanel(toPlannedEndPanel(ep()), meas({ centerX: -200 }), T); // -191mm > 80
  assert.equal(r.position.x.status, "ERROR");
  assert.equal(r.status, "ERROR");
});

test("Test 8 — rotation within tolerance -> PASS", () => {
  const r = verifyEndPanel(toPlannedEndPanel(ep()), meas({ rotationY: 0.03 }), T); // ~1.7deg <= 2
  assert.equal(r.rotationStatus, "PASS");
});

test("Test 9 — rotation beyond tolerance -> ERROR", () => {
  const r = verifyEndPanel(toPlannedEndPanel(ep()), meas({ rotationY: 0.3 }), T); // ~17deg > 5
  assert.equal(r.rotationStatus, "ERROR");
  assert.equal(r.status, "ERROR");
});

test("Test 10 — missing runtime measurement -> ERROR with id/run/side/layer", () => {
  const r = verifyEndPanel(toPlannedEndPanel(ep()), null, T);
  assert.equal(r.status, "ERROR");
  assert.equal(r.measured, false);
  assert.ok(r.diagnostics.some((d) => d.includes("not measured")));
  assert.ok(r.diagnostics.some((d) => d.includes("r1") && d.includes("start") && d.includes("base")));
});

test("Test 11 — multiple end panels aggregate correctly", () => {
  const ok = verifyEndPanel(toPlannedEndPanel(ep()), meas(), T);
  const bad = verifyEndPanel(toPlannedEndPanel(ep({ layer: "wall" })), meas({ widthMm: 90 }), T);
  const all = aggregateAll([], [], [], 0, [ok, bad]);
  assert.equal(all.endPanelCount, 2);
  assert.equal(all.endPanelPassed, 1);
  assert.equal(all.endPanelErrors, 1);
  assert.equal(all.overall, "ERROR");
});

test("Test 12 — determinism -> deep-equal output", () => {
  const p = toPlannedEndPanel(ep());
  const m = meas({ widthMm: 48 });
  assert.deepEqual(verifyEndPanel(p, m, T), verifyEndPanel(p, m, T));
});

test("Test 13 — removed panel is excluded from the current planned list", () => {
  // A removed panel is simply not in the derived plan, so it never errors.
  const all = aggregateAll([], [], [], 0, []);
  assert.equal(all.endPanelCount, 0);
  assert.equal(all.endPanelErrors, 0);
});

test("Test 14 — base panel planned dimensions from deriveEndPanels", () => {
  const panels = deriveEndPanels([run("r1", [[0, 0], [3, 0]])], []);
  const p = toPlannedEndPanel(panels.find((x) => x.reason === "exposed" && x.layer === "base")!);
  assert.equal(p.widthMm, 18);
  assert.equal(p.depthMm, 600);
  assert.equal(p.heightMm, 860);
});

test("Test 15 — wall panel planned dimensions/elevation from deriveEndPanels", () => {
  const panels = deriveEndPanels(
    [run("r1", [[0, 0], [3, 0]], { wallHeight: 0.7 })],
    [wall("w1", [[3, 0], [3, 2]])]
  );
  const p = toPlannedEndPanel(panels.find((x) => x.reason === "exposed" && x.layer === "wall")!);
  assert.equal(p.depthMm, 350);
  assert.equal(p.heightMm, 700);
  assert.equal(p.centerYmm, 1850); // 1.5 + 0.35
});

test("Test 16 — existing run/placed aggregation remains correct alongside end panels", () => {
  const modulePlan: PlannedModule = {
    id: "m0",
    layer: "base",
    kind: "double-door",
    widthMm: 800,
    depthMm: 600,
    heightMm: 860,
    centerXmm: 400,
    centerYmm: 430,
    centerZmm: 0,
    rotationY: 0,
    tMm: 400,
    blockedBaseMm: [],
    blockedTopMm: [],
  };
  const moduleMeas: MeasuredModule = {
    widthMm: 800,
    heightMm: 860,
    depthMm: 600,
    centerX: 400,
    centerY: 430,
    centerZ: 0,
    rotationY: 0,
  };
  const runRes = aggregateRun({
    runId: "r",
    runLengthMm: 800,
    baseReservedMm: 0,
    plannedModules: [modulePlan],
    measured: { m0: moduleMeas },
    thresholds: T,
  });

  const placedPlan: PlannedPlacedItem = {
    id: "p1",
    catalogId: "x",
    label: "P",
    wallId: "w#0",
    elevation: "floor",
    widthMm: 800,
    heightMm: 2100,
    depthMm: 600,
    centerXmm: 1500,
    centerYmm: 1050,
    centerZmm: 375,
    rotationY: 0,
    wallSegA: { x: 0, z: 0 },
    wallSegB: { x: 3, z: 0 },
    backOffsetMm: 375,
    blockedMm: [],
    reservedMm: [],
  };
  const placedMeas: MeasuredModule = {
    widthMm: 800,
    heightMm: 2100,
    depthMm: 600,
    centerX: 1500,
    centerY: 1050,
    centerZ: 375,
    rotationY: 0,
  };
  const placedRes = verifyPlacedItem(placedPlan, placedMeas, T);
  const panelRes = verifyEndPanel(toPlannedEndPanel(ep()), meas(), T);

  const all = aggregateAll([runRes], [placedRes], [], 0, [panelRes]);
  assert.equal(all.moduleCount, 1);
  assert.equal(all.placedCount, 1);
  assert.equal(all.endPanelCount, 1);
  assert.equal(all.passed, 1);
  assert.equal(all.placedPassed, 1);
  assert.equal(all.endPanelPassed, 1);
  assert.equal(all.overall, "PASS");
});
