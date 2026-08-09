"use client";

import { useMemo } from "react";
import type { Vec2 } from "@/lib/geometry";
import {
  BASE_DEPTH,
  CORNER_MODULE_SIZE,
  COUNTER_OVERHANG,
  COUNTER_DEPTH,
  COUNTER_ISLAND_DEPTH,
  FILLER_MIN_WIDTH,
  STD_CABINET_WIDTH,
  WALL_CABINET_DEPTH,
  WALL_CABINET_HEIGHT,
  WALL_CABINET_ELEVATION,
  UPPER_CORNER_MODULE_SIZE,
} from "@/lib/kitchen";
import { useDesigner } from "@/store/useStore";
import { BaseCabinet3D } from "./BaseCabinet3D";
import { CountertopOutline } from "./Countertop3D";
import { WallCabinet3D, UpperCornerCabinet3D } from "./WallCabinet3D";

export type BaseModuleKind = "double-door" | "drawer" | "l-corner" | "filler";
export type WallModuleKind = "solid" | "glass";

export interface BaseModulePlacement {
  kind: BaseModuleKind;
  x: number;
  z: number;
  rotationY: number;
  width: number;
  depth: number;
}

export interface WallModulePlacement {
  x: number;
  z: number;
  rotationY: number;
  width: number;
  variant: WallModuleKind;
}

export interface WallCornerPlacement {
  x: number;
  z: number;
  rotationY: number;
  size: number;
}

export interface CounterPlacement {
  x: number;
  z: number;
  rotationY: number;
  width: number;
  depth: number;
  /** Corner tile sits 0.001 below the segment slabs to avoid z-fighting. */
  isCornerTile?: boolean;
}

export interface RunLayout {
  base: BaseModulePlacement[];
  wall: WallModulePlacement[];
  wallCorners: WallCornerPlacement[];
  counters: CounterPlacement[];
  /** Single continuous countertop outline polygon (world XZ, CCW). */
  counterOutline: Vec2[];
}

/** Minimum turn angle (radians) above which an interior corner is detected. */
const CORNER_TURN_ANGLE = 0.5; // ~29°

/**
 * Full parametric plan for a cabinet run polyline:
 *
 *  - Interior L-corners (left turns) get a dedicated 0.9 x 0.9 blind corner
 *    module placed flush into the wall junction.
 *  - Regular 0.8 m base cabinets snap outward from each corner module along
 *    every wall run (the 0.9 m corner footprint is trimmed off each segment).
 *  - The cabinet adjacent to a corner renders as a 3-drawer unit; the rest are
 *    flush 2-door units; leftover gaps become filler pieces.
 *  - Countertop slabs span each full segment plus a 0.94 m corner tile over
 *    every corner module, so the whole lower run is sealed with no gaps.
 */
