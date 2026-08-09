"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useDesigner } from "@/store/useStore";
import { THEME_PALETTES } from "@/lib/themes";
import { WALL_THICKNESS } from "@/constants/dimensions";
import type { Vec2 } from "@/lib/geometry";

export { ROOM_HEIGHT as WALL_HEIGHT, WALL_THICKNESS } from "@/constants/dimensions";
export const PREVIEW_COLOR = "#22d3ee";
export const SELECT_COLOR = "#22d3ee";

/**
 * Simple wall segment renderer — used for the live drawing preview.
 * Committed walls are rendered through Wall3D (CSG + selection).
 */
export function WallSegment({
  a,
  b,
  preview = false,
}: {
  a: Vec2;
  b: Vec2;
  preview?: boolean;
}) {
  const theme = useDesigner((s) => s.theme);
  const pal = THEME_PALETTES[theme];
  const ceilingHeight = useDesigner((s) => s.ceilingHeight);

  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 1e-4) return null;

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const rotY = Math.atan2(dx, dz);
  const cx = (a.x + b.x) / 2;
  const cz = (a.z + b.z) / 2;

  return (
    <mesh
      position={[cx, ceilingHeight / 2, cz]}
      rotation={[0, rotY, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[WALL_THICKNESS, ceilingHeight, len]} />
      {preview ? (
        <meshBasicMaterial
          transparent
          opacity={0.35}
          color={PREVIEW_COLOR}
          depthWrite={false}
        />
      ) : (
        <meshStandardMaterial
          color={pal.wallPaint}
          roughness={pal.wallPaintRoughness}
        />
      )}
    </mesh>
  );
}

/** Closed-room floor polygon (interior floor finish). */
export function FloorPolygon({ points }: { points: Vec2[] }) {
  const theme = useDesigner((s) => s.theme);
  const pal = THEME_PALETTES[theme];
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(
      points.map((p) => new THREE.Vector2(p.x, p.z))
    );
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);
    return geo;
  }, [points]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={pal.floorInterior} roughness={0.95} />
    </mesh>
  );
}
