import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeIntervals,
  complement,
  clipIntervals,
  intervalLength,
  totalLength,
  INTV_TOL_MM,
} from "./intervals.ts";

test("mergeIntervals: empty input", () => {
  assert.deepEqual(mergeIntervals([]), []);
});

test("mergeIntervals: overlapping intervals merge (Test 4)", () => {
  const merged = mergeIntervals([
    { start: 100, end: 400 },
    { start: 300, end: 500 },
    { start: 800, end: 900 },
  ]);
  assert.deepEqual(merged, [
    { start: 100, end: 500 },
    { start: 800, end: 900 },
  ]);
});

test("mergeIntervals: touches within tolerance merge", () => {
  const merged = mergeIntervals([
    { start: 0, end: 100 },
    { start: 100 + INTV_TOL_MM, end: 200 },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].end, 200);
});

test("mergeIntervals: unsorted input and zero/negative widths", () => {
  const merged = mergeIntervals([
    { start: 600, end: 700 },
    { start: 0, end: 100 },
    { start: 50, end: 50 }, // zero width dropped
    { start: 70, end: 40 }, // inverted dropped
  ]);
  assert.deepEqual(merged, [
    { start: 0, end: 100 },
    { start: 600, end: 700 },
  ]);
});

test("complement: single blocked interval splits the wall (Test 3 intervals)", () => {
  const usable = complement([{ start: 1200, end: 1800 }], 3000);
  assert.deepEqual(usable, [
    { start: 0, end: 1200 },
    { start: 1800, end: 3000 },
  ]);
  assert.equal(intervalLength(usable[0]) + intervalLength(usable[1]), 2400);
});

test("complement: overlapping blocked intervals produce no spurious usable gaps", () => {
  const usable = complement(
    [
      { start: 1200, end: 1500 },
      { start: 1400, end: 1800 },
    ],
    3000
  );
  assert.deepEqual(usable, [
    { start: 0, end: 1200 },
    { start: 1800, end: 3000 },
  ]);
});

test("complement: fully blocked wall has no usable space", () => {
  const usable = complement([{ start: 0, end: 1000 }], 1000);
  assert.deepEqual(usable, []);
});

test("complement: total usable length conserved", () => {
  const usable = complement([{ start: 200, end: 500 }], 1500);
  // usable = [0,200] + [500,1500] = 200 + 1000 = 1200 (1500 - 300 blocked)
  assert.equal(totalLength(usable), 1200);
});

test("clipIntervals: clamps to wall bounds", () => {
  const clipped = clipIntervals(
    [
      { start: -100, end: 250 },
      { start: 900, end: 1200 },
    ],
    1000
  );
  assert.deepEqual(clipped, [
    { start: 0, end: 250 },
    { start: 900, end: 1000 },
  ]);
});
