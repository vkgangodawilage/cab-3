/**
 * Phase 3 — Verification orchestrator (client-side).
 *
 * Reads the CURRENT committed project state (runs/walls/cutouts), recomputes
 * the SAME planning the renderer uses (`runBlockedSegmentsWithCorners` +
 * `planRunLayout`, identical ids/ordering), measures the registered committed
 * module roots via `measureObject`, and runs the pure verifier. Returns a plain
 * serializable `VerificationResult`.
 *
 * Ghosts (the active run) are excluded — verification targets committed
 * geometry only, on demand (Verify button).
 */

import * as THREE from "three";
import {
  BASE_HEIGHT,
  WALL_CABINET_HEIGHT,
  WALL_CABINET_ELEVATION,
  WALL_CABINET_DEPTH,
  touchesAnyWall,
} from "@/lib/kitchen";
import { WALL_THICKNESS } from "@/constants/dimensions";
import { planRunLayout } from "@/components/CabinetLayoutEngine";
import {
  runBlockedSegmentsWithCorners,
  blockedIntervalsForRunSegment,
  projectBlockedToSegment,
} from "@/lib/planning/adapters";
import { detectCorners } from "@/lib/planning/cornerOwnership";
import type { CornerEdge, CornerLayerReservations } from "@/lib/planning/cornerOwnership";
import { getCatalogItem } from "@/lib/catalog";
import { getWallSegment, parseSegmentId } from "@/lib/placement";
import { mergeIntervals } from "@/lib/planning/intervals";
import { deriveEndPanels } from "@/lib/planning/endPanels";
import {
  aggregateRun,
  aggregateAll,
  computeOverlapViolations,
  computePlacedOverlapViolations,
  computePlacedRunOverlapViolations,
  verifyPlacedItem,
  verifyEndPanel,
  toPlannedEndPanel,
} from "@/lib/planning/planVerification";
import { VERIFY_DEFAULTS } from "@/lib/planning/config";
import type {
  EndPanelVerifyResult,
  MeasuredModule,
  MeasuredWithKind,
  MeasuredPlacedWithElevation,
  PlannedModule,
  PlannedPlacedItem,
  PlacedItemVerifyResult,
  RunModuleFootprint,
  RunVerifyResult,
  VerificationResult,
  VerifyThresholds,
} from "@/lib/planning/planVerification";
import type { IntervalMm } from "@/lib/planning/types";
import { measureObject } from "./measureGeometry";
import { getAllRegistered } from "./measureRegistry";

export interface RunLike {
  id: string;
  points: { x: number; z: number }[];
  closed: boolean;
  baseHeight?: number;
  wallHeight?: number;
  wallElevation?: number;
}

export interface WallLike {
  id: string;
  points: { x: number; z: number }[];
  closed: boolean;
}

export interface CutoutLike {
  wallId: string;
  positionOnWall: number;
  width: number;
  type?: "door" | "window";
}

export interface VerifySceneInputs {
  runs: RunLike[];
  walls: WallLike[];
  placedCutouts: CutoutLike[];
  placedItems: PlacedItemLike[];
  activeCabinetId: string | null;
}

/** Structural PlacedItem shape (duck-typed; no store import). */
export interface PlacedItemLike {
  id: string;
  catalogId: string;
  wallId: string;
  position: [number, number, number];
  rotationY: number;
  customWidth?: number;
  customHeight?: number;
  customDepth?: number;
  customElevation?: number;
}

interface Seg2 {
  index: number;
  a: { x: number; z: number };
  b: { x: number; z: number };
  len: number;
}

function runSegments(run: RunLike): Seg2[] {
  const segs: Seg2[] = [];
  for (let i = 0; i < run.points.length - 1; i++) {
    const a = run.points[i];
    const b = run.points[i + 1];
    segs.push({ index: i, a, b, len: Math.hypot(b.x - a.x, b.z - a.z) });
  }
  return segs;
}

function projAlong(seg: Seg2, x: number, z: number): number {
  const dx = seg.b.x - seg.a.x;
  const dz = seg.b.z - seg.a.z;
  if (seg.len < 1e-9) return 0;
  return ((x - seg.a.x) * dx + (z - seg.a.z) * dz) / seg.len;
}

/** The segment whose span contains (x, z) projected from the run line. */
function segmentAt(segs: Seg2[], x: number, z: number): Seg2 | null {
  const tol = 0.05;
  let best: Seg2 | null = null;
  let bestErr = Infinity;
  for (const s of segs) {
    const t = projAlong(s, x, z);
    const overshoot = Math.max(0 - t, t - s.len, 0);
    if (overshoot <= tol && overshoot < bestErr) {
      bestErr = overshoot;
      best = s;
    }
  }
  return best;
}

const MM = 1000;

