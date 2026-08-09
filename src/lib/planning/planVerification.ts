/**
 * Phase 3 — Plan vs Built verification (pure).
 *
 * Compares PLANNED cabinet modules against MEASURED actual geometry. The
 * measured inputs are plain serializable objects produced by the Three.js
 * adapter (`src/lib/three/measureGeometry.ts`) — this module never touches
 * React / Three.js / Zustand / DOM.
 *
 * Concepts adapted from the reference:
 *   - `CBX_SeniorDev_Debug.rb#compare`: per-module W/D/H vs plan with a
 *     15mm tolerance, aggregated into OK / MISMATCHED counts.
 *   - `CBX_AutoLayout.rb#verify_and_report`: merged spans + gap finder.
 *
 * Statuses: PASS (within soft tolerance), WARNING (within hard tolerance),
 * ERROR (beyond hard tolerance, or a hard constraint violation).
 *
 * This module is observational — it never modifies anything.
 *
 * No React / Three.js / Zustand / DOM. Erasable TS only.
 */

import type { IntervalMm } from "./types.ts";
import type { EndPanelPlan } from "./endPanels.ts";

export type VerifyStatus = "PASS" | "WARNING" | "ERROR";

export interface VerifyThresholds {
  dimensionSoftMm: number;
  dimensionHardMm: number;
  positionSoftMm: number;
  positionHardMm: number;
  wallGapSoftMm: number;
  wallGapHardMm: number;
  rotationSoftDeg: number;
  rotationHardDeg: number;
}

export type ModuleLayer = "base" | "wall" | "corner";

/** What the planner intended for one cabinet/module (centres in mm). */
export interface PlannedModule {
  id: string;
  layer: ModuleLayer;
  kind: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  centerXmm: number;
  centerYmm: number;
  centerZmm: number;
  rotationY: number;
  /** Centre along its run segment (mm), used for obstacle/gap checks. */
  tMm: number;
  blockedBaseMm: IntervalMm[];
  blockedTopMm: IntervalMm[];
}

/** What `measureObject` actually measured (plain numbers). */
export interface MeasuredModule {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  centerX: number;
  centerY: number;
  centerZ: number;
  rotationY: number;
}

export interface DimensionDelta {
  plannedMm: number;
  actualMm: number;
  deltaMm: number;
  toleranceMm: number;
  status: VerifyStatus;
}

export interface ModuleVerifyResult {
  id: string;
  layer: ModuleLayer;
  kind: string;
  status: VerifyStatus;
  measured: boolean;
  dimensions: {
    width: DimensionDelta;
    depth: DimensionDelta;
    height: DimensionDelta;
  };
  position: {
    x: DimensionDelta;
    y: DimensionDelta;
    z: DimensionDelta;
  };
  rotationDeltaDeg: number;
  rotationStatus: VerifyStatus;
  diagnostics: string[];
}

export interface RunVerifyResult {
  runId: string;
  status: VerifyStatus;
  modules: ModuleVerifyResult[];
  plannedCount: number;
  measuredCount: number;
  plannedTotalWidthMm: number;
  actualTotalWidthMm: number;
  runLengthMm: number;
  baseOccupiedMm: number;
  baseReservedMm: number;
  remainingGapMm: number;
  gapStatus: VerifyStatus;
  obstacleViolations: string[];
  diagnostics: string[];
}

export interface VerificationResult {
  overall: VerifyStatus;
  runs: RunVerifyResult[];
  moduleCount: number;
  passed: number;
  warnings: number;
  errors: number;
  /** Phase 4A — wall-anchored placed items. */
  placedItems: PlacedItemVerifyResult[];
  placedCount: number;
  placedPassed: number;
  placedWarnings: number;
  placedErrors: number;
  /** Phase 4D.1 — derived end panels. */
  endPanels: EndPanelVerifyResult[];
  endPanelCount: number;
  endPanelPassed: number;
  endPanelWarnings: number;
  endPanelErrors: number;
  overlapViolations: string[];
  issues: string[];
  timestamp: number;
}

/* -------------------------------------------------------------------------- */
/* Phase 4A — wall-anchored placed item verification                           */
/* -------------------------------------------------------------------------- */

export interface PlanPoint {
  x: number;
  z: number;
}

/**
 * Planned wall-anchored placed item. Authoritative dimensions follow the
 * editor's ACTUAL render math:
 *   - width  = customWidth ?? catalog.width   (GLB is X-scaled)
 *   - height = catalog.height                 (GLB is NOT Y-scaled)
 *   - depth  = catalog.depth                  (GLB is NOT Z-scaled)
 * `customHeight`/`customDepth` only resize the selection wireframe/BOM and are
 * intentionally NOT used as the planned height/depth here.
 */
