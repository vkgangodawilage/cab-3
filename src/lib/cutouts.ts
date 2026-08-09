/**
 * Wall cutout (door / window) geometry helpers.
 *
 * A cutout is defined by its distance along the wall centerline
 * (`positionOnWall`, 0..L), its width / height, and its sill height
 * (bottom offset). The CSG subtraction box is a hair larger than the opening
 * so the boolean carve is always clean through the wall thickness.
 */

import type { Vec2 } from "./geometry";
import { ROOM_HEIGHT, WALL_THICKNESS } from "@/constants/dimensions";

export { ROOM_HEIGHT as WALL_HEIGHT, WALL_THICKNESS } from "@/constants/dimensions";
/** Extra depth so the carve passes fully through the wall slab. */
export const CUTOUT_OVERDEPTH = 0.1;
export const CUTOUT_OVERLAP = 0.01;

export interface WallSegment2D {
  a: Vec2;
  b: Vec2;
}

/** Signed projection of `point` onto the wall centerline (not clamped). */
export function positionAlongWall(seg: WallSegment2D, point: Vec2): number {
  const dx = seg.b.x - seg.a.x;
  const dz = seg.b.z - seg.a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return 0;
  const d = { x: dx / len, z: dz / len };
  return d.x * (point.x - seg.a.x) + d.z * (point.z - seg.a.z);
}

/**
 * Boundary check: clamps the opening center so the whole opening stays within
 * the wall's length. Degenerate short walls center the opening.
 */
export function clampOpeningCenter(len: number, width: number, rawT: number): number {
  if (len > width + 1e-4) {
    return Math.min(Math.max(rawT, width / 2), len - width / 2);
  }
  return len / 2;
}

export interface CutoutBoxDims {
  /** Subtraction box [x, y, z] size in wall-local space. */
  subtraction: [number, number, number];
  /** Local position of the cutout center in wall-local space. */
  position: [number, number, number];
}

/**
 * Wall-local geometry for a cutout: the wall group is centered on the segment
 * midpoint with local Z along the wall length, X along the thickness.
 */
export function cutoutLocalBox(
  wallLen: number,
  cutout: { width: number; height: number; sillHeight: number; positionOnWall: number }
): CutoutBoxDims {
  const thickness = WALL_THICKNESS + CUTOUT_OVERDEPTH;
  const height = cutout.height + CUTOUT_OVERLAP * 2;
  const width = cutout.width + CUTOUT_OVERLAP * 2;
  return {
    subtraction: [thickness, height, width],
    position: [0, cutout.sillHeight + cutout.height / 2, cutout.positionOnWall - wallLen / 2],
  };
}
