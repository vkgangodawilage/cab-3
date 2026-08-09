export interface Vec2 {
  x: number;
  z: number;
}

export const GRID_SIZE = 0.25;
export const SNAP_DISTANCE = 0.2;
export const CLOSE_DISTANCE = 0.35;
export const ERASER_RADIUS = 0.35;

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function snapToGrid(p: Vec2): Vec2 {
  return {
    x: Math.round(p.x / GRID_SIZE) * GRID_SIZE,
    z: Math.round(p.z / GRID_SIZE) * GRID_SIZE,
  };
}

/**
 * CAD ortho snap: projects `b` onto the horizontal (x) or vertical (z) axis
 * through `a`, whichever is closer — producing exact 0°/180°/90°/270° walls.
 */
export function orthoSnap(a: Vec2, b: Vec2): Vec2 {
  if (Math.abs(b.x - a.x) >= Math.abs(b.z - a.z)) {
    return { x: b.x, z: a.z };
  }
  return { x: a.x, z: b.z };
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-9) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, z: a.z + t * dz });
}

export function segmentsOf(
  points: Vec2[],
  closed: boolean
): Array<[Vec2, Vec2]> {
  const segs: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push([points[i], points[i + 1]]);
  }
  if (closed && points.length > 2) {
    segs.push([points[points.length - 1], points[0]]);
  }
  return segs;
}

/* --------------------------- CAD formatting ----------------------------- */

const METERS_PER_FOOT = 0.3048;

export function metersToFeet(m: number): number {
  return m / METERS_PER_FOOT;
}

/** Formats a metre measure as whole-feet dimension text, e.g. `21'`. */
export function formatFeet(m: number): string {
  return `${Math.round(metersToFeet(m))}'`;
}