export interface PlannedPlacedItem {
  id: string;
  catalogId: string;
  label: string;
  wallId: string;
  elevation: "floor" | "wall";
  widthMm: number;
  heightMm: number;
  depthMm: number;
  centerXmm: number;
  centerYmm: number;
  centerZmm: number;
  rotationY: number;
  /** Wall segment geometry (null when the anchor wall is missing). */
  wallSegA: PlanPoint | null;
  wallSegB: PlanPoint | null;
  /** Expected perpendicular distance from the measured centre to the wall. */
  backOffsetMm: number;
  /** Cutouts on this wall segment for the item's layer (mm along the wall). */
  blockedMm: IntervalMm[];
  /** Corner reservations projected onto this wall segment (mm). */
  reservedMm: IntervalMm[];
}

export interface PlacedItemVerifyResult {
  id: string;
  catalogId: string;
  label: string;
  status: VerifyStatus;
  measured: boolean;
  dimensions: {
    width: DimensionDelta;
    height: DimensionDelta;
    depth: DimensionDelta;
  };
  position: {
    x: DimensionDelta;
    y: DimensionDelta;
    z: DimensionDelta;
  };
  wallDistance: {
    expectedMm: number;
    actualMm: number;
    deltaMm: number;
    status: VerifyStatus;
  };
  rotationDeltaDeg: number;
  rotationStatus: VerifyStatus;
  alongWall: { tMm: number; lengthMm: number; status: VerifyStatus };
  obstacleViolations: string[];
  cornerViolations: string[];
  diagnostics: string[];
}

function segLen(a: PlanPoint, b: PlanPoint): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function perpDistanceToLine(px: number, pz: number, a: PlanPoint, b: PlanPoint): number {
  const len = segLen(a, b);
  if (len < 1e-9) return Infinity;
  const dx = (b.x - a.x) / len;
  const dz = (b.z - a.z) / len;
  return Math.abs(dx * (pz - a.z) - dz * (px - a.x));
}

function projAlong(a: PlanPoint, b: PlanPoint, px: number, pz: number): number {
  const len = segLen(a, b);
  if (len < 1e-9) return 0;
  const dx = (b.x - a.x) / len;
  const dz = (b.z - a.z) / len;
  return (px - a.x) * dx + (pz - a.z) * dz;
}