export function planRunLayout(points: Vec2[], isIsland: boolean): RunLayout {
  const plan: RunLayout = {
    base: [],
    wall: [],
    wallCorners: [],
    counters: [],
    counterOutline: [],
  };
  const n = points.length;
  if (n < 2) return plan;

  const segCount = n - 1;
  const startTrim = new Array<boolean>(segCount).fill(false);
  const endTrim = new Array<boolean>(segCount).fill(false);
  const cornerAt = new Array<boolean>(n).fill(false);

  // 1) Detect interior corners and place the L-corner modules + tiles.
  for (let i = 1; i < n - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const d1x = b.x - a.x;
    const d1z = b.z - a.z;
    const d2x = c.x - b.x;
    const d2z = c.z - b.z;
    const l1 = Math.hypot(d1x, d1z);
    const l2 = Math.hypot(d2x, d2z);
    if (l1 < 1e-6 || l2 < 1e-6) continue;

    const u1 = { x: d1x / l1, z: d1z / l1 };
    const u2 = { x: d2x / l2, z: d2z / l2 };
    const cross = u1.x * u2.z - u1.z * u2.x;
    const dot = u1.x * u2.x + u1.z * u2.z;
    if (cross <= 0 || Math.atan2(cross, dot) < CORNER_TURN_ANGLE) continue;
    cornerAt[i] = true;

    // Inward-facing unit normals of the two walls (room is left of travel).
    const n1 = { x: -u1.z, z: u1.x };
    const n2 = { x: -u2.z, z: u2.x };
    // Room-side wall directions leaving the exact corner vertex.
    const t1 = { x: -u1.x, z: -u1.z };
    const t2 = { x: u2.x, z: u2.z };
    // Rotation that keeps the chamfered shape's back faces flush with the walls.
    const rotY = Math.atan2(-t1.z, t1.x);

    const S = CORNER_MODULE_SIZE;
    plan.base.push({
      kind: "l-corner",
      // Center = P_corner + (SIZE/2)·n1 + (SIZE/2)·n2 → back corner at P_corner.
      x: b.x + (S / 2) * n1.x + (S / 2) * n2.x,
      z: b.z + (S / 2) * n1.z + (S / 2) * n2.z,
      rotationY: rotY,
      width: S,
      depth: S,
    });

    // Upper L-corner unit sitting directly over the base corner module,
    // hugging the wall junction with its 0.65 m footprint.
    const US = UPPER_CORNER_MODULE_SIZE;
    plan.wallCorners.push({
      x: b.x + (US / 2) * n1.x + (US / 2) * n2.x,
      z: b.z + (US / 2) * n1.z + (US / 2) * n2.z,
      rotationY: rotY,
      size: US,
    });

    const TS = S + COUNTER_OVERHANG;
    plan.counters.push({
      x: b.x + (TS / 2) * n1.x + (TS / 2) * n2.x,
      z: b.z + (TS / 2) * n1.z + (TS / 2) * n2.z,
      rotationY: rotY,
      width: TS,
      depth: TS,
      isCornerTile: true,
    });

    endTrim[i - 1] = true;
    startTrim[i] = true;
  }

  const counterDepth = isIsland ? COUNTER_ISLAND_DEPTH : COUNTER_DEPTH;

  // 2) Subdivide every segment into cabinets, counters and wall units.
  for (let j = 0; j < segCount; j++) {
    const a = points[j];
    const b = points[j + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;

    const d = { x: dx / L, z: dz / L };
    const nrm = { x: -dz / L, z: dx / L };
    const rotY = Math.atan2(-dz, dx);

    // Full-length countertop slab (extends over the corner modules).
    plan.counters.push({
      x: a.x + (d.x * L) / 2 + (nrm.x * counterDepth) / 2,
      z: a.z + (d.z * L) / 2 + (nrm.z * counterDepth) / 2,
      rotationY: rotY,
      width: L,
      depth: counterDepth,
    });

    // Base cabinets, trimmed away from each corner module.
    const st = startTrim[j] ? CORNER_MODULE_SIZE : 0;
    const et = endTrim[j] ? CORNER_MODULE_SIZE : 0;
    const avail = L - st - et;
    if (avail >= 0.02) {
      const count = Math.max(Math.floor((avail + 1e-6) / STD_CABINET_WIDTH), 0);
      let t = st;
      for (let k = 0; k < count; k++) {
        const kind: BaseModuleKind =
          (k === 0 && st > 0) || (k === count - 1 && et > 0)
            ? "drawer"
            : "double-door";
        plan.base.push({
          kind,
          x: a.x + d.x * (t + STD_CABINET_WIDTH / 2) + nrm.x * (BASE_DEPTH / 2),
          z: a.z + d.z * (t + STD_CABINET_WIDTH / 2) + nrm.z * (BASE_DEPTH / 2),
          rotationY: rotY,
          width: STD_CABINET_WIDTH,
          depth: BASE_DEPTH,
        });
        t += STD_CABINET_WIDTH;
      }
      const rem = L - et - t;
      if (rem >= FILLER_MIN_WIDTH) {
        plan.base.push({
          kind: "filler",
          x: a.x + d.x * (t + rem / 2) + nrm.x * (BASE_DEPTH / 2),
          z: a.z + d.z * (t + rem / 2) + nrm.z * (BASE_DEPTH / 2),
          rotationY: rotY,
          width: rem,
          depth: BASE_DEPTH,
        });
      }
      // Close the gap between the regular base cabinets and the L-corner
      // unit: the corner unit is 0.9m wide but only 0.6m deep, so a slim
      // filler panel (width = CORNER_MODULE_SIZE - BASE_DEPTH = 0.3m) bridges
      // the remaining space on each arm of the L where it borders a corner.
      const sideGap = CORNER_MODULE_SIZE - BASE_DEPTH; // 0.3 m
      if (startTrim[j] && sideGap >= FILLER_MIN_WIDTH) {
        const ft = BASE_DEPTH; // position along segment (after the corner-depth gap)
        plan.base.push({
          kind: "filler",
          x: a.x + d.x * (ft + sideGap / 2) + nrm.x * (BASE_DEPTH / 2),
          z: a.z + d.z * (ft + sideGap / 2) + nrm.z * (BASE_DEPTH / 2),
          rotationY: rotY,
          width: sideGap,
          depth: BASE_DEPTH,
        });
      }
      if (endTrim[j] && sideGap >= FILLER_MIN_WIDTH) {
        const ft = L - CORNER_MODULE_SIZE; // start of the gap along the segment
        plan.base.push({
          kind: "filler",
          x: a.x + d.x * (ft + sideGap / 2) + nrm.x * (BASE_DEPTH / 2),
          z: a.z + d.z * (ft + sideGap / 2) + nrm.z * (BASE_DEPTH / 2),
          rotationY: rotY,
          width: sideGap,
          depth: BASE_DEPTH,
        });
      }
    }

    // Wall cabinets trim the same 0.9 m as the base corner module so they
    // sit flush with the edge of the L-corner base unit. A separate filler
    // panel (0.25 m wide, full wall-cab height) then bridges the gap between
    // the wall run end and the upper corner unit on each side.
    const stW = startTrim[j] ? CORNER_MODULE_SIZE : 0;
    const etW = endTrim[j] ? CORNER_MODULE_SIZE : 0;
    const availW = L - stW - etW;
    if (!isIsland && availW >= 0.02) {
      const count = Math.max(Math.floor((availW + 1e-6) / STD_CABINET_WIDTH), 0);
      let t = stW;
      for (let k = 0; k < count; k++) {
        plan.wall.push({
          x: a.x + d.x * (t + STD_CABINET_WIDTH / 2) + nrm.x * (WALL_CABINET_DEPTH / 2),
          z: a.z + d.z * (t + STD_CABINET_WIDTH / 2) + nrm.z * (WALL_CABINET_DEPTH / 2),
          rotationY: rotY,
          width: STD_CABINET_WIDTH,
          variant: k % 2 === 1 ? "glass" : "solid",
        });
        t += STD_CABINET_WIDTH;
      }
      const rem = L - etW - t;
      if (rem >= FILLER_MIN_WIDTH) {
        plan.wall.push({
          x: a.x + d.x * (t + rem / 2) + nrm.x * (WALL_CABINET_DEPTH / 2),
          z: a.z + d.z * (t + rem / 2) + nrm.z * (WALL_CABINET_DEPTH / 2),
          rotationY: rotY,
          width: rem,
          variant: "solid",
        });
      }
      // Filler panels beside the upper corner unit (fills the gap between the
      // 0.9 m base trim and the 0.65 m upper-corner unit on each side).
      const gapW = CORNER_MODULE_SIZE - UPPER_CORNER_MODULE_SIZE; // = 0.25 m
      if (startTrim[j] && gapW >= FILLER_MIN_WIDTH) {
        // Gap is at the START of this segment: the filler sits just before
        // the wall cabinets start (between t=0 and t=stW).
        const fw = gapW;
        const ft = UPPER_CORNER_MODULE_SIZE; // start of the filler along the segment
        plan.wall.push({
          x: a.x + d.x * (ft + fw / 2) + nrm.x * (WALL_CABINET_DEPTH / 2),
          z: a.z + d.z * (ft + fw / 2) + nrm.z * (WALL_CABINET_DEPTH / 2),
          rotationY: rotY,
          width: fw,
          variant: "solid",
        });
      }
      if (endTrim[j] && gapW >= FILLER_MIN_WIDTH) {
        // Gap is at the END of this segment: the filler sits after the last
        // regular wall cabinet (between L-etW and L-UPPER_CORNER_MODULE_SIZE).
        const fw = gapW;
        const ft = L - CORNER_MODULE_SIZE; // position along segment of gap start
        plan.wall.push({
          x: a.x + d.x * (ft + fw / 2) + nrm.x * (WALL_CABINET_DEPTH / 2),
          z: a.z + d.z * (ft + fw / 2) + nrm.z * (WALL_CABINET_DEPTH / 2),
          rotationY: rotY,
          width: fw,
          variant: "solid",
        });
      }
    }
  }

  plan.counterOutline = buildCounterOutline(points, cornerAt, counterDepth);

  return plan;
}

/* -------------------------------------------------------------------------- */
/* Countertop footprint outline — one continuous L-shaped polygon per run      */
/* -------------------------------------------------------------------------- */

const dirUnit = (a: Vec2, b: Vec2): Vec2 => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  return { x: dx / L, z: dz / L };
};

