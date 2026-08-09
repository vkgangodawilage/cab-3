/**
 * Adapters from the current project's obstacle representation into the pure
 * planning interval model.
 *
 * The planning layer itself must not import app modules, so this boundary file
 * uses structural (duck-typed) inputs that happen to match the app's `Wall`,
 * `Vec2` and `PlacedCutout` shapes:
 *   - `WallLike`            matches `Wall`     ({ id, points, closed })
 *   - `Point2`              matches `Vec2`     ({ x, z })
 *   - `CutoutLike`          matches `PlacedCutout` (positionOnWall in metres,
 *                          width in metres, wallId as the segment key)
 *
 * All wall/cutout geometry is in METRES (the app's world unit). The output is
 * in MILLIMETRES (the planning unit).
 *
 * Phase 1 limitation: cabinet runs are free polylines, not yet wall-anchored.
 * A run segment is only matched to a wall segment when it is (a) near-parallel
 * and (b) within `proximityM` of it. Cutouts on unmatched segments are not
 * applied — the generic interval API is ready for wall-attached runs later.
 */

import { M_TO_MM } from "./config.ts";
import { mergeIntervals } from "./intervals.ts";
import type { IntervalMm } from "./types.ts";
import { detectCorners } from "./cornerOwnership.ts";
import type {
  CornerDiagnostic,
  CornerEdge,
  CornerLayerReservations,
  CornerOwnershipOptions,
} from "./cornerOwnership.ts";

export interface Point2 {
  x: number;
  z: number;
}

export interface WallLike {
  id: string;
  points: Point2[];
  closed: boolean;
}

export interface CutoutLike {
  /** Segment key this cutout lives on: `<wallId>#<segmentIndex>`. */
  wallId: string;
  /** Centre distance along the wall segment from its start, metres (0..L). */
  positionOnWall: number;
  /** Cutout width, metres. */
  width: number;
  /** Opening kind. Doors block the base layer; all openings block the top. */
  type?: "door" | "window";
}

export type IntervalLayer = "base" | "top";

export interface BlockedIntervalOptions {
  /** Max perpendicular distance (m) for a run segment to claim a wall. */
  proximityM?: number;
  /** Min |dot| of the two segment directions to be considered parallel. */
  parallelTol?: number;
  /** Min projected overlap (m) between run segment and wall segment. */
  overlapMinM?: number;
  /**
   * Which wall layer the blocked intervals feed: "base" ignores windows
   * (base cabinets run under windows), "top" includes every opening.
   * Defaults to "base".
   */
  layer?: IntervalLayer;
}

const DEFAULT_OPTIONS: Required<BlockedIntervalOptions> = {
  proximityM: 0.45,
  parallelTol: 0.02,
  overlapMinM: 0.05,
  layer: "base",
};

/** Does a cutout apply to a given layer? Doors block base; everything blocks top. */
function matchesLayer(c: CutoutLike, layer: IntervalLayer): boolean {
  if (layer === "base") return c.type !== "window";
  return true;
}

interface WallSegment {
  a: Point2;
  b: Point2;
  key: string;
}

function dirUnit(a: Point2, b: Point2): Point2 | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return null;
  return { x: dx / len, z: dz / len };
}

function dot(p: Point2, u: Point2): number {
  return p.x * u.x + p.z * u.z;
}

/** Perpendicular distance from point p to the line through origin-a, dir u. */
function distanceToLine(p: Point2, a: Point2, u: Point2): number {
  return Math.abs(u.x * (p.z - a.z) - u.z * (p.x - a.x));
}

/**
 * Enumerate a wall run's segments with the same indexing the app uses
 * (`placement.ts` `segmentId`: `<wallId>#<index>`, closed loop adds the last
 * segment with index `points.length - 1`).
 */
export function wallSegments(wall: WallLike): WallSegment[] {
  const segs: WallSegment[] = [];
  for (let i = 0; i < wall.points.length - 1; i++) {
    segs.push({ a: wall.points[i], b: wall.points[i + 1], key: `${wall.id}#${i}` });
  }
  if (wall.closed && wall.points.length > 2) {
    segs.push({
      a: wall.points[wall.points.length - 1],
      b: wall.points[0],
      key: `${wall.id}#${wall.points.length - 1}`,
    });
  }
  return segs;
}

/**
 * Blocked intervals (mm) along a single wall segment from its cutouts.
 * Cutouts are centred at `positionOnWall` along the segment; the interval is
 * clipped to the segment bounds.
 */
