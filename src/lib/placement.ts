/**
 * Wall-anchored placement geometry.
 *
 * Wall segments are identified as `<wallId>#<segmentIndex>`. An anchored item
 * is positioned so its back face sits flush against the wall plane
 * (offset by `wallThickness / 2 + item.depth / 2` along the outward normal)
 * and is oriented to face OUT of the wall (item local +Z = wall normal).
 * The item slides along the wall's length axis (local X baseline) by
 * projecting the cursor onto the wall line.
 */

import type { Vec2 } from "./geometry";
import type { Wall } from "@/store/useStore";
import type { CatalogItem } from "./catalog";
import { WALL_THICKNESS } from "@/constants/dimensions";
import { WALL_CABINET_ELEVATION } from "./kitchen";

export { WALL_THICKNESS } from "@/constants/dimensions";
export { WALL_CABINET_ELEVATION } from "./kitchen";

/** Cursor must be this far from the wall line before the item flips side. */
const SIDE_HYSTERESIS = 0.35;

export interface WallSegment2D {
  a: Vec2;
  b: Vec2;
}

export interface WallAnchoredResult {
  position: [number, number, number];
  rotationY: number;
  /** Slide parameter along the wall (0..len). */
  t: number;
  /** Current anchor side (-1 | 1) — the outward normal is side * perp(d). */
  side: number;
  normal: { x: number; z: number };
}

export function segmentId(wallId: string, index: number): string {
  return `${wallId}#${index}`;
}

export function parseSegmentId(id: string): { wallId: string; index: number } | null {
  const m = /^(.*)#(\d+)$/.exec(id);
  if (!m) return null;
  return { wallId: m[1], index: parseInt(m[2], 10) };
}

/** Resolves a segment id to its two floor points (handles closed loops). */
export function getWallSegment(
  walls: Wall[],
  selectedWallId: string
): WallSegment2D | null {
  const parsed = parseSegmentId(selectedWallId);
  if (!parsed) return null;
  const wall = walls.find((w) => w.id === parsed.wallId);
  if (!wall) return null;
  const n = wall.points.length;
  const i = parsed.index;
  if (i < 0 || i >= n) return null;
  if (i === n - 1 && wall.closed && n > 2) {
    return { a: wall.points[n - 1], b: wall.points[0] };
  }
  if (i >= n - 1) return null;
  return { a: wall.points[i], b: wall.points[i + 1] };
}

/**
 * Computes the anchored placement of `item` on wall segment `seg` given the
 * cursor floor point. `side` is the previously remembered anchor side (-1|1);
 * it flips only when the cursor is clearly on the other side of the wall.
 */
export function computeWallAnchoredPlacement(
  seg: WallSegment2D,
  item: CatalogItem,
  cursor: Vec2,
  side: number
): WallAnchoredResult {
  const dx = seg.b.x - seg.a.x;
  const dz = seg.b.z - seg.a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) {
    return { position: [seg.a.x, 0, seg.a.z], rotationY: 0, t: 0, side, normal: { x: 0, z: 1 } };
  }

  const d = { x: dx / len, z: dz / len };

  // Side: cross(d, cursor - a) > 0 → cursor on the perp(d) side.
  const cross = d.x * (cursor.z - seg.a.z) - d.z * (cursor.x - seg.a.x);
  let s = side;
  if (Math.abs(cross) > SIDE_HYSTERESIS) s = Math.sign(cross);
  const n = { x: -s * d.z, z: s * d.x };

  // Slide the item along the wall length axis (kept within the segment).
  const proj = d.x * (cursor.x - seg.a.x) + d.z * (cursor.z - seg.a.z);
  const halfW = item.width / 2;
  let t = proj;
  if (len > item.width + 1e-4) {
    t = Math.min(Math.max(t, halfW), len - halfW);
  } else {
    t = len / 2;
  }

  // Back face flush against the wall plane.
  const backOffset = WALL_THICKNESS / 2 + item.depth / 2;
  const px = seg.a.x + d.x * t + n.x * backOffset;
  const pz = seg.a.z + d.z * t + n.z * backOffset;
  const py =
    item.elevation === "wall"
      ? WALL_CABINET_ELEVATION + item.height / 2
      : item.height / 2;

  // rotY maps item local +Z → outward normal n.
  const rotationY = Math.atan2(n.x, n.z);

  return { position: [px, py, pz], rotationY, t, side: s, normal: n };
}
