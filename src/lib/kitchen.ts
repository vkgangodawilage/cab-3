import type { Vec2 } from "./geometry.ts";
import { distToSegment, segmentsOf } from "./geometry.ts";
import type { Wall } from "@/store/useStore";

export interface Placement {
  x: number;
  z: number;
  rotationY: number;
  width: number;
}

export interface SegmentPlan {
  base: Placement[];
  fillers: Placement[];
  wall: Placement[];
  counter: Placement | null;
}

export const STD_CABINET_WIDTH = 0.8;
export const BASE_DEPTH = 0.6;
/** Total base-cabinet height: 0.86 m = 0.1 m toe kick + 0.76 m cabinet box. */
export const BASE_HEIGHT = 0.86;
/** Solid plinth / toe kick strip under every base cabinet. */
export const TOE_KICK_HEIGHT = 0.1;
/** Toe kick is recessed this far behind the cabinet front face. */
export const TOE_KICK_INSET = 0.05;
/** Enclosed cabinet box height (above the toe kick). */
export const CABINET_BOX_HEIGHT = 0.76;
/** Dedicated L-corner blind base module footprint (0.9 m x 0.9 m). */
export const CORNER_MODULE_SIZE = 0.9;
/** Countertop front overhang past the cabinet front doors. */
export const COUNTER_OVERHANG = 0.02;
/** Countertop depth = cabinet depth + front overhang (back stays flush). */
export const COUNTER_DEPTH = BASE_DEPTH + COUNTER_OVERHANG;
export const COUNTER_ISLAND_DEPTH = COUNTER_DEPTH + 0.15;
export const COUNTER_THICKNESS = 0.04;
export const WALL_CABINET_DEPTH = 0.35;
/** Wall-cabinet box height (bottom at WALL_CABINET_ELEVATION = 1.5 m). */
export const WALL_CABINET_HEIGHT = 0.8;
/** Bottom of wall cabinets — 0.6 m backsplash clearance over the 0.9 m countertop. */
export const WALL_CABINET_ELEVATION = 1.5;
/** Dedicated upper L-corner blind unit footprint (0.65 m x 0.65 m). */
export const UPPER_CORNER_MODULE_SIZE = 0.65;
export const FILLER_MIN_WIDTH = 0.05;

/** Finished end-panel thickness (18 mm), matching the reference PANEL_THK_MM. */
export const END_PANEL_THICKNESS = 0.018;

/**
 * Plans all cabinet layers (base, wall, filler) plus the countertop slab for a
 * single baseline segment.
 *
 * The segment is sub-divided into standard 0.8m units; the leftover gap
 * (smaller than 0.8m) becomes a dynamic filler piece. Cabinets are offset
 * toward the left side of the drawing direction (normal n = (-dz, dx)).
 */
export function planSegment(a: Vec2, b: Vec2, isIsland: boolean): SegmentPlan {
  const plan: SegmentPlan = { base: [], fillers: [], wall: [], counter: null };

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return plan;

  const d = { x: dx / len, z: dz / len };
  const n = { x: -dz / len, z: dx / len };
  const rotY = Math.atan2(-dz, dx);

  const counterDepth = isIsland ? COUNTER_ISLAND_DEPTH : COUNTER_DEPTH;
  plan.counter = {
    x: a.x + (d.x * len) / 2 + (n.x * counterDepth) / 2,
    z: a.z + (d.z * len) / 2 + (n.z * counterDepth) / 2,
    rotationY: rotY,
    width: len,
  };

  const subdivide = (
    depth: number,
    target: Placement[],
    fillers?: Placement[]
  ) => {
    let t = 0;
    while (len - t >= 1e-4) {
      const remaining = len - t;
      if (remaining >= STD_CABINET_WIDTH - 1e-4) {
        const w = STD_CABINET_WIDTH;
        const cx = a.x + d.x * (t + w / 2) + n.x * (depth / 2);
        const cz = a.z + d.z * (t + w / 2) + n.z * (depth / 2);
        target.push({ x: cx, z: cz, rotationY: rotY, width: w });
        t += w;
      } else if (remaining >= FILLER_MIN_WIDTH) {
        const w = remaining;
        const cx = a.x + d.x * (t + w / 2) + n.x * (depth / 2);
        const cz = a.z + d.z * (t + w / 2) + n.z * (depth / 2);
        const placement = { x: cx, z: cz, rotationY: rotY, width: w };
        if (fillers) fillers.push(placement);
        else target.push(placement);
        t = len;
      } else {
        break;
      }
    }
  };

  subdivide(BASE_DEPTH, plan.base, plan.fillers);
  if (!isIsland) {
    subdivide(WALL_CABINET_DEPTH, plan.wall);
  }
  return plan;
}

export function planRun(points: Vec2[], isIsland: boolean): SegmentPlan[] {
  const plans: SegmentPlan[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    plans.push(planSegment(points[i], points[i + 1], isIsland));
  }
  return plans;
}

const WALL_PROXIMITY = 0.35;

/**
 * A cabinet run that does not come within `WALL_PROXIMITY` of any wall segment
 * is treated as a standalone island (no upper wall cabinets, deeper countertop).
 */
export function touchesAnyWall(
  run: { points: Vec2[]; closed: boolean },
  walls: Wall[]
): boolean {
  const segs = segmentsOf(run.points, run.closed);
  for (const [a, b] of segs) {
    for (const w of walls) {
      for (const [c, d] of segmentsOf(w.points, w.closed)) {
        if (distToSegment(a, c, d) < WALL_PROXIMITY) return true;
        if (distToSegment(b, c, d) < WALL_PROXIMITY) return true;
      }
    }
  }
  return false;
}
