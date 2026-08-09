/**
 * Phase 2 — Corner ownership / blind-corner return (pure).
 *
 * Adapted from the Senior Dev reference (`CBX_FacadeRhythmSolver.rb`
 * `place_major_units` corner block, `BASE_CORNER_RETURN_MM 625` /
 * `TOP_CORNER_RETURN_MM 350`, and `CBX_RoomBuilder` endpoint-proximity corner
 * detection), but operating on this app's XZ run geometry in metres.
 *
 * Detection:
 *   - two run segments from DIFFERENT runs whose endpoints coincide within a
 *     tolerance AND whose directions are perpendicular form a corner;
 *   - the owner (deterministic: lexicographically smaller segment key, or the
 *     one that can host the corner module without an opening conflict) fills
 *     the corner;
 *   - the non-owner reserves a RETURN at its corner end so its cabinets never
 *     overlap the owner's corner footprint.
 *
 * Internal corners of a SINGLE run are intentionally ignored here — they are
 * already owned by `planRunLayout` (Phase 1 behaviour is preserved).
 *
 * Guarantees: never emits a reservation that overlaps a blocked opening; if a
 * corner cannot be resolved safely it reports an ERROR diagnostic and applies
 * NO reservation (Part 9). Insufficient space clamps the return to the whole
 * short segment (so cabinets still never overlap) and reports a warning.
 *
 * No React / Three.js / Zustand / DOM. Erasable TS only.
 */

import { CORNER_DEFAULTS } from "./config.ts";
import { mergeIntervals } from "./intervals.ts";
import type { IntervalMm } from "./types.ts";

export interface CornerPoint2 {
  x: number;
  z: number;
}

export interface CornerEdge {
  /** Owner identity (run id). Internal corners (same id) are skipped. */
  id: string;
  /** `<id>#<segmentIndex>` — matches the app's segment keys. */
  segmentKey: string;
  a: CornerPoint2;
  b: CornerPoint2;
}

export type CornerSeverity = "warning" | "error";

export interface CornerDiagnostic {
  severity: CornerSeverity;
  message: string;
  cornerKey?: string;
}

export interface CornerLayerReservations {
  base: IntervalMm[];
  top: IntervalMm[];
}

export interface CornerTurn {
  cornerKey: string;
  ownerKey: string;
  ownerEnd: "start" | "end";
  returnKey: string;
  returnEnd: "start" | "end";
  /** Corner module footprint reserved on the owner (informational only). */
  ownerReserved: IntervalMm;
  /** Base-layer return reserved on the non-owner (mm). */
  returnReserved: IntervalMm;
}

export interface CornerOwnershipResult {
  turns: CornerTurn[];
  /**
   * Blocked intervals per segment key (mm). Only NON-OWNER returns are listed
   * here, so feeding them back to a run's own planner never blocks the owner's
   * corner cabinet.
   */
  reservations: Record<string, CornerLayerReservations>;
  diagnostics: CornerDiagnostic[];
}

export interface CornerOwnershipOptions {
  /** Max distance between two segments' endpoints to count as a corner. */
  endpointTolM?: number;
  /** Max |dot| of the two directions to be considered perpendicular. */
  perpTol?: number;
  /** Base-layer return/clearance reserved on the non-owner (mm). */
  baseReturnMm?: number;
  /** Top-layer return/clearance reserved on the non-owner (mm). */
  topReturnMm?: number;
  /** Corner module run on the owner (mm). */
  baseCornerRunMm?: number;
  /** Upper corner module run on the owner (mm). */
  topCornerRunMm?: number;
}

interface EndRef {
  edge: CornerEdge;
  end: "start" | "end";
  pt: CornerPoint2;
}

interface OwnershipAttempt {
  owner: EndRef;
  returner: EndRef;
  ownerReserved: IntervalMm;
  returnBase: IntervalMm;
  returnTop: IntervalMm;
}

function segLength(e: CornerEdge): number {
  return Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
}

function dirOf(e: CornerEdge): { x: number; z: number } | null {
  const dx = e.b.x - e.a.x;
  const dz = e.b.z - e.a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return null;
  return { x: dx / len, z: dz / len };
}

function dot(u: { x: number; z: number }, v: { x: number; z: number }): number {
  return u.x * v.x + u.z * v.z;
}

function overlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && a2 > b1;
}

/** Interval of `widthMm` at the given end of a segment, clamped to its length. */
function reserveAt(e: CornerEdge, end: "start" | "end", widthMm: number): IntervalMm {
  const Lmm = Math.round(segLength(e) * 1000);
  if (Lmm <= 0) return { start: 0, end: 0 };
  const w = Math.min(widthMm, Lmm);
  if (end === "start") return { start: 0, end: w };
  return { start: Lmm - w, end: Lmm };
}

