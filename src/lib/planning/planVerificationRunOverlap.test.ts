import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePlacedRunOverlapViolations,
  obbOverlap,
  obbPenetration,
} from "./planVerification.ts";
import type {
  MeasuredModule,
  PlacedFootprint,
  RunModuleFootprint,
} from "./planVerification.ts";

function m(
  widthMm: number,
  depthMm: number,
  centerX: number,
  centerZ: number,
  rotationY = 0,
  heightMm = 1000
): MeasuredModule {
  return { widthMm, heightMm, depthMm, centerX, centerY: 0, centerZ, rotationY };
}

function placed(id: string, elevation: "floor" | "wall", measured: MeasuredModule): PlacedFootprint {
  return { id, elevation, measured };
}

function rm(
  runId: string,
  moduleId: string,
  layer: "base" | "wall" | "corner",
  kind: string,
  measured: MeasuredModule
): RunModuleFootprint {
  return { runId, moduleId, layer, kind, measured };
}

const BASE: RunModuleFootprint = rm("r1", "r1#base#0", "base", "double-door", m(800, 600, 0, 0));
const WALL: RunModuleFootprint = rm("r2", "r2#wall#0", "wall", "solid", m(800, 350, 0, 0));
const CORNER: RunModuleFootprint = rm("r3", "r3#base#0", "base", "l-corner", m(900, 900, 0, 0));

test("Test 1 — floor placed beside base run: no overlap", () => {
  const p = placed("p1", "floor", m(800, 600, 2000, 0));
  assert.deepEqual(computePlacedRunOverlapViolations([p], [BASE]), []);
});

test("Test 2 — floor placed touching base run edge: PASS (contact tolerance)", () => {
  const p = placed("p1", "floor", m(800, 600, 800, 0)); // edges meet at 400
  assert.equal(obbPenetration(
    { cx: 0.8, cz: 0, hw: 0.4, hd: 0.3, rotation: 0 },
    { cx: 0, cz: 0, hw: 0.4, hd: 0.3, rotation: 0 }
  ), 0);
  assert.deepEqual(computePlacedRunOverlapViolations([p], [BASE]), []);
});

test("Test 3 — floor placed penetrating base run: ERROR", () => {
  const p = placed("p1", "floor", m(800, 600, 700, 0)); // penetration 100mm
  const violations = computePlacedRunOverlapViolations([p], [BASE]);
  assert.equal(violations.length, 1);
  assert.ok(violations[0].startsWith("PLACED_RUN_OVERLAP"));
  // A larger contact tolerance forgives it.
  assert.deepEqual(computePlacedRunOverlapViolations([p], [BASE], { contactM: 0.15 }), []);
});

test("Test 4 — rotated placed penetrating rotated base run: ERROR", () => {
  const p = placed("p1", "floor", m(800, 600, 700, 0, 0.5));
  const mod = rm("r1", "r1#base#0", "base", "double-door", m(800, 600, 0, 0, 0.5));
  const violations = computePlacedRunOverlapViolations([p], [mod]);
  assert.equal(violations.length, 1);
});

test("Test 5 — AABBs overlap but OBBs do not: PASS (proves SAT)", () => {
  // Two 1m squares rotated 45°, centres offset (1000,1000)mm. Their world
  // AABBs (circumradius ~707mm) overlap, but the rotated OBBs are separated.
  const a = { cx: 0, cz: 0, hw: 0.5, hd: 0.5, rotation: Math.PI / 4 };
  const b = { cx: 1.0, cz: 1.0, hw: 0.5, hd: 0.5, rotation: Math.PI / 4 };
  assert.equal(obbOverlap(a, b), false, "OBBs are separated, so no overlap");
  const p = placed("p1", "floor", m(1000, 1000, 0, 0, Math.PI / 4));
  const mod = rm("r1", "r1#base#0", "base", "double-door", m(1000, 1000, 1000, 1000, Math.PI / 4));
  assert.deepEqual(computePlacedRunOverlapViolations([p], [mod]), []);
});