export function cutoutsToSegmentIntervals(
  seg: WallSegment,
  cutouts: CutoutLike[]
): IntervalMm[] {
  const a = seg.a;
  const b = seg.b;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 1e-9) return [];
  const d = dirUnit(a, b);
  if (!d) return [];

  const intervals: IntervalMm[] = [];
  for (const c of cutouts) {
    if (c.wallId !== seg.key) continue;
    if (!Number.isFinite(c.positionOnWall) || !Number.isFinite(c.width)) continue;
    const half = c.width / 2;
    const start = Math.round(Math.max(0, c.positionOnWall - half) * M_TO_MM);
    const end = Math.round(Math.min(len, c.positionOnWall + half) * M_TO_MM);
    if (end > start) intervals.push({ start, end });
  }
  return mergeIntervals(intervals);
}

/**
 * Blocked intervals (mm) for ONE run segment, computed by projecting the
 * cutouts of any matching parallel wall segment onto the run axis.
 *
 * Returns [] when no wall segment qualifies (free/unmapped run).
 */
export function blockedIntervalsForRunSegment(
  a: Point2,
  b: Point2,
  walls: WallLike[],
  cutouts: CutoutLike[],
  options?: BlockedIntervalOptions
): IntervalMm[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const runDir = dirUnit(a, b);
  if (!runDir) return [];
  const runLen = Math.hypot(b.x - a.x, b.z - a.z);

  const intervals: IntervalMm[] = [];

  for (const wall of walls) {
    for (const seg of wallSegments(wall)) {
      const wallDir = dirUnit(seg.a, seg.b);
      if (!wallDir) continue;

      // (a) parallel check
      if (Math.abs(dot(wallDir, runDir)) < 1 - opts.parallelTol) continue;

      // (b) proximity check (both wall endpoints near the run's line)
      const prox =
        Math.max(
          distanceToLine(seg.a, a, runDir),
          distanceToLine(seg.b, a, runDir)
        );
      if (prox > opts.proximityM) continue;

      // (c) overlap of the two segments along the run axis
      const tA = dot(seg.a, runDir) - dot(a, runDir);
      const tB = dot(seg.b, runDir) - dot(a, runDir);
      const t0 = Math.min(tA, tB);
      const t1 = Math.max(tA, tB);
      const overlapS = Math.max(0, t0);
      const overlapE = Math.min(runLen, t1);
      if (overlapE - overlapS < opts.overlapMinM) continue;

      // Map each cutout on this wall segment to the run-local axis.
      const wallLen = Math.hypot(seg.b.x - seg.a.x, seg.b.z - seg.a.z);
      if (wallLen < 1e-9) continue;
      const scale = (t1 - t0) / wallLen;

      for (const c of cutouts) {
        if (c.wallId !== seg.key) continue;
        if (!matchesLayer(c, opts.layer)) continue;
        if (!Number.isFinite(c.positionOnWall) || !Number.isFinite(c.width)) continue;
        const centreT = t0 + c.positionOnWall * scale;
        const half = c.width / 2;
        const s = Math.round(Math.max(0, centreT - half) * M_TO_MM);
        const e = Math.round(Math.min(runLen, centreT + half) * M_TO_MM);
        if (e - s > 0.5) intervals.push({ start: s, end: e });
      }
    }
  }

  return mergeIntervals(intervals);
}

/**
 * Blocked intervals (mm) per run segment, aligned with `points` (one entry per
 * segment, i.e. `points.length - 1`). Islands / free runs simply get [].
 */
export function runBlockedSegments(
  points: Point2[],
  walls: WallLike[],
  cutouts: CutoutLike[],
  options?: BlockedIntervalOptions
): IntervalMm[][] {
  const out: IntervalMm[][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push(
      blockedIntervalsForRunSegment(points[i], points[i + 1], walls, cutouts, options)
    );
  }
  return out;
}

/**
 * Compute blocked intervals for both layers at once: `base` (doors only) and
 * `top` (all openings), matching the reference `blocked_base` / `blocked_top`.
 */
export function runBlockedSegmentsForLayers(
  points: Point2[],
  walls: WallLike[],
  cutouts: CutoutLike[],
  options?: Omit<BlockedIntervalOptions, "layer">
): { base: IntervalMm[][]; top: IntervalMm[][] } {
  return {
    base: runBlockedSegments(points, walls, cutouts, { ...options, layer: "base" }),
    top: runBlockedSegments(points, walls, cutouts, { ...options, layer: "top" }),
  };
}

export interface RunBlockedResult {
  /** Per run id: base/top blocked intervals (mm) per segment. */
  runs: Record<string, { base: IntervalMm[][]; top: IntervalMm[][] }>;
  /** Corner-ownership diagnostics (errors block a ghost commit). */
  cornerDiagnostics: CornerDiagnostic[];
}