/** Left (counter-clockwise) perpendicular of a 2D direction. */
const leftPerp = (d: Vec2): Vec2 => ({ x: -d.z, z: d.x });

/** Drops consecutive duplicates and collinear points from a closed outline. */
function simplifyPolygon(pts: Vec2[]): Vec2[] {
  const ring: Vec2[] = [];
  for (const p of pts) {
    const last = ring[ring.length - 1];
    if (last && Math.abs(p.x - last.x) < 1e-9 && Math.abs(p.z - last.z) < 1e-9) continue;
    ring.push(p);
  }
  while (
    ring.length > 1 &&
    Math.abs(ring[0].x - ring[ring.length - 1].x) < 1e-9 &&
    Math.abs(ring[0].z - ring[ring.length - 1].z) < 1e-9
  ) {
    ring.pop();
  }
  if (ring.length < 3) return ring;
  const out: Vec2[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i - 1 + ring.length) % ring.length];
    const b = ring[i];
    const c = ring[(i + 1) % ring.length];
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) > 1e-6) out.push(b);
  }
  return out;
}

/**
 * Builds the FULL countertop footprint for a run as one closed polygon
 * (world XZ, CCW). The rear boundary follows the run polyline (flush with the
 * walls); the front boundary is traced from run end to run start, flaring out
 * a CORNER_MODULE_SIZE + overhang square at every interior corner so the
 * corner module is covered by the SAME continuous slab — no separate tiles.
 */