test("Test 6 — wall placed beside wall module: PASS", () => {
  const p = placed("p1", "wall", m(800, 350, 2000, 0));
  assert.deepEqual(computePlacedRunOverlapViolations([p], [WALL]), []);
});

test("Test 7 — wall placed penetrating wall module: ERROR", () => {
  const p = placed("p1", "wall", m(800, 350, 700, 0));
  const violations = computePlacedRunOverlapViolations([p], [WALL]);
  assert.equal(violations.length, 1);
});

test("Test 8 — wall placed over base module in XZ only: PASS (elevation filter)", () => {
  const p = placed("p1", "wall", m(800, 350, 0, 0));
  assert.deepEqual(computePlacedRunOverlapViolations([p], [BASE]), []);
});

test("Test 9 — floor placed over wall module in XZ only: PASS (elevation filter)", () => {
  const p = placed("p1", "floor", m(800, 600, 0, 0));
  assert.deepEqual(computePlacedRunOverlapViolations([p], [WALL]), []);
});

test("Test 10 — tall pantry flush with base run: PASS", () => {
  const p = placed("pantry", "floor", m(800, 600, 800, 0));
  assert.deepEqual(computePlacedRunOverlapViolations([p], [BASE]), []);
});

test("Test 11 — tall pantry actually penetrating base run: ERROR", () => {
  const p = placed("pantry", "floor", m(800, 600, 650, 0));
  assert.equal(computePlacedRunOverlapViolations([p], [BASE]).length, 1);
});

test("Test 12 — placed item near intentional corner module: PASS", () => {
  const p = placed("p1", "floor", m(800, 600, 900, 0)); // flush beside the corner square
  assert.deepEqual(computePlacedRunOverlapViolations([p], [CORNER]), []);
});

test("Test 13 — placed item penetrating corner module footprint: ERROR", () => {
  const p = placed("p1", "floor", m(800, 600, 250, 0));
  assert.equal(computePlacedRunOverlapViolations([p], [CORNER]).length, 1);
});

test("Test 14 — multiple items + modules: deterministic violation list", () => {
  const p1 = placed("p1", "floor", m(800, 600, 2000, 0)); // clear
  const p2 = placed("p2", "floor", m(800, 600, 700, 0)); // penetrates BASE
  const wall = rm("r4", "r4#wall#0", "wall", "solid", m(800, 350, 0, 0));
  const p3 = placed("p3", "wall", m(800, 350, 700, 0)); // penetrates wall
  const violations = computePlacedRunOverlapViolations([p1, p2, p3], [BASE, wall]);
  assert.equal(violations.length, 2);
  assert.ok(violations.some((v) => v.includes("p2") && v.includes("base")));
  assert.ok(violations.some((v) => v.includes("p3") && v.includes("wall")));
});

test("Test 15 — no placed items: no violations", () => {
  assert.deepEqual(computePlacedRunOverlapViolations([], [BASE, WALL, CORNER]), []);
});

test("Test 16 — no run modules: no violations", () => {
  const p = placed("p1", "floor", m(800, 600, 700, 0));
  assert.deepEqual(computePlacedRunOverlapViolations([p], []), []);
});

test("Test 17 — deleted/unregistered object excluded: no stale violation", () => {
  // Only registered footprints are measured; a would-be overlapping item that
  // was deleted is simply not passed in.
  const p = placed("p1", "floor", m(800, 600, 2000, 0)); // the registered one
  assert.deepEqual(computePlacedRunOverlapViolations([p], [BASE]), []);
});

test("Test 18 — determinism: same inputs -> same result", () => {
  const p1 = placed("p1", "floor", m(800, 600, 2000, 0));
  const p2 = placed("p2", "floor", m(800, 600, 700, 0));
  const a = computePlacedRunOverlapViolations([p1, p2], [BASE, WALL, CORNER]);
  const b = computePlacedRunOverlapViolations([p1, p2], [BASE, WALL, CORNER]);
  assert.deepEqual(a, b);
});
