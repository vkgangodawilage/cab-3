/**
 * Generic 1-D interval model for a wall axis (millimetres).
 *
 * Ported concept from the Senior Dev reference solver
 * (`CBX_FacadeRhythmSolver.rb`, `merge_intervals` / `complement`). These are
 * pure, dependency-free and deterministic.
 *
 * A wall is `0 ---------- L`. Blocked intervals are merged and subtracted so
 * the solver only ever places cabinets inside *usable* intervals.
 */

import type { IntervalMm } from "./types.ts";

/** Tolerance used when merging / comparing intervals (mm). */
export const INTV_TOL_MM = 0.5;

/**
 * Merge overlapping / touching intervals into a minimal disjoint set.
 * Intervals are returned sorted ascending by start. Negative or zero-length
 * inputs are dropped.
 */
export function mergeIntervals(
  intervals: IntervalMm[],
  tolerance: number = INTV_TOL_MM
): IntervalMm[] {
  const valid = intervals
    .map((i) => ({ start: i.start, end: i.end }))
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (valid.length === 0) return [];

  const merged: IntervalMm[] = [{ start: valid[0].start, end: valid[0].end }];
  for (let i = 1; i < valid.length; i++) {
    const cur = valid[i];
    const last = merged[merged.length - 1];
    if (cur.start <= last.end + tolerance) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      merged.push({ start: cur.start, end: cur.end });
    }
  }
  return merged;
}

/** Clip intervals to the [0, length] wall boundary, dropping empties. */
export function clipIntervals(
  intervals: IntervalMm[],
  length: number,
  tolerance: number = INTV_TOL_MM
): IntervalMm[] {
  const out: IntervalMm[] = [];
  for (const i of intervals) {
    const start = Math.max(0, i.start);
    const end = Math.min(length, i.end);
    if (end - start > tolerance) out.push({ start, end });
  }
  return out;
}

/**
 * The complement of `intervals` within [0, length] — i.e. the usable spans.
 * Blocked intervals are merged + clipped first, so overlapping obstacles
 * never produce spurious gaps.
 */
export function complement(
  intervals: IntervalMm[],
  length: number,
  tolerance: number = INTV_TOL_MM
): IntervalMm[] {
  const merged = mergeIntervals(clipIntervals(intervals, length, tolerance), tolerance);
  const gaps: IntervalMm[] = [];
  let cursor = 0;
  for (const iv of merged) {
    if (iv.start > cursor + tolerance) gaps.push({ start: cursor, end: iv.start });
    cursor = Math.max(cursor, iv.end);
  }
  if (cursor < length - tolerance) gaps.push({ start: cursor, end: length });
  return gaps;
}

export function intervalLength(i: IntervalMm): number {
  return i.end - i.start;
}

export function totalLength(intervals: IntervalMm[]): number {
  return intervals.reduce((sum, i) => sum + intervalLength(i), 0);
}