/**
 * Phase 2 orchestrator: for every run, merge the Phase 1 cutout projections
 * with the Phase 2 cross-run corner reservations, so the rhythm solver's
 * usable intervals respect both openings and corner returns.
 *
 * Corner ownership is computed over ALL run segments; only the non-owner's
 * return is applied to that run's own blocked intervals (the owner's corner
 * cabinet is never blocked against itself). Runs use the same duck-typed shape
 * as walls (`{ id, points, closed }`).
 */
export function runBlockedSegmentsWithCorners(
  runs: WallLike[],
  walls: WallLike[],
  cutouts: CutoutLike[],
  options?: BlockedIntervalOptions,
  cornerOptions?: CornerOwnershipOptions
): RunBlockedResult {
  const out: RunBlockedResult["runs"] = {};
  const edges: CornerEdge[] = [];
  const segMeta: Record<string, { runId: string; index: number }> = {};
  const cutoutBlocked: Record<string, CornerLayerReservations> = {};

  for (const run of runs) {
    const segs = wallSegments(run);
    const base: IntervalMm[][] = [];
    const top: IntervalMm[][] = [];
    segs.forEach((s, i) => {
      const key = s.key;
      edges.push({ id: run.id, segmentKey: key, a: s.a, b: s.b });
      const bBase = blockedIntervalsForRunSegment(s.a, s.b, walls, cutouts, { ...options, layer: "base" });
      const bTop = blockedIntervalsForRunSegment(s.a, s.b, walls, cutouts, { ...options, layer: "top" });
      base.push(bBase);
      top.push(bTop);
      segMeta[key] = { runId: run.id, index: i };
      cutoutBlocked[key] = { base: bBase, top: bTop };
    });
    out[run.id] = { base, top };
  }

  const corner = detectCorners(edges, cutoutBlocked, cornerOptions);

  for (const key of Object.keys(corner.reservations)) {
    const meta = segMeta[key];
    if (!meta) continue;
    const runBlocked = out[meta.runId];
    runBlocked.base[meta.index] = mergeIntervals([
      ...runBlocked.base[meta.index],
      ...corner.reservations[key].base,
    ]);
    runBlocked.top[meta.index] = mergeIntervals([
      ...runBlocked.top[meta.index],
      ...corner.reservations[key].top,
    ]);
  }

  return { runs: out, cornerDiagnostics: corner.diagnostics };
}

export interface SegmentBlockedSource {
  a: Point2;
  b: Point2;
  /** Blocked intervals in the SOURCE segment's local mm. */
  blocked: IntervalMm[];
}

/**
 * Phase 4A — project source-segment blocked intervals (e.g. corner
 * reservations) onto a target segment's axis. Only parallel + proximate
 * sources are projected; the result is merged and clipped to the target.
 * Intervals are in target-local millimetres (0..targetLength*1000).
 */
export function projectBlockedToSegment(
  targetA: Point2,
  targetB: Point2,
  sources: SegmentBlockedSource[],
  options?: Omit<BlockedIntervalOptions, "layer">
): IntervalMm[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const runDir = dirUnit(targetA, targetB);
  if (!runDir) return [];
  const targetLen = Math.hypot(targetB.x - targetA.x, targetB.z - targetA.z);
  if (targetLen < 1e-9) return [];

  const intervals: IntervalMm[] = [];

  for (const src of sources) {
    if (src.blocked.length === 0) continue;
    const srcDir = dirUnit(src.a, src.b);
    if (!srcDir) continue;
    // parallel check
    if (Math.abs(dot(srcDir, runDir)) < 1 - opts.parallelTol) continue;
    // proximity check
    const prox = Math.max(
      distanceToLine(src.a, targetA, runDir),
      distanceToLine(src.b, targetA, runDir)
    );
    if (prox > opts.proximityM) continue;
    // projected span of the source on the target axis
    const tA = dot(src.a, runDir) - dot(targetA, runDir);
    const tB = dot(src.b, runDir) - dot(targetA, runDir);
    const t0 = Math.min(tA, tB);
    const t1 = Math.max(tA, tB);
    const overlapS = Math.max(0, t0);
    const overlapE = Math.min(targetLen, t1);
    if (overlapE - overlapS < opts.overlapMinM) continue;

    const srcLen = Math.hypot(src.b.x - src.a.x, src.b.z - src.a.z);
    if (srcLen < 1e-9) continue;
    const scale = (t1 - t0) / srcLen;

    for (const iv of src.blocked) {
      const sv = t0 + (iv.start / M_TO_MM) * scale;
      const ev = t0 + (iv.end / M_TO_MM) * scale;
      const s = Math.round(Math.max(0, Math.min(sv, ev) * M_TO_MM));
      const e = Math.round(Math.min(targetLen * M_TO_MM, Math.max(sv, ev) * M_TO_MM));
      if (e > s) intervals.push({ start: s, end: e });
    }
  }

  return mergeIntervals(intervals);
}
