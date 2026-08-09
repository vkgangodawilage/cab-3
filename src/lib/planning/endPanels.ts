/**
 * Phase 4D — End-panel generation (pure).
 *
 * Determines which exposed cabinet-run ends need a finished end panel, derived
 * from the committed run/wall/corner plan — never manually placed, never
 * persisted. An end is considered CLOSED (no panel) when it is:
 *   - a corner endpoint (owner or returner, from Phase 2 corner ownership),
 *   - connected to another run (run-to-run),
 *   - terminated at a wall corner (wall-closed),
 * or when a panel there would overlap a wall opening (cutout conflict -> the
 * panel is reported as `reason: "skipped"` with a diagnostic).
 *
 * Every exposed end of a non-island run produces a BASE panel and a WALL panel
 * (base cabinets + upper wall cabinets both have exposed sides); island runs
 * produce base panels only (the wall layer does not exist for islands).
 *
 * No React / Three.js / Zustand / DOM. Erasable TS only.
 */

import {
  BASE_DEPTH,
  BASE_HEIGHT,
  END_PANEL_THICKNESS,
  WALL_CABINET_DEPTH,
  WALL_CABINET_ELEVATION,
  WALL_CABINET_HEIGHT,
  touchesAnyWall,
} from "../kitchen.ts";
import { detectCorners } from "./cornerOwnership.ts";
import type { CornerEdge } from "./cornerOwnership.ts";

export interface Point2 {
  x: number;
  z: number;
}

export interface RunLike {
  id: string;
  points: Point2[];
  closed: boolean;
  baseHeight?: number;
  wallHeight?: number;
  wallElevation?: number;
  customMaterialId?: string;
}

export interface WallLike {
  id: string;
  points: Point2[];
  closed: boolean;
}

export interface CutoutLike {
  wallId: string;
  positionOnWall: number;
  width: number;
  type?: string;
}

export type PanelSide = "start" | "end";
export type PanelLayer = "base" | "wall";
export type PanelMaterial = "door" | "wallDoor" | "panel";
export type PanelReason = "exposed" | "skipped";

export interface EndPanelPlan {
  /** Deterministic: `${runId}#endpanel#${side}#${layer}`. */
  id: string;
  runId: string;
  side: PanelSide;
  layer: PanelLayer;
  /** World position of the panel centre, metres. */
  position: [number, number, number];
  /** World Y rotation (matches the module rotation convention). */
  rotationY: number;
  thicknessM: number;
  depthM: number;
  heightM: number;
  material: PanelMaterial;
  /** "exposed" = render it; "skipped" = conflict, render nothing. */
  reason: PanelReason;
  diagnostics: string[];
}

export interface EndPanelOptions {
  /** Proximity to wall/run endpoints that closes an end (default 0.05). */
  endpointTolM?: number;
  /** Proximity of a run end to a wall-opening centre that skips a panel. */
  cutoutProximityM?: number;
  thicknessM?: number;
  cutouts?: CutoutLike[];
}

interface Seg2 {
  a: Point2;
  b: Point2;
  key: string;
}

function runSegments(run: RunLike): Seg2[] {
  const segs: Seg2[] = [];
  for (let i = 0; i < run.points.length - 1; i++) {
    segs.push({ a: run.points[i], b: run.points[i + 1], key: `${run.id}#${i}` });
  }
  return segs;
}

function unit(from: Point2, to: Point2): Point2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return { x: 0, z: 1 };
  return { x: dx / len, z: dz / len };
}

