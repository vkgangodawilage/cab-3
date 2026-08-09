"use client";

import { useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import { useDesigner } from "@/store/useStore";
import type { Wall } from "@/store/useStore";
import { segmentsOf, dist, formatFeet } from "@/lib/geometry";
import type { Vec2 } from "@/lib/geometry";
import { WALL_THICKNESS } from "./WallMesh";

const Y = 2.9; // above wall fills (2.88) and wall tops (2.8)
/** Exterior offset = half the wall thickness + clear padding off the face. */
const DIMENSION_PADDING = 0.25;
const DIM_OFFSET = WALL_THICKNESS / 2 + DIMENSION_PADDING;
const DIM_TICK_OVERHANG = 0.05; // extension ticks poke slightly past the line
const ARROW = 0.13;
const DIM_COLOR = "#0f172a";
const DIM_WIDTH = 1.5;
const EXT_WIDTH = 1;

/** Signed area of a loop in the XZ plane (positive = CCW). */
function signedArea(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.z - b.x * a.z;
  }
  return s / 2;
}

/**
 * Interior reference point of a wall outline. Closed loops use the
 * area-weighted centroid; open polylines fall back to the vertex average.
 * Used to decide which side of each wall is the exterior.
 */
function computeCentroid(pts: Vec2[], closed: boolean): Vec2 {
  if (closed && pts.length >= 3) {
    const area = signedArea(pts);
    if (Math.abs(area) > 1e-6) {
      let cx = 0;
      let cz = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const w = a.x * b.z - b.x * a.z;
        cx += (a.x + b.x) * w;
        cz += (a.z + b.z) * w;
      }
      return { x: cx / (6 * area), z: cz / (6 * area) };
    }
  }
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x;
    cz += p.z;
  }
  return { x: cx / pts.length, z: cz / pts.length };
}

/** Unit perpendicular pair (left/right) of a direction vector in the XZ plane. */
function perpOf(d: [number, number]): { perp: [number, number]; mPerp: [number, number] } {
  return { perp: [-d[1], d[0]], mPerp: [d[1], -d[0]] };
}

/**
 * Crisp CAD dimension lines. Every wall segment gets a continuous dimension
 * vector (Drei <Line>, screen-space width) on the exterior side of the plan,
 * with offset extension ticks, arrow end-caps on both ends and a bold,
 * white-backed centered label (e.g. `21'`) that stays 100% legible over the
 * grid.
 */
export function CADDimensionLines() {
  const mode = useDesigner((s) => s.cameraMode);
  const walls = useDesigner((s) => s.walls);

  if (mode !== "2d") return null;

  return (
    <group>
      {walls.map((wall) => (
        <WallDims key={wall.id} wall={wall} />
      ))}
    </group>
  );
}

function WallDims({ wall }: { wall: Wall }) {
  const closed = wall.closed && wall.points.length >= 3;
  const centroid = useMemo(
    () => computeCentroid(wall.points, closed),
    [wall.points, closed]
  );
  const area = useMemo(
    () => (closed ? signedArea(wall.points) : 0),
    [wall.points, closed]
  );
  const segs = segmentsOf(wall.points, wall.closed);

  return (
    <group>
      {segs.map(([a, b], i) => (
        <SegmentDim key={i} a={a} b={b} closed={closed} area={area} centroid={centroid} />
      ))}
    </group>
  );
}

function SegmentDim({
  a,
  b,
  closed,
  area,
  centroid,
}: {
  a: Vec2;
  b: Vec2;
  closed: boolean;
  area: number;
  centroid: Vec2;
}) {
  const len = dist(a, b);
  if (len < 1e-4) return null;

  const d: [number, number] = [(b.x - a.x) / len, (b.z - a.z) / len];
  const { perp, mPerp } = perpOf(d);

  // Exterior side: pick the normal pointing AWAY from the room centroid.
  const mx = (a.x + b.x) / 2 - centroid.x;
  const mz = (a.z + b.z) / 2 - centroid.z;
  const dot = perp[0] * mx + perp[1] * mz;
  let side: [number, number];
  if (Math.abs(dot) > 1e-6) {
    side = dot > 0 ? perp : mPerp;
  } else if (closed) {
    // Degenerate (centroid lies on the segment line) — fall back to winding:
    // CCW keeps interior on the left, so the exterior is the right normal.
    side = area > 0 ? mPerp : perp;
  } else {
    side = perp;
  }

  const ox = side[0] * DIM_OFFSET;
  const oz = side[1] * DIM_OFFSET;
  const p1: [number, number, number] = [a.x + ox, Y, a.z + oz];
  const p2: [number, number, number] = [b.x + ox, Y, b.z + oz];

  // Extension ticks from the OUTER wall face corners, past the dimension line.
  const hx = side[0] * (WALL_THICKNESS / 2);
  const hz = side[1] * (WALL_THICKNESS / 2);
  const tx = side[0] * (DIM_OFFSET + DIM_TICK_OVERHANG);
  const tz = side[1] * (DIM_OFFSET + DIM_TICK_OVERHANG);
  const t1: [number, number, number] = [a.x + hx, Y, a.z + hz];
  const t1e: [number, number, number] = [a.x + tx, Y, a.z + tz];
  const t2: [number, number, number] = [b.x + hx, Y, b.z + hz];
  const t2e: [number, number, number] = [b.x + tx, Y, b.z + tz];
  const mid: [number, number, number] = [
    (a.x + b.x) / 2 + ox,
    Y,
    (a.z + b.z) / 2 + oz,
  ];

  return (
    <group>
      {/* dimension line */}
      <Line points={[p1, p2]} color={DIM_COLOR} lineWidth={DIM_WIDTH} raycast={() => null} />
      {/* extension ticks from the outer face to past the dimension line */}
      <Line points={[t1, t1e]} color={DIM_COLOR} lineWidth={EXT_WIDTH} raycast={() => null} />
      <Line points={[t2, t2e]} color={DIM_COLOR} lineWidth={EXT_WIDTH} raycast={() => null} />
      {/* arrows */}
      <ArrowTip at={p1} dir={[-d[0], -d[1]]} />
      <ArrowTip at={p2} dir={[d[0], d[1]]} />
      {/* bold white-backed label */}
      <Html position={mid} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
        <div className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-slate-900 shadow-sm">
          {formatFeet(len)}
        </div>
      </Html>
    </group>
  );
}

function ArrowTip({ at, dir }: { at: [number, number, number]; dir: [number, number] }) {
  const px = -dir[1];
  const pz = dir[0];
  const a: [number, number, number] = [
    at[0] - dir[0] * ARROW + px * ARROW * 0.5,
    Y,
    at[2] - dir[1] * ARROW + pz * ARROW * 0.5,
  ];
  const bb: [number, number, number] = [
    at[0] - dir[0] * ARROW - px * ARROW * 0.5,
    Y,
    at[2] - dir[1] * ARROW - pz * ARROW * 0.5,
  ];
  return (
    <group>
      <Line points={[at, a]} color={DIM_COLOR} lineWidth={DIM_WIDTH} raycast={() => null} />
      <Line points={[at, bb]} color={DIM_COLOR} lineWidth={DIM_WIDTH} raycast={() => null} />
    </group>
  );
}
