"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useDesigner } from "@/store/useStore";
import { WALL_THICKNESS } from "@/constants/dimensions";
import type { Vec2 } from "@/lib/geometry";

const CEILING_COLOR = "#f3f4f6";
const SLAB_THICKNESS = 0.2; // solid architectural slab, 0.2 m thick
/**
 * WALL_THICKNESS / 2 + 0.05 = 0.075 + 0.05 = 0.125 m outward expansion, so the
 * slab footprint covers the full 0.15 m wall thickness (centerline ± 0.075)
 * plus ~0.05 m safety beyond the outer face (no light leaks).
 */
const EXPANSION = WALL_THICKNESS / 2 + 0.05;

/** Andrew's monotone-chain convex hull over the XZ plane. */
function convexHull(points: Vec2[]): Vec2[] {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function signedArea(points: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.z - b.x * a.z;
  }
  return s / 2;
}

/**
 * Outward-expand a convex polygon by `distance`: offset each edge along its
 * outward normal and intersect adjacent offset edges. Always safe for a convex
 * hull (never self-intersects) — distinct from the removed inward-inset method.
 */
function expandPolygon(points: Vec2[], distance: number): Vec2[] {
  const n = points.length;
  if (n < 3 || distance <= 0) return points.slice();
  const area = signedArea(points);
  const sign = area >= 0 ? 1 : -1;

  const dirs: Vec2[] = [];
  const outNormals: Vec2[] = [];
  const offsetPts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const d = { x: dx / (len || 1e-9), z: dz / (len || 1e-9) };
    dirs.push(d);
    outNormals.push({ x: sign * d.z, z: -sign * d.x });
    offsetPts.push({
      x: a.x + outNormals[i].x * distance,
      z: a.z + outNormals[i].z * distance,
    });
  }

  const result: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = offsetPts[i];
    const d1 = dirs[i];
    const p2 = offsetPts[j];
    const d2 = dirs[j];
    const denom = d1.x * d2.z - d1.z * d2.x;
    let hit: Vec2;
    if (Math.abs(denom) < 1e-9) {
      hit = { x: (p1.x + p2.x) / 2, z: (p1.z + p2.z) / 2 };
    } else {
      const t = ((p2.x - p1.x) * d2.z - (p2.z - p1.z) * d2.x) / denom;
      hit = { x: p1.x + d1.x * t, z: p1.z + d1.z * t };
    }
    result.push(hit);
  }
  return result;
}

type Slab =
  | { type: "extrude"; geometry: THREE.ExtrudeGeometry }
  | {
      type: "box";
      width: number;
      depth: number;
      center: { x: number; z: number };
    };

/**
 * Solid 3D architectural ceiling slab.
 *
 *  - Valid boundary (3+ non-collinear points): convex hull of every wall
 *    vertex, expanded outward by 0.125 m, extruded 0.2 m thick.
 *  - Incomplete / collinear / 1–2 point layouts: bounding-box box slab.
 *
 * Slab bottom is locked to Y = ceilingHeight (wall tops) and the top is
 * ceilingHeight + 0.2 — a flush, gap-free connection to the 2.8 m walls.
 */
export function CeilingCap() {
  const mode = useDesigner((s) => s.cameraMode);
  const walls = useDesigner((s) => s.walls);
  const ceilingHeight = useDesigner((s) => s.ceilingHeight);

  const slab = useMemo<Slab | null>(() => {
    if (mode !== "3d") return null;

    const pts: Vec2[] = [];
    for (const w of walls) {
      for (const p of w.points) {
        if (Number.isFinite(p.x) && Number.isFinite(p.z)) pts.push(p);
      }
    }
    if (pts.length === 0) return null;

    const hull = convexHull(pts);
    if (hull.length >= 3) {
      const boundary = expandPolygon(hull, EXPANSION);
      if (boundary.length >= 3) {
        const shape = new THREE.Shape(
          boundary.map((p) => new THREE.Vector2(p.x, p.z))
        );
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: SLAB_THICKNESS,
          bevelEnabled: false,
        });
        // shape (x, z) -> world (x, 0, z) with no Z mirror; extrude goes -Y.
        geo.rotateX(Math.PI / 2);
        return { type: "extrude", geometry: geo };
      }
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    return {
      type: "box",
      width: maxX - minX + 0.3,
      depth: maxZ - minZ + 0.3,
      center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    };
  }, [mode, walls]);

  useEffect(
    () => () => {
      if (slab && slab.type === "extrude") slab.geometry.dispose();
    },
    [slab]
  );

  if (!slab) return null;

  if (slab.type === "extrude") {
    return (
      <mesh
        geometry={slab.geometry}
        position={[0, ceilingHeight + SLAB_THICKNESS, 0]}
        receiveShadow
        raycast={() => null}
      >
        <meshStandardMaterial
          color={CEILING_COLOR}
          roughness={0.9}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
    );
  }

  return (
    <mesh
      position={[slab.center.x, ceilingHeight + SLAB_THICKNESS / 2, slab.center.z]}
      receiveShadow
      raycast={() => null}
    >
      <boxGeometry args={[slab.width, SLAB_THICKNESS, slab.depth]} />
      <meshStandardMaterial
        color={CEILING_COLOR}
        roughness={0.9}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}