/** Can this segment host the corner (owner) or the return (non-owner)? */
function tryOwnership(
  owner: EndRef,
  returner: EndRef,
  opts: Required<Omit<CornerOwnershipOptions, never>>,
  blocked: Record<string, CornerLayerReservations>
): OwnershipAttempt | null {
  const ownerReserved = reserveAt(
    owner.edge,
    owner.end,
    Math.min(opts.baseCornerRunMm, Math.round(segLength(owner.edge) * 1000))
  );
  const returnBase = reserveAt(returner.edge, returner.end, opts.baseReturnMm);
  const returnTop = reserveAt(returner.edge, returner.end, opts.topReturnMm);

  const oBlocked = blocked[owner.edge.segmentKey];
  if (oBlocked) {
    if (oBlocked.base.some((b) => overlap(ownerReserved.start, ownerReserved.end, b.start, b.end))) return null;
    if (oBlocked.top.some((b) => overlap(ownerReserved.start, ownerReserved.end, b.start, b.end))) return null;
  }
  const rBlocked = blocked[returner.edge.segmentKey];
  if (rBlocked) {
    if (rBlocked.base.some((b) => overlap(returnBase.start, returnBase.end, b.start, b.end))) return null;
    if (rBlocked.top.some((b) => overlap(returnTop.start, returnTop.end, b.start, b.end))) return null;
  }
  return { owner, returner, ownerReserved, returnBase, returnTop };
}

function resolveOneCorner(
  a: EndRef,
  b: EndRef,
  opts: Required<Omit<CornerOwnershipOptions, never>>,
  blocked: Record<string, CornerLayerReservations>,
  turns: CornerTurn[],
  reservations: Record<string, CornerLayerReservations>,
  diagnostics: CornerDiagnostic[],
  cornerKey: string
) {
  const attemptAB = tryOwnership(a, b, opts, blocked);
  const attemptBA = tryOwnership(b, a, opts, blocked);

  let attempt: OwnershipAttempt | null;
  if (attemptAB && attemptBA) {
    // Both feasible -> deterministic ownership by lexicographic segment key.
    attempt = a.edge.segmentKey < b.edge.segmentKey ? attemptAB : attemptBA;
  } else {
    attempt = attemptAB ?? attemptBA;
  }

  if (!attempt) {
    diagnostics.push({
      severity: "error",
      cornerKey,
      message:
        `corner ${cornerKey}: neither segment can host the corner module or its return ` +
        `without conflicting with an opening — no reservation applied`,
    });
    return;
  }

  const returnerLenMm = Math.round(segLength(attempt.returner.edge) * 1000);
  if (returnerLenMm < opts.baseReturnMm) {
    diagnostics.push({
      severity: "warning",
      cornerKey,
      message:
        `corner ${cornerKey}: returner ${attempt.returner.edge.segmentKey} shorter than the base return ` +
        `(${returnerLenMm}mm < ${opts.baseReturnMm}mm) — return clamped to the full segment`,
    });
  }

  turns.push({
    cornerKey,
    ownerKey: attempt.owner.edge.segmentKey,
    ownerEnd: attempt.owner.end,
    returnKey: attempt.returner.edge.segmentKey,
    returnEnd: attempt.returner.end,
    ownerReserved: attempt.ownerReserved,
    returnReserved: attempt.returnBase,
  });

  const rk = attempt.returner.edge.segmentKey;
  reservations[rk] = reservations[rk] ?? { base: [], top: [] };
  reservations[rk].base.push(attempt.returnBase);
  reservations[rk].top.push(attempt.returnTop);
}

/**
 * Detect corners between run segments and compute per-segment return
 * reservations. Deterministic, pure, dependency-free.
 */
export function detectCorners(
  edges: CornerEdge[],
  blocked?: Record<string, CornerLayerReservations>,
  options?: CornerOwnershipOptions
): CornerOwnershipResult {
  const opts: Required<Omit<CornerOwnershipOptions, never>> = {
    ...CORNER_DEFAULTS,
    ...options,
  };
  const turns: CornerTurn[] = [];
  const reservations: Record<string, CornerLayerReservations> = {};
  const diagnostics: CornerDiagnostic[] = [];
  const blockedMap: Record<string, CornerLayerReservations> = blocked ?? {};
  const seen = new Set<string>();

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i];
      const e2 = edges[j];
      if (e1.id === e2.id) continue; // internal corners are planRunLayout's job
      const d1 = dirOf(e1);
      const d2 = dirOf(e2);
      if (!d1 || !d2) continue;
      if (Math.abs(dot(d1, d2)) > opts.perpTol) continue; // not perpendicular

      const aEnds: EndRef[] = [
        { edge: e1, end: "start", pt: e1.a },
        { edge: e1, end: "end", pt: e1.b },
      ];
      const bEnds: EndRef[] = [
        { edge: e2, end: "start", pt: e2.a },
        { edge: e2, end: "end", pt: e2.b },
      ];

      for (const a of aEnds) {
        for (const b of bEnds) {
          if (Math.hypot(a.pt.x - b.pt.x, a.pt.z - b.pt.z) > opts.endpointTolM) continue;
          const cornerKey = `${a.edge.segmentKey}@${a.end}<->${b.edge.segmentKey}@${b.end}`;
          if (seen.has(cornerKey)) continue;
          seen.add(cornerKey);
          resolveOneCorner(a, b, opts, blockedMap, turns, reservations, diagnostics, cornerKey);
        }
      }
    }
  }

  for (const key of Object.keys(reservations)) {
    reservations[key] = {
      base: mergeIntervals(reservations[key].base),
      top: mergeIntervals(reservations[key].top),
    };
  }

  return { turns, reservations, diagnostics };
}