function buildCounterOutline(
  points: Vec2[],
  cornerAt: boolean[],
  counterDepth: number
): Vec2[] {
  const n = points.length;
  if (n < 2) return [];
  const cd = counterDepth;
  const CS = CORNER_MODULE_SIZE + COUNTER_OVERHANG;

  const outline: Vec2[] = [];
  for (const p of points) outline.push(p); // rear (wall side)

  const front: Vec2[] = [];
  const last = points[n - 1];
  const nL = leftPerp(dirUnit(points[n - 2], last));
  front.push({ x: last.x + nL.x * cd, z: last.z + nL.z * cd });

  for (let j = n - 1; j > 0; j--) {
    const B = points[j];
    if (cornerAt[j] && j < n - 1) {
      const t1 = dirUnit(B, points[j - 1]); // along wall 1, away from corner
      const t2 = dirUnit(B, points[j + 1]); // along wall 2, away from corner
      front.push({ x: B.x + cd * t1.x + CS * t2.x, z: B.z + cd * t1.z + CS * t2.z });
      front.push({ x: B.x + CS * t1.x + CS * t2.x, z: B.z + CS * t1.z + CS * t2.z });
      front.push({ x: B.x + CS * t1.x + cd * t2.x, z: B.z + CS * t1.z + cd * t2.z });
    }
  }

  const first = points[0];
  const n0 = leftPerp(dirUnit(first, points[1]));
  front.push({ x: first.x + n0.x * cd, z: first.z + n0.z * cd });
  outline.push(...front);
  outline.push({ x: first.x, z: first.z });

  return simplifyPolygon(outline);
}