function dist(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function isNear(a: Point2, b: Point2, tol: number): boolean {
  return dist(a, b) <= tol;
}

function parseSegKey(key: string): { runId: string; index: number } | null {
  const i = key.lastIndexOf("#");
  if (i < 0) return null;
  const index = parseInt(key.slice(i + 1), 10);
  if (Number.isNaN(index)) return null;
  return { runId: key.slice(0, i), index };
}

function wallSegmentAt(wall: WallLike, index: number): Seg2 | null {
  if (index < 0 || index >= wall.points.length - 1) return null;
  return { a: wall.points[index], b: wall.points[index + 1], key: `${wall.id}#${index}` };
}

/** Is the run end near the world centre of any wall opening? */
function cutoutConflict(P: Point2, walls: WallLike[], cutouts: CutoutLike[], prox: number): boolean {
  for (const c of cutouts) {
    const parsed = parseSegKey(c.wallId);
    if (!parsed) continue;
    const wall = walls.find((w) => w.id === parsed.runId);
    if (!wall) continue;
    const seg = wallSegmentAt(wall, parsed.index);
    if (!seg) continue;
    const len = Math.hypot(seg.b.x - seg.a.x, seg.b.z - seg.a.z);
    if (len < 1e-9) continue;
    const cx = seg.a.x + ((seg.b.x - seg.a.x) / len) * c.positionOnWall;
    const cz = seg.a.z + ((seg.b.z - seg.a.z) / len) * c.positionOnWall;
    if (dist(P, { x: cx, z: cz }) <= prox) return true;
  }
  return false;
}

function makePanel(
  run: RunLike,
  side: PanelSide,
  layer: PanelLayer,
  opts: Required<Omit<EndPanelOptions, "cutouts">>
): EndPanelPlan {
  const n = run.points.length;
  const interior = side === "end" ? run.points[n - 2] : run.points[1];
  const P = side === "end" ? run.points[n - 1] : run.points[0];
  const dOut = unit(interior, P); // points OUTWARD from the run end
  const front = { x: -dOut.z, z: dOut.x }; // perpendicular to the run axis

  const isWall = layer === "wall";
  const depth = isWall ? WALL_CABINET_DEPTH : BASE_DEPTH;
  const height = isWall
    ? (run.wallHeight ?? WALL_CABINET_HEIGHT)
    : (run.baseHeight ?? BASE_HEIGHT);
  const elevation = isWall ? (run.wallElevation ?? WALL_CABINET_ELEVATION) : 0;

  const t = opts.thicknessM;
  return {
    id: `${run.id}#endpanel#${side}#${layer}`,
    runId: run.id,
    side,
    layer,
    position: [
      P.x + dOut.x * (t / 2) + front.x * (depth / 2),
      elevation + height / 2,
      P.z + dOut.z * (t / 2) + front.z * (depth / 2),
    ],
    rotationY: Math.atan2(-dOut.z, dOut.x),
    thicknessM: t,
    depthM: depth,
    heightM: height,
    material: run.customMaterialId ? "panel" : isWall ? "wallDoor" : "door",
    reason: "exposed",
    diagnostics: [],
  };
}

/**
 * Derive the end-panel plan for the committed runs. Deterministic, pure,
 * serializable.
 */
export function deriveEndPanels(
  runs: RunLike[],
  walls: WallLike[],
  options?: EndPanelOptions
): EndPanelPlan[] {
  const opts: Required<Omit<EndPanelOptions, "cutouts">> = {
    endpointTolM: options?.endpointTolM ?? 0.05,
    cutoutProximityM: options?.cutoutProximityM ?? 0.05,
    thicknessM: options?.thicknessM ?? END_PANEL_THICKNESS,
  };
  const cutouts = options?.cutouts ?? [];
  const panels: EndPanelPlan[] = [];

  // Corner endpoints per run (owner + returner) from Phase 2 ownership.
  const edges: CornerEdge[] = runs.flatMap((r) =>
    runSegments(r).map((s) => ({ id: r.id, segmentKey: s.key, a: s.a, b: s.b }))
  );
  const corner = detectCorners(edges);
  const cornerPts = new Map<string, Point2[]>();
  for (const t of corner.turns) {
    for (const [key, end] of [
      [t.ownerKey, t.ownerEnd],
      [t.returnKey, t.returnEnd],
    ] as const) {
      const parsed = parseSegKey(key);
      const run = parsed ? runs.find((r) => r.id === parsed.runId) : undefined;
      if (!run || !parsed || parsed.index >= run.points.length - 1) continue;
      const pt = end === "start" ? run.points[parsed.index] : run.points[parsed.index + 1];
      const arr = cornerPts.get(run.id) ?? [];
      arr.push(pt);
      cornerPts.set(run.id, arr);
    }
  }

  const wallEndpoints: Point2[] = walls.flatMap((w) => w.points);

  for (const run of runs) {
    if (run.closed || run.points.length < 2) continue;
    const isIsland = !touchesAnyWall(run, walls);

    for (const side of ["start", "end"] as const) {
      const P = side === "start" ? run.points[0] : run.points[run.points.length - 1];

      // Corner-owned end -> the corner module/return closes it.
      if ((cornerPts.get(run.id) ?? []).some((c) => isNear(P, c, opts.endpointTolM))) continue;
      // Run-to-run connection.
      let connected = false;
      for (const other of runs) {
        if (other.id === run.id) continue;
        if (
          isNear(P, other.points[0], opts.endpointTolM) ||
          isNear(P, other.points[other.points.length - 1], opts.endpointTolM)
        ) {
          connected = true;
          break;
        }
      }
      if (connected) continue;
      // Wall-closed end.
      if (wallEndpoints.some((wp) => isNear(P, wp, opts.endpointTolM))) continue;
      // Cutout conflict -> report as skipped, do not render.
      if (cutoutConflict(P, walls, cutouts, opts.cutoutProximityM)) {
        panels.push({
          ...makePanel(run, side, "base", opts),
          reason: "skipped",
          diagnostics: [`end panel at ${run.id} ${side}: overlaps a wall opening near the run end`],
        });
        continue;
      }

      panels.push(makePanel(run, side, "base", opts));
      if (!isIsland) panels.push(makePanel(run, side, "wall", opts));
    }
  }

  return panels;
}
