"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useDesigner } from "@/store/useStore";
import { getThemeMaterials } from "./CabinetModel";
import { BASE_HEIGHT, COUNTER_THICKNESS } from "@/lib/kitchen";
import type { Vec2 } from "@/lib/geometry";

/** Signed area in the 2D shape plane (positive = CCW). */
function signedArea2D(pts: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/**
 * A single CONTINUOUS countertop slab extruded from a run outline (world XZ
 * polygon). The outline covers the entire L-footprint including the corner, so
 * there are no separate corner tiles and no vertical step / seam between
 * intersecting slabs. The slab bottom sits exactly at `topY` (default 0.86 m)
 * and spans [topY, topY + thickness] with zero floating gap.
 */
export function CountertopOutline({
  points,
  topY = BASE_HEIGHT,
  thickness = COUNTER_THICKNESS,
}: {
  points: Vec2[];
  topY?: number;
  thickness?: number;
}) {
  const theme = useDesigner((s) => s.theme);
  const kit = useMemo(() => getThemeMaterials(theme), [theme]);

  const shape = useMemo(() => {
    if (points.length < 3) return null;
    // Map world XZ → shape plane (x, -z) so a [-π/2] rotation lifts +Y.
    let pts = points.map((p) => [p.x, -p.z] as [number, number]);
    if (signedArea2D(pts) < 0) pts = pts.reverse();
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    return s;
  }, [points]);

  if (!shape) return null;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, topY, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, { depth: thickness, bevelEnabled: false }]} />
        <primitive object={kit.countertop} attach="material" />
      </mesh>
    </group>
  );
}