function wrapAngle(a: number): number {
  const TAU = Math.PI * 2;
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/** The two wall-normal rotations (differ by 180°); the item should match one. */
function wallNormalRotations(a: PlanPoint, b: PlanPoint): number[] {
  const len = segLen(a, b);
  if (len < 1e-9) return [0, Math.PI];
  const dx = (b.x - a.x) / len;
  const dz = (b.z - a.z) / len;
  const r = Math.atan2(-dz, dx); // n = (-dz, dx) outward-left
  return [wrapAngle(r), wrapAngle(r + Math.PI)];
}

export function verifyPlacedItem(
  planned: PlannedPlacedItem,
  measured: MeasuredModule | null,
  t: VerifyThresholds
): PlacedItemVerifyResult {
  if (!measured) {
    return {
      id: planned.id,
      catalogId: planned.catalogId,
      label: planned.label,
      status: "ERROR",
      measured: false,
      dimensions: {
        width: { plannedMm: planned.widthMm, actualMm: 0, deltaMm: 0, toleranceMm: t.dimensionSoftMm, status: "ERROR" },
        height: { plannedMm: planned.heightMm, actualMm: 0, deltaMm: 0, toleranceMm: t.dimensionSoftMm, status: "ERROR" },
        depth: { plannedMm: planned.depthMm, actualMm: 0, deltaMm: 0, toleranceMm: t.dimensionSoftMm, status: "ERROR" },
      },
      position: {
        x: { plannedMm: planned.centerXmm, actualMm: 0, deltaMm: 0, toleranceMm: t.positionSoftMm, status: "ERROR" },
        y: { plannedMm: planned.centerYmm, actualMm: 0, deltaMm: 0, toleranceMm: t.positionSoftMm, status: "ERROR" },
        z: { plannedMm: planned.centerZmm, actualMm: 0, deltaMm: 0, toleranceMm: t.positionSoftMm, status: "ERROR" },
      },
      wallDistance: { expectedMm: planned.backOffsetMm, actualMm: 0, deltaMm: 0, status: "ERROR" },
      rotationDeltaDeg: 0,
      rotationStatus: "ERROR",
      alongWall: { tMm: 0, lengthMm: 0, status: "ERROR" },
      obstacleViolations: [],
      cornerViolations: [],
      diagnostics: [`${planned.id}: placed item not measured (missing from the scene)`],
    };
  }

  const dw = delta(planned.widthMm, measured.widthMm, t.dimensionSoftMm);
  const dh = delta(planned.heightMm, measured.heightMm, t.dimensionSoftMm);
  const dd = delta(planned.depthMm, measured.depthMm, t.dimensionSoftMm);
  const px = delta(planned.centerXmm, measured.centerX, t.positionSoftMm);
  const py = delta(planned.centerYmm, measured.centerY, t.positionSoftMm);
  const pz = delta(planned.centerZmm, measured.centerZ, t.positionSoftMm);

  // Wall anchor distance.
  let wallDistance: PlacedItemVerifyResult["wallDistance"];
  if (!planned.wallSegA || !planned.wallSegB) {
    wallDistance = { expectedMm: planned.backOffsetMm, actualMm: 0, deltaMm: 0, status: "ERROR" };
  } else {
    const d =
      perpDistanceToLine(measured.centerX / 1000, measured.centerZ / 1000, planned.wallSegA, planned.wallSegB) * 1000;
    wallDistance = {
      expectedMm: planned.backOffsetMm,
      actualMm: Math.round(d * 10) / 10,
      deltaMm: Math.round((d - planned.backOffsetMm) * 10) / 10,
      status: statusFor(d - planned.backOffsetMm, t.positionSoftMm, t.positionHardMm),
    };
  }

  // Orientation: rotationY must match one of the wall's two normals.
  let rotationDeltaDeg = 0;
  let rotationStatus: VerifyStatus = "ERROR";
  if (planned.wallSegA && planned.wallSegB) {
    const bestDeg =
      Math.min(...wallNormalRotations(planned.wallSegA, planned.wallSegB).map((r) => Math.abs(wrapAngle(measured.rotationY - r)))) *
      (180 / Math.PI);
    rotationDeltaDeg = Math.round(bestDeg * 10) / 10;
    rotationStatus = statusFor(bestDeg, t.rotationSoftDeg, t.rotationHardDeg);
  } else {
    rotationDeltaDeg = Math.round(Math.abs(planned.rotationY - measured.rotationY) * (180 / Math.PI) * 10) / 10;
    rotationStatus = statusFor(rotationDeltaDeg, t.rotationSoftDeg, t.rotationHardDeg);
  }

  // Along-wall position.
  let alongWall: PlacedItemVerifyResult["alongWall"];
  if (planned.wallSegA && planned.wallSegB) {
    const lenM = segLen(planned.wallSegA, planned.wallSegB);
    const tM = projAlong(planned.wallSegA, planned.wallSegB, measured.centerX / 1000, measured.centerZ / 1000);
    const tMm = Math.round(tM * 1000);
    const lengthMm = Math.round(lenM * 1000);
    const tol = t.positionHardMm;
    alongWall = {
      tMm,
      lengthMm,
      status: tMm < -tol || tMm > lengthMm + tol ? "ERROR" : "PASS",
    };
  } else {
    alongWall = { tMm: 0, lengthMm: 0, status: "ERROR" };
  }

  // Obstacle + corner-reservation penetration (along-wall footprint).
  const half = measured.widthMm / 2;
  const s = alongWall.tMm - half;
  const e = alongWall.tMm + half;
  const obstacleViolations: string[] = [];
  const cornerViolations: string[] = [];
  for (const b of planned.blockedMm) {
    if (s < b.end && e > b.start) {
      obstacleViolations.push(`${planned.id}: enters blocked opening [${b.start}..${b.end}]mm`);
    }
  }
  for (const r of planned.reservedMm) {
    if (s < r.end && e > r.start) {
      cornerViolations.push(`${planned.id}: enters reserved corner region [${r.start}..${r.end}]mm`);
    }
  }

  let status = worst(
    worst(
      worst(worst(worst(worst(dw.status, dh.status), dd.status), px.status), py.status),
      pz.status
    ),
    worst(worst(wallDistance.status, rotationStatus), alongWall.status)
  );
  if (obstacleViolations.length > 0 || cornerViolations.length > 0) status = "ERROR";

  const diagnostics: string[] = [];
  const push = (label: string, d: DimensionDelta) => {
    if (d.status !== "PASS") {
      diagnostics.push(`${planned.label}: ${label} ${d.deltaMm > 0 ? "+" : ""}${d.deltaMm.toFixed(1)}mm (${d.status})`);
    }
  };
  push("width", dw);
  push("height", dh);
  push("depth", dd);
  push("position X", px);
  push("position Y", py);
  push("position Z", pz);
  if (wallDistance.status !== "PASS") {
    diagnostics.push(
      `${planned.label}: wall distance ${wallDistance.deltaMm > 0 ? "+" : ""}${wallDistance.deltaMm.toFixed(1)}mm vs ${wallDistance.expectedMm.toFixed(0)}mm (${wallDistance.status})`
    );
  }
  if (rotationStatus !== "PASS") {
    diagnostics.push(`${planned.label}: rotation ${rotationDeltaDeg}° (${rotationStatus})`);
  }
  if (alongWall.status !== "PASS") {
    diagnostics.push(`${planned.label}: outside wall segment (t=${alongWall.tMm}mm of ${alongWall.lengthMm}mm)`);
  }
  diagnostics.push(...obstacleViolations, ...cornerViolations);

  return {
    id: planned.id,
    catalogId: planned.catalogId,
    label: planned.label,
    status,
    measured: true,
    dimensions: { width: dw, height: dh, depth: dd },
    position: { x: px, y: py, z: pz },
    wallDistance,
    rotationDeltaDeg,
    rotationStatus,
    alongWall,
    obstacleViolations,
    cornerViolations,
    diagnostics,
  };
}

export interface MeasuredPlacedWithElevation {
  id: string;
  elevation: "floor" | "wall";
  measured: MeasuredModule;
}

/** Placed-item overlap: same elevation only (floor↔floor, wall↔wall), OBB SAT. */
export function computePlacedOverlapViolations(
  items: MeasuredPlacedWithElevation[],
  contactM = 0.005
): string[] {
  const byElevation: Record<string, MeasuredPlacedWithElevation[]> = {};
  for (const it of items) {
    (byElevation[it.elevation] ??= []).push(it);
  }
  const violations: string[] = [];
  for (const elevation of Object.keys(byElevation)) {
    const arr = byElevation[elevation];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (obbPenetration(toObb(a.measured), toObb(b.measured)) > contactM) {
          violations.push(`${a.id} overlaps ${b.id} (placed, ${elevation})`);
        }
      }
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- */
/* Phase 4B — placed item ↔ run module overlap                                 */
/* -------------------------------------------------------------------------- */

export type PlacedFootprint = MeasuredPlacedWithElevation;

export interface RunModuleFootprint {
  runId: string;
  moduleId: string;
  layer: ModuleLayer;
  kind: string;
  measured: MeasuredModule;
}

export interface PlacedRunOverlapOptions {
  /**
   * Penetration (m) above which an overlap is a violation (contact tolerance).
   * Default 0.005; the scene passes `VERIFY_DEFAULTS.overlapContactM`.
   */
  contactM?: number;
  /** Include l-corner modules (default true — a real penetration is an ERROR). */
  checkCorners?: boolean;
}

/**
 * Placed GLB ↔ run-module overlap, same-elevation only:
 *   - floor placed ↔ `base` run modules
 *   - wall placed ↔ `wall` / `corner` run modules
 * Uses ACTUAL measured OBB footprints (rotation-aware SAT). A violation is
 * reported only when penetration exceeds the contact tolerance, so intentionally
 * snug arrangements (pantry flush against a base run) pass.
 */
export function computePlacedRunOverlapViolations(
  placed: PlacedFootprint[],
  runModules: RunModuleFootprint[],
  opts?: PlacedRunOverlapOptions
): string[] {
  const contact = opts?.contactM ?? 0.005;
  const checkCorners = opts?.checkCorners ?? true;
  const violations: string[] = [];

  for (const p of placed) {
    const targetLayers: ModuleLayer[] = p.elevation === "floor" ? ["base"] : ["wall", "corner"];
    for (const rm of runModules) {
      if (!targetLayers.includes(rm.layer)) continue;
      if (rm.kind === "l-corner" && !checkCorners) continue;
      const pen = obbPenetration(toObb(p.measured), toObb(rm.measured));
      if (pen > contact) {
        violations.push(
          `PLACED_RUN_OVERLAP ${p.id} penetrates ${rm.moduleId} (run ${rm.runId}, ${rm.layer}) by ${Math.round(pen * 1000)}mm`
        );
      }
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- */
/* Phase 4D.1 — end-panel plan-vs-built verification                           */
/* -------------------------------------------------------------------------- */

export interface PlannedEndPanel {
  id: string;
  runId: string;
  side: "start" | "end";
  layer: "base" | "wall";
  widthMm: number;
  heightMm: number;
  depthMm: number;
  centerXmm: number;
  centerYmm: number;
  centerZmm: number;
  rotationY: number;
}

export interface EndPanelVerifyResult {
  id: string;
  runId: string;
  side: string;
  layer: string;
  status: VerifyStatus;
  measured: boolean;
  dimensions: {
    width: DimensionDelta;
    height: DimensionDelta;
    depth: DimensionDelta;
  };
  position: {
    x: DimensionDelta;
    y: DimensionDelta;
    z: DimensionDelta;
  };
  rotationDeltaDeg: number;
  rotationStatus: VerifyStatus;
  diagnostics: string[];
}

/**
 * Map a derived `EndPanelPlan` into the planned measurement model. The
 * authoritative planned dimensions come ONLY from `deriveEndPanels` — no
 * geometry is re-derived here.
 */
export function toPlannedEndPanel(plan: EndPanelPlan): PlannedEndPanel {
  return {
    id: plan.id,
    runId: plan.runId,
    side: plan.side,
    layer: plan.layer,
    widthMm: Math.round(plan.thicknessM * 1000),
    heightMm: Math.round(plan.heightM * 1000),
    depthMm: Math.round(plan.depthM * 1000),
    centerXmm: Math.round(plan.position[0] * 1000),
    centerYmm: Math.round(plan.position[1] * 1000),
    centerZmm: Math.round(plan.position[2] * 1000),
    rotationY: plan.rotationY,
  };
}

/** Verify a single end panel against its measured runtime box (3-tier). */
export function verifyEndPanel(
  planned: PlannedEndPanel,
  measured: MeasuredModule | null,
  t: VerifyThresholds
): EndPanelVerifyResult {
  if (!measured) {
    return {
      id: planned.id,
      runId: planned.runId,
      side: planned.side,
      layer: planned.layer,
      status: "ERROR",
      measured: false,
      dimensions: {
        width: { plannedMm: planned.widthMm, actualMm: 0, deltaMm: 0, toleranceMm: t.dimensionSoftMm, status: "ERROR" },
        height: { plannedMm: planned.heightMm, actualMm: 0, deltaMm: 0, toleranceMm: t.dimensionSoftMm, status: "ERROR" },
        depth: { plannedMm: planned.depthMm, actualMm: 0, deltaMm: 0, toleranceMm: t.dimensionSoftMm, status: "ERROR" },
      },
      position: {
        x: { plannedMm: planned.centerXmm, actualMm: 0, deltaMm: 0, toleranceMm: t.positionSoftMm, status: "ERROR" },
        y: { plannedMm: planned.centerYmm, actualMm: 0, deltaMm: 0, toleranceMm: t.positionSoftMm, status: "ERROR" },
        z: { plannedMm: planned.centerZmm, actualMm: 0, deltaMm: 0, toleranceMm: t.positionSoftMm, status: "ERROR" },
      },
      rotationDeltaDeg: 0,
      rotationStatus: "ERROR",
      diagnostics: [
        `end panel ${planned.id} (run ${planned.runId}, ${planned.side}/${planned.layer}): not measured (missing runtime geometry)`,
      ],
    };
  }

  const dw = deltaTiered(planned.widthMm, measured.widthMm, t.dimensionSoftMm, t.dimensionHardMm);
  const dh = deltaTiered(planned.heightMm, measured.heightMm, t.dimensionSoftMm, t.dimensionHardMm);
  const dd = deltaTiered(planned.depthMm, measured.depthMm, t.dimensionSoftMm, t.dimensionHardMm);
  const px = deltaTiered(planned.centerXmm, measured.centerX, t.positionSoftMm, t.positionHardMm);
  const py = deltaTiered(planned.centerYmm, measured.centerY, t.positionSoftMm, t.positionHardMm);
  const pz = deltaTiered(planned.centerZmm, measured.centerZ, t.positionSoftMm, t.positionHardMm);

  const rotationDeltaDeg =
    Math.round(Math.abs(planned.rotationY - measured.rotationY) * (180 / Math.PI) * 10) / 10;
  const rotationStatus = statusFor(rotationDeltaDeg, t.rotationSoftDeg, t.rotationHardDeg);

  let status = worst(
    worst(
      worst(worst(worst(worst(dw.status, dh.status), dd.status), px.status), py.status),
      pz.status
    ),
    rotationStatus
  );

  const diagnostics: string[] = [];
  const push = (label: string, d: DimensionDelta) => {
    if (d.status !== "PASS") {
      diagnostics.push(
        `end panel ${planned.id}: ${label} ${d.deltaMm > 0 ? "+" : ""}${d.deltaMm.toFixed(1)}mm (${d.status})`
      );
    }
  };
  push("width", dw);
  push("height", dh);
  push("depth", dd);
  push("position X", px);
  push("position Y", py);
  push("position Z", pz);
  if (rotationStatus !== "PASS") {
    diagnostics.push(`end panel ${planned.id}: rotation ${rotationDeltaDeg}° (${rotationStatus})`);
  }

  return {
    id: planned.id,
    runId: planned.runId,
    side: planned.side,
    layer: planned.layer,
    status,
    measured: true,
    dimensions: { width: dw, height: dh, depth: dd },
    position: { x: px, y: py, z: pz },
    rotationDeltaDeg,
    rotationStatus,
    diagnostics,
  };
}

/* -------------------------------------------------------------------------- */
/* Status helpers                                                              */
/* -------------------------------------------------------------------------- */

export function statusFor(deltaMm: number, softMm: number, hardMm: number): VerifyStatus {
  const abs = Math.abs(deltaMm);
  if (abs <= softMm) return "PASS";
  if (abs <= hardMm) return "WARNING";
  return "ERROR";
}

function worst(a: VerifyStatus, b: VerifyStatus): VerifyStatus {
  if (a === "ERROR" || b === "ERROR") return "ERROR";
  if (a === "WARNING" || b === "WARNING") return "WARNING";
  return "PASS";
}

function delta(plannedMm: number, actualMm: number, toleranceMm: number): DimensionDelta {
  const deltaMm = Math.round((actualMm - plannedMm) * 1000) / 1000;
  return {
    plannedMm: Math.round(plannedMm * 1000) / 1000,
    actualMm: Math.round(actualMm * 1000) / 1000,
    deltaMm,
    toleranceMm,
    status: statusFor(deltaMm, toleranceMm, toleranceMm),
  };
}

/** 3-tier delta: PASS within soft, WARNING within hard, ERROR beyond hard. */
function deltaTiered(
  plannedMm: number,
  actualMm: number,
  softMm: number,
  hardMm: number
): DimensionDelta {
  const deltaMm = Math.round((actualMm - plannedMm) * 1000) / 1000;
  return {
    plannedMm: Math.round(plannedMm * 1000) / 1000,
    actualMm: Math.round(actualMm * 1000) / 1000,
    deltaMm,
    toleranceMm: softMm,
    status: statusFor(deltaMm, softMm, hardMm),
  };
}

/* -------------------------------------------------------------------------- */
/* Per-module verification (Part 6 / 8 / 12)                                   */
/* -------------------------------------------------------------------------- */

export function verifyModule(
  planned: PlannedModule,
  measured: MeasuredModule | null,
  t: VerifyThresholds
): ModuleVerifyResult {
  if (!measured) {
    return {
      id: planned.id,
      layer: planned.layer,
      kind: planned.kind,
      status: "ERROR",
      measured: false,
      dimensions: {
        width: { plannedMm: planned.widthMm, actualMm: 0, deltaMm: 0, toleranceMm: t.dimensionSoftMm, status: "ERROR" },
        depth: { plannedMm: planned.depthMm, actualMm: 0, deltaMm: 0, toleranceMm: t.dimensionSoftMm, status: "ERROR" },
        height: { plannedMm: planned.heightMm, actualMm: 0, deltaMm: 0, toleranceMm: t.dimensionSoftMm, status: "ERROR" },
      },
      position: {
        x: { plannedMm: planned.centerXmm, actualMm: 0, deltaMm: 0, toleranceMm: t.positionSoftMm, status: "ERROR" },
        y: { plannedMm: planned.centerYmm, actualMm: 0, deltaMm: 0, toleranceMm: t.positionSoftMm, status: "ERROR" },
        z: { plannedMm: planned.centerZmm, actualMm: 0, deltaMm: 0, toleranceMm: t.positionSoftMm, status: "ERROR" },
      },
      rotationDeltaDeg: 0,
      rotationStatus: "ERROR",
      diagnostics: [`${planned.id}: module not measured (missing from the scene)`],
    };
  }

  const dw = delta(planned.widthMm, measured.widthMm, t.dimensionSoftMm);
  const dd = delta(planned.depthMm, measured.depthMm, t.dimensionSoftMm);
  const dh = delta(planned.heightMm, measured.heightMm, t.dimensionSoftMm);
  const px = delta(planned.centerXmm, measured.centerX, t.positionSoftMm);
  const py = delta(planned.centerYmm, measured.centerY, t.positionSoftMm);
  const pz = delta(planned.centerZmm, measured.centerZ, t.positionSoftMm);

  const rotationDeltaDeg =
    Math.round(Math.abs(planned.rotationY - measured.rotationY) * (180 / Math.PI) * 10) / 10;
  const rotationStatus = statusFor(rotationDeltaDeg, t.rotationSoftDeg, t.rotationHardDeg);

  const status = worst(
    worst(
      worst(worst(worst(worst(dw.status, dd.status), dh.status), px.status), py.status),
      pz.status
    ),
    rotationStatus
  );

  const diagnostics: string[] = [];
  const push = (label: string, d: DimensionDelta) => {
    if (d.status !== "PASS") {
      diagnostics.push(`${planned.id}: ${label} ${d.deltaMm > 0 ? "+" : ""}${d.deltaMm.toFixed(1)}mm (${d.status})`);
    }
  };
  push("width", dw);
  push("depth", dd);
  push("height", dh);
  push("position X", px);
  push("position Y", py);
  push("position Z", pz);
  if (rotationStatus !== "PASS") {
    diagnostics.push(`${planned.id}: rotation ${rotationDeltaDeg}° (${rotationStatus})`);
  }

  return {
    id: planned.id,
    layer: planned.layer,
    kind: planned.kind,
    status,
    measured: true,
    dimensions: { width: dw, depth: dd, height: dh },
    position: { x: px, y: py, z: pz },
    rotationDeltaDeg,
    rotationStatus,
    diagnostics,
  };
}

/* -------------------------------------------------------------------------- */
/* Obstacle / gap checks (Part 9)                                              */
/* -------------------------------------------------------------------------- */

/** Does the module's actual x-range enter a blocked interval on its segment? */
export function moduleObstacleViolation(
  planned: PlannedModule,
  measured: MeasuredModule,
  t: VerifyThresholds
): string | null {
  if (planned.kind === "l-corner") return null; // corner footprint is intentional
  const blocked = planned.layer === "wall" ? planned.blockedTopMm : planned.blockedBaseMm;
  if (!blocked || blocked.length === 0) return null;

  const half = measured.widthMm / 2;
  const s = planned.tMm - half;
  const e = planned.tMm + half;
  for (const b of blocked) {
    if (s < b.end && e > b.start) {
      return `${planned.id}: enters blocked interval [${b.start}..${b.end}]mm (layer ${planned.layer})`;
    }
  }
  return null;
}

/** Gap status from a residual length (mm). */
export function gapStatus(remainingMm: number, t: VerifyThresholds): VerifyStatus {
  if (remainingMm < 0) return "ERROR"; // over-occupied: geometry overlaps reserved space
  return statusFor(remainingMm, t.wallGapSoftMm, t.wallGapHardMm);
}

/* -------------------------------------------------------------------------- */
/* OBB overlap (Part 10) — exact 2D rotated-rectangle test (SAT)              */
/* -------------------------------------------------------------------------- */

export interface Obb2 {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  rotation: number;
}

function obbAxes(o: Obb2): { x: number; z: number }[] {
  const c = Math.cos(o.rotation);
  const s = Math.sin(o.rotation);
  return [
    { x: c, z: s },
    { x: -s, z: c },
  ];
}

function projectRange(o: Obb2, axis: { x: number; z: number }): { min: number; max: number } {
  const c = Math.cos(o.rotation);
  const s = Math.sin(o.rotation);
  const centerD = o.cx * axis.x + o.cz * axis.z; // centre offset along the axis
  const corners = [
    { x: c * o.hw - s * o.hd, z: s * o.hw + c * o.hd },
    { x: -c * o.hw - s * o.hd, z: -s * o.hw + c * o.hd },
    { x: c * o.hw + s * o.hd, z: s * o.hw - c * o.hd },
    { x: -c * o.hw + s * o.hd, z: -s * o.hw - c * o.hd },
  ];
  let min = Infinity;
  let max = -Infinity;
  for (const p of corners) {
    const d = centerD + p.x * axis.x + p.z * axis.z;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

/** True when two oriented boxes overlap by more than `toleranceM`. */
export function obbOverlap(a: Obb2, b: Obb2, toleranceM = 0.005): boolean {
  const axes = [...obbAxes(a), ...obbAxes(b)];
  for (const axis of axes) {
    const pa = projectRange(a, axis);
    const pb = projectRange(b, axis);
    if (pa.max < pb.min - toleranceM || pb.max < pa.min - toleranceM) {
      return false;
    }
  }
  return true;
}

/**
 * Minimum translation depth (metres) when two OBBs interpenetrate, or 0 when
 * they are separated. Used for contact tolerance: only penetration strictly
 * greater than the contact threshold is a real overlap violation.
 */
export function obbPenetration(a: Obb2, b: Obb2): number {
  const axes = [...obbAxes(a), ...obbAxes(b)];
  let minOverlap = Infinity;
  for (const axis of axes) {
    const pa = projectRange(a, axis);
    const pb = projectRange(b, axis);
    if (pa.max < pb.min || pb.max < pa.min) return 0; // separated
    const overlap = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
    if (overlap < minOverlap) minOverlap = overlap;
  }
  return Math.max(0, minOverlap);
}

function toObb(m: MeasuredModule): Obb2 {
  return {
    cx: m.centerX / 1000,
    cz: m.centerZ / 1000,
    hw: m.widthMm / 2000,
    hd: m.depthMm / 2000,
    rotation: m.rotationY,
  };
}

export interface MeasuredWithKind {
  id: string;
  layer: ModuleLayer;
  kind: string;
  measured: MeasuredModule;
}

/**
 * Pairwise overlap within each layer (run modules). l-corner modules are
 * skipped (their diagonal door/footprint is intentional). Corner reservations
 * are empty regions and never produce modules, so they can never be flagged.
 * A violation is reported only when OBB penetration EXCEEDS `contactM` —
 * flush-touching adjacent modules are not errors.
 */
export function computeOverlapViolations(
  modules: MeasuredWithKind[],
  contactM = 0.005
): string[] {
  const byLayer: Record<string, MeasuredWithKind[]> = {};
  for (const m of modules) {
    (byLayer[m.layer] ??= []).push(m);
  }
  const violations: string[] = [];
  for (const layer of Object.keys(byLayer)) {
    const arr = byLayer[layer];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (a.kind === "l-corner" || b.kind === "l-corner") continue;
        if (obbPenetration(toObb(a.measured), toObb(b.measured)) > contactM) {
          violations.push(`${a.id} overlaps ${b.id} (${layer})`);
        }
      }
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- */
/* Run + overall aggregation (Part 12 / 13)                                    */
/* -------------------------------------------------------------------------- */

export interface RunVerifyInput {
  runId: string;
  runLengthMm: number;
  baseReservedMm: number;
  plannedModules: PlannedModule[];
  measured: Record<string, MeasuredModule>;
  thresholds: VerifyThresholds;
}

export function aggregateRun(input: RunVerifyInput): RunVerifyResult {
  const modules = input.plannedModules.map((p) =>
    verifyModule(p, input.measured[p.id] ?? null, input.thresholds)
  );

  const obstacleViolations: string[] = [];
  for (const p of input.plannedModules) {
    const m = input.measured[p.id];
    if (!m) continue;
    const v = moduleObstacleViolation(p, m, input.thresholds);
    if (v) obstacleViolations.push(v);
  }

  const plannedTotalWidthMm = input.plannedModules.reduce((s, p) => s + p.widthMm, 0);
  const actualTotalWidthMm = input.plannedModules.reduce(
    (s, p) => s + (input.measured[p.id]?.widthMm ?? 0),
    0
  );
  const baseOccupiedMm = input.plannedModules
    .filter((p) => p.layer === "base")
    .reduce((s, p) => s + (input.measured[p.id]?.widthMm ?? 0), 0);

  const remainingGapMm = Math.round(
    (input.runLengthMm - baseOccupiedMm - input.baseReservedMm) * 10
  ) / 10;
  const gap = gapStatus(remainingGapMm, input.thresholds);

  let status: VerifyStatus = "PASS";
  for (const m of modules) status = worst(status, m.status);
  if (obstacleViolations.length > 0) status = "ERROR";
  status = worst(status, gap);

  const diagnostics: string[] = [...obstacleViolations];
  for (const m of modules) diagnostics.push(...m.diagnostics);

  return {
    runId: input.runId,
    status,
    modules,
    plannedCount: input.plannedModules.length,
    measuredCount: input.plannedModules.filter((p) => input.measured[p.id]).length,
    plannedTotalWidthMm,
    actualTotalWidthMm,
    runLengthMm: Math.round(input.runLengthMm),
    baseOccupiedMm: Math.round(baseOccupiedMm),
    baseReservedMm: Math.round(input.baseReservedMm),
    remainingGapMm,
    gapStatus: gap,
    obstacleViolations,
    diagnostics,
  };
}

export function aggregateAll(
  runs: RunVerifyResult[],
  placedItems: PlacedItemVerifyResult[],
  overlapViolations: string[],
  timestamp = Date.now(),
  endPanels: EndPanelVerifyResult[] = []
): VerificationResult {
  let overall: VerifyStatus = "PASS";
  let moduleCount = 0;
  let passed = 0;
  let warnings = 0;
  let errors = 0;
  let placedCount = 0;
  let placedPassed = 0;
  let placedWarnings = 0;
  let placedErrors = 0;
  let endPanelCount = 0;
  let endPanelPassed = 0;
  let endPanelWarnings = 0;
  let endPanelErrors = 0;
  const issues: string[] = [];

  for (const run of runs) {
    overall = worst(overall, run.status);
    moduleCount += run.plannedCount;
    for (const m of run.modules) {
      if (m.status === "PASS") passed += 1;
      else if (m.status === "WARNING") warnings += 1;
      else errors += 1;
    }
    issues.push(...run.diagnostics);
  }

  for (const p of placedItems) {
    overall = worst(overall, p.status);
    placedCount += 1;
    if (p.status === "PASS") placedPassed += 1;
    else if (p.status === "WARNING") placedWarnings += 1;
    else placedErrors += 1;
    issues.push(...p.diagnostics);
  }

  for (const e of endPanels) {
    overall = worst(overall, e.status);
    endPanelCount += 1;
    if (e.status === "PASS") endPanelPassed += 1;
    else if (e.status === "WARNING") endPanelWarnings += 1;
    else endPanelErrors += 1;
    issues.push(...e.diagnostics);
  }

  if (overlapViolations.length > 0) {
    overall = "ERROR";
    issues.push(...overlapViolations);
  }

  return {
    overall,
    runs,
    moduleCount,
    passed,
    warnings,
    errors,
    placedItems,
    placedCount,
    placedPassed,
    placedWarnings,
    placedErrors,
    endPanels,
    endPanelCount,
    endPanelPassed,
    endPanelWarnings,
    endPanelErrors,
    overlapViolations,
    issues,
    timestamp,
  };
}