/* -------------------------------------------------------------------------- */
/* Renderer — base modules + countertop for one committed run                  */
/* -------------------------------------------------------------------------- */

export function BaseCabinetRun({
  points,
  isIsland,
  baseHeight,
  customMaterialId,
  showCounter = true,
  counterTopY,
}: {
  points: Vec2[];
  isIsland: boolean;
  baseHeight: number;
  customMaterialId?: string;
  showCounter?: boolean;
  counterTopY?: number;
}) {
  const layout = useMemo(() => planRunLayout(points, isIsland), [points, isIsland]);

  return (
    <group>
      {layout.base.map((m, i) => (
        <BaseCabinet3D
          key={`b-${i}`}
          position={[m.x, 0, m.z]}
          rotationY={m.rotationY}
          width={m.width}
          depth={m.depth}
          variant={m.kind}
          height={baseHeight}
          customMaterialId={customMaterialId}
        />
      ))}
      {showCounter && layout.counterOutline.length >= 3 && (
        <CountertopOutline
          points={layout.counterOutline}
          topY={counterTopY ?? baseHeight}
        />
      )}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Renderer — modern upper wall cabinets + upper corner units                  */
/* -------------------------------------------------------------------------- */

/**
 * Renders the synced upper wall run: modern solid / glass modules aligned
 * 1:1 over the base cabinets, the 0.65 m upper L-corner unit over each base
 * corner, and optional soffit panels bridging every unit to the ceiling.
 */
export function WallCabinetRun({
  points,
  isIsland,
  wallHeight = WALL_CABINET_HEIGHT,
  wallElevation = WALL_CABINET_ELEVATION,
  customMaterialId,
  soffit = false,
}: {
  points: Vec2[];
  isIsland: boolean;
  wallHeight?: number;
  wallElevation?: number;
  customMaterialId?: string;
  soffit?: boolean;
}) {
  const layout = useMemo(() => planRunLayout(points, isIsland), [points, isIsland]);
  const ceilingHeight = useDesigner((s) => s.ceilingHeight);

  const soffitHeight = soffit
    ? Math.max(ceilingHeight - (wallElevation + wallHeight), 0)
    : 0;

  return (
    <group>
      {layout.wall.map((p, i) => (
        <WallCabinet3D
          key={`w-${i}`}
          position={[p.x, wallElevation, p.z]}
          rotationY={p.rotationY}
          width={p.width}
          height={wallHeight}
          variant={p.variant}
          customMaterialId={customMaterialId}
          soffit={soffitHeight}
        />
      ))}
      {layout.wallCorners.map((c, i) => (
        <UpperCornerCabinet3D
          key={`wc-${i}`}
          position={[c.x, wallElevation, c.z]}
          rotationY={c.rotationY}
          size={c.size}
          height={wallHeight}
          customMaterialId={customMaterialId}
          soffit={soffitHeight}
        />
      ))}
    </group>
  );
}