export function runVerification(
  inputs: VerifySceneInputs,
  registry: Map<string, THREE.Object3D> = getAllRegistered(),
  thresholds: VerifyThresholds = VERIFY_DEFAULTS
): VerificationResult {
  const committed = inputs.runs.filter((r) => r.id !== inputs.activeCabinetId);
  if (committed.length === 0) {
    return aggregateAll([], [], [], Date.now());
  }

  const cornerBlocked = runBlockedSegmentsWithCorners(
    committed,
    inputs.walls,
    inputs.placedCutouts
  );
  const runResults: RunVerifyResult[] = [];

  const overlapModules: MeasuredWithKind[] = [];
  const runModuleFootprints: RunModuleFootprint[] = [];

  for (const run of committed) {
    const isIsland = !touchesAnyWall(run, inputs.walls);
    const blocked = cornerBlocked.runs[run.id];
    const layout = planRunLayout(run.points, isIsland, blocked?.base ?? [], blocked?.top ?? []);

    const baseHeight = run.baseHeight ?? BASE_HEIGHT;
    const wallHeight = run.wallHeight ?? WALL_CABINET_HEIGHT;
    const wallElevation = run.wallElevation ?? WALL_CABINET_ELEVATION;
    const segments = runSegments(run);

    const plannedModules: PlannedModule[] = [];

    layout.base.forEach((m, i) => {
      const seg = m.kind === "l-corner" ? null : segmentAt(segments, m.x, m.z);
      plannedModules.push({
        id: `${run.id}#base#${i}`,
        layer: "base",
        kind: m.kind,
        widthMm: Math.round(m.width * MM),
        depthMm: Math.round(m.depth * MM),
        heightMm: Math.round(baseHeight * MM),
        centerXmm: Math.round(m.x * MM),
        centerYmm: Math.round((baseHeight / 2) * MM),
        centerZmm: Math.round(m.z * MM),
        rotationY: m.rotationY,
        tMm: seg ? Math.round(projAlong(seg, m.x, m.z) * MM) : 0,
        blockedBaseMm: seg ? blocked?.base[seg.index] ?? [] : [],
        blockedTopMm: seg ? blocked?.top[seg.index] ?? [] : [],
      });
    });

    layout.wall.forEach((p, i) => {
      const seg = segmentAt(segments, p.x, p.z);
      plannedModules.push({
        id: `${run.id}#wall#${i}`,
        layer: "wall",
        kind: p.variant,
        widthMm: Math.round(p.width * MM),
        depthMm: Math.round(WALL_CABINET_DEPTH * MM),
        heightMm: Math.round(wallHeight * MM),
        centerXmm: Math.round(p.x * MM),
        centerYmm: Math.round((wallElevation + wallHeight / 2) * MM),
        centerZmm: Math.round(p.z * MM),
        rotationY: p.rotationY,
        tMm: seg ? Math.round(projAlong(seg, p.x, p.z) * MM) : 0,
        blockedBaseMm: seg ? blocked?.base[seg.index] ?? [] : [],
        blockedTopMm: seg ? blocked?.top[seg.index] ?? [] : [],
      });
    });

    layout.wallCorners.forEach((c, i) => {
      plannedModules.push({
        id: `${run.id}#corner#${i}`,
        layer: "corner",
        kind: "l-corner",
        widthMm: Math.round(c.size * MM),
        depthMm: Math.round(c.size * MM),
        heightMm: Math.round(wallHeight * MM),
        centerXmm: Math.round(c.x * MM),
        centerYmm: Math.round((wallElevation + wallHeight / 2) * MM),
        centerZmm: Math.round(c.z * MM),
        rotationY: c.rotationY,
        tMm: 0,
        blockedBaseMm: [],
        blockedTopMm: [],
      });
    });

    const measured: Record<string, MeasuredModule> = {};
    for (const p of plannedModules) {
      const obj = registry.get(p.id);
      if (!obj) continue;
      const m = measureObject(obj);
      if (m.widthMm > 0 && m.heightMm > 0 && m.depthMm > 0) {
        measured[p.id] = m;
        overlapModules.push({ id: p.id, layer: p.layer, kind: p.kind, measured: m });
        runModuleFootprints.push({
          runId: run.id,
          moduleId: p.id,
          layer: p.layer,
          kind: p.kind,
          measured: m,
        });
      }
    }

    const runLengthMm = Math.round(segments.reduce((s, seg) => s + seg.len, 0) * MM);
    const baseReservedMm = Math.round(
      (blocked?.base ?? []).reduce(
        (s, arr) => s + arr.reduce((ss, iv) => ss + (iv.end - iv.start), 0),
        0
      )
    );

    runResults.push(
      aggregateRun({
        runId: run.id,
        runLengthMm,
        baseReservedMm,
        plannedModules,
        measured,
        thresholds,
      })
    );
  }

  // ---- Phase 4A: wall-anchored placed items --------------------------------
  // Corner reservations (per run segment) are projected onto each item's wall.
  const cornerEdges: CornerEdge[] = [];
  const cutoutBlockedMap: Record<string, CornerLayerReservations> = {};
  for (const run of committed) {
    runSegments(run).forEach((seg, i) => {
      const key = `${run.id}#${i}`;
      cornerEdges.push({ id: run.id, segmentKey: key, a: seg.a, b: seg.b });
      cutoutBlockedMap[key] = {
        base: blockedIntervalsForRunSegment(seg.a, seg.b, inputs.walls, inputs.placedCutouts, { layer: "base" }),
        top: blockedIntervalsForRunSegment(seg.a, seg.b, inputs.walls, inputs.placedCutouts, { layer: "top" }),
      };
    });
  }
  const cornerResult = detectCorners(cornerEdges, cutoutBlockedMap);
  const baseReservedSources = cornerEdges.map((e) => ({
    a: e.a,
    b: e.b,
    blocked: cornerResult.reservations[e.segmentKey]?.base ?? [],
  }));
  const topReservedSources = cornerEdges.map((e) => ({
    a: e.a,
    b: e.b,
    blocked: cornerResult.reservations[e.segmentKey]?.top ?? [],
  }));

  const placedResults: PlacedItemVerifyResult[] = [];
  const placedOverlap: MeasuredPlacedWithElevation[] = [];

  for (const item of inputs.placedItems) {
    const catalog = getCatalogItem(item.catalogId);
    if (!catalog || catalog.kind !== "furniture") continue;

    const seg = parseSegmentId(item.wallId) ? getWallSegment(inputs.walls, item.wallId) : null;
    const floorLayer = catalog.elevation === "floor";

    const widthMm = Math.round((item.customWidth ?? catalog.width) * MM);
    const heightMm = Math.round(catalog.height * MM);
    const depthMm = Math.round(catalog.depth * MM);
    const itemHeight = item.customHeight ?? catalog.height;
    const centerYmm =
      item.customElevation !== undefined
        ? Math.round((item.customElevation + itemHeight / 2) * MM)
        : Math.round(item.position[1] * MM);

    // Cutouts on this wall segment for the item's layer.
    let blockedMm: IntervalMm[] = [];
    if (seg) {
      const len = Math.hypot(seg.b.x - seg.a.x, seg.b.z - seg.a.z);
      for (const c of inputs.placedCutouts) {
        if (c.wallId !== item.wallId) continue;
        if (floorLayer && c.type === "window") continue;
        const half = c.width / 2;
        const s = Math.round(Math.max(0, c.positionOnWall - half) * MM);
        const e = Math.round(Math.min(len, c.positionOnWall + half) * MM);
        if (e > s) blockedMm.push({ start: s, end: e });
      }
      blockedMm = mergeIntervals(blockedMm);
    }

    const reservedMm = seg
      ? projectBlockedToSegment(seg.a, seg.b, floorLayer ? baseReservedSources : topReservedSources)
      : [];

    const planned: PlannedPlacedItem = {
      id: item.id,
      catalogId: item.catalogId,
      label: catalog.label,
      wallId: item.wallId,
      elevation: catalog.elevation,
      widthMm,
      heightMm,
      depthMm,
      centerXmm: Math.round(item.position[0] * MM),
      centerYmm,
      centerZmm: Math.round(item.position[2] * MM),
      rotationY: item.rotationY,
      wallSegA: seg ? { x: seg.a.x, z: seg.a.z } : null,
      wallSegB: seg ? { x: seg.b.x, z: seg.b.z } : null,
      backOffsetMm: Math.round((WALL_THICKNESS / 2 + catalog.depth / 2) * MM),
      blockedMm,
      reservedMm,
    };

    const obj = registry.get(item.id);
    const measuredObj = obj ? measureObject(obj) : null;
    const measured =
      measuredObj && measuredObj.widthMm > 0 && measuredObj.heightMm > 0 && measuredObj.depthMm > 0
        ? measuredObj
        : null;

    const result = verifyPlacedItem(planned, measured, thresholds);
    placedResults.push(result);
    if (measured) {
      placedOverlap.push({ id: item.id, elevation: catalog.elevation, measured });
    }
  }

  // ---- Phase 4D.1: derived end panels --------------------------------------
  const endPanelResults: EndPanelVerifyResult[] = [];
  for (const plan of deriveEndPanels(committed, inputs.walls, { cutouts: inputs.placedCutouts })) {
    if (plan.reason !== "exposed") continue;
    const obj = registry.get(plan.id);
    const measuredObj = obj ? measureObject(obj) : null;
    const measured =
      measuredObj && measuredObj.widthMm > 0 && measuredObj.heightMm > 0 && measuredObj.depthMm > 0
        ? measuredObj
        : null;
    endPanelResults.push(verifyEndPanel(toPlannedEndPanel(plan), measured, thresholds));
  }

  const contact = VERIFY_DEFAULTS.overlapContactM;
  const runOverlap = computeOverlapViolations(overlapModules, contact);
  const placedOverlapViolations = computePlacedOverlapViolations(placedOverlap, contact);
  const placedRunOverlap = computePlacedRunOverlapViolations(placedOverlap, runModuleFootprints, {
    contactM: contact,
  });
  const overlapViolations = [...runOverlap, ...placedOverlapViolations, ...placedRunOverlap];
  return aggregateAll(runResults, placedResults, overlapViolations, Date.now(), endPanelResults);
}
