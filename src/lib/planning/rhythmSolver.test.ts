import { test } from "node:test";
import assert from "node:assert/strict";
import { solveFacadePlan, bestPartitionFor, equalWidths, mergeCells } from "./rhythmSolver.ts";
import { complement } from "./intervals.ts";

function sumModules(modules: { width: number }[]): number {
  return modules.reduce((s, m) => s + m.width, 0);
}

test("empty wall: 1000mm -> valid plan, 100% coverage (Test 1)", () => {
  const plan = solveFacadePlan(1000);
  assert.equal(plan.valid, true);
  assert.equal(plan.usableLength, 1000);
  assert.equal(plan.residual, 0);
  assert.equal(sumModules(plan.modules), 1000);
  assert.ok(plan.modules.length >= 1);
});

test("standard wall: 3000mm -> multiple modules, zero residual (Test 2)", () => {
  const plan = solveFacadePlan(3000);
  assert.equal(plan.valid, true);
  assert.equal(plan.residual, 0);
  assert.ok(plan.modules.length >= 3, "expected multiple modules");
  assert.equal(sumModules(plan.modules), 3000);
});

test("obstacle: cabinets never enter the blocked interval (Test 3)", () => {
  const wallLength = 3000;
  const blocked = [{ start: 1200, end: 1800 }];
  const usable = complement(blocked, wallLength);

  assert.deepEqual(usable, [
    { start: 0, end: 1200 },
    { start: 1800, end: 3000 },
  ]);

  // Solve each usable interval; place modules contiguously from its own start.
  for (const span of usable) {
    const plan = solveFacadePlan(span.end - span.start);
    assert.equal(plan.valid, true);
    assert.equal(plan.residual, 0);
    let cursor = span.start;
    for (const m of plan.modules) {
      const start = cursor;
      const end = start + m.width;
      assert.ok(start >= span.start && end <= span.end, "module escaped its usable interval");
      // Module must not overlap the blocked interval.
      assert.ok(end <= blocked[0].start || start >= blocked[0].end, "cabinet entered blocked interval");
      cursor = end;
    }
  }
});

test("small residual becomes a real filler panel (Test 5)", () => {
  // 650 = 600 standard front + 50mm filler panel (no elastic split fits).
  const plan = solveFacadePlan(650);
  assert.equal(plan.valid, true);
  assert.equal(plan.residual, 0);
  assert.ok(plan.modules.some((m) => m.kind === "filler"), "expected a filler panel");
  assert.equal(sumModules(plan.modules), 650);
});

test("impossible span reports explicit invalid result (Test 6)", () => {
  const plan = solveFacadePlan(10); // < minFillerWidth (20mm)
  assert.equal(plan.valid, false);
  assert.equal(plan.residual, 10);
  assert.ok(Array.isArray(plan.diagnostics) && plan.diagnostics.length > 0);
  assert.equal(plan.modules.length, 0, "never silently stretches");
});

test("zero/negative span is degenerate but safe", () => {
  const plan = solveFacadePlan(0);
  assert.equal(plan.valid, true);
  assert.equal(plan.residual, 0);
  assert.equal(sumModules(plan.modules), 0);
});

test("determinism: identical input -> identical output (Test 7)", () => {
  const a = solveFacadePlan(2750);
  const b = solveFacadePlan(2750);
  assert.deepEqual(a, b);
});

test("exact closure across many spans (Test 8)", () => {
  for (let span = 20; span <= 12000; span += 7) {
    const plan = solveFacadePlan(span);
    if (plan.valid) {
      assert.equal(
        plan.cabinetTotal + plan.fillerTotal,
        plan.usableLength,
        `closure failed for span ${span}`
      );
    }
  }
});

test("all valid plans keep single fronts in range and merged pairs <= cap", () => {
  for (let span = 400; span <= 8000; span += 13) {
    const plan = solveFacadePlan(span);
    if (!plan.valid) continue;
    for (const m of plan.modules) {
      if (m.kind !== "front") continue;
      if (m.fronts === 2) {
        assert.ok(m.width <= 900, `merged module too wide: ${m.width} for span ${span}`);
      } else {
        assert.ok(m.width >= 350, `front too narrow: ${m.width} for span ${span}`);
        assert.ok(m.width <= 600, `front too wide: ${m.width} for span ${span}`);
      }
    }
  }
});

test("equalWidths distributes remainder symmetrically", () => {
  assert.deepEqual(equalWidths(1400, 3), [467, 466, 467]); // mirror pairs equal
  assert.deepEqual(equalWidths(1000, 2), [500, 500]);
  assert.equal(equalWidths(1000, 2).reduce((s, w) => s + w, 0), 1000);
});

test("mergeCells merges equal adjacent front cells into modules (<= 900)", () => {
  const modules = mergeCells(
    [
      { width: 450, kind: "front" },
      { width: 450, kind: "front" },
      { width: 400, kind: "front" },
      { width: 600, kind: "filler" },
    ],
    900
  );
  assert.deepEqual(modules, [
    { width: 900, kind: "front", fronts: 2 },
    { width: 400, kind: "front", fronts: 1 },
    { width: 600, kind: "filler", fronts: 1 },
  ]);
});

test("bestPartitionFor returns null only for impossible spans", () => {
  assert.equal(bestPartitionFor(10, 600), null);
  assert.ok(bestPartitionFor(650, 600) !== null);
  assert.ok(bestPartitionFor(3000, 600) !== null);
});
