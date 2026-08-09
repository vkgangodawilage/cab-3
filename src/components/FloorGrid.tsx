"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useDesigner } from "@/store/useStore";

const GRID_SIZE = 50;   // half-extent → 100 m × 100 m ground plane
const SPACING = 0.25;   // 25cm minor grid (matches snap grid exactly)
const MAJOR_EVERY = 4;  // major line every 1m (4 × 25cm)
const Y = 0.012;        // just above the floor plane

/**
 * Architectural floor grid for 2D plan view.
 * Minor lines every 25cm (matching snap grid), major lines every 1m.
 * Only visible in 2D mode — fully hidden in 3D for clean perspective rendering.
 */
export function FloorGrid() {
  const mode = useDesigner((s) => s.cameraMode);

  const { minorGeo, majorGeo } = useMemo(() => {
    const minorSegs: number[] = [];
    const majorSegs: number[] = [];

    for (let i = -GRID_SIZE; i <= GRID_SIZE + 1e-6; i += SPACING) {
      const roundI = Math.round(i / SPACING);
      const isMajor = roundI % MAJOR_EVERY === 0;
      const target = isMajor ? majorSegs : minorSegs;
      target.push(-GRID_SIZE, Y, i, GRID_SIZE, Y, i);
      target.push(i, Y, -GRID_SIZE, i, Y, GRID_SIZE);
    }

    const buildGeometry = (segs: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(segs), 3)
      );
      return g;
    };

    return {
      minorGeo: buildGeometry(minorSegs),
      majorGeo: buildGeometry(majorSegs),
    };
  }, []);

  useEffect(
    () => () => {
      minorGeo.dispose();
      majorGeo.dispose();
    },
    [minorGeo, majorGeo]
  );

  // Grid only shows in 2D plan view
  if (mode !== "2d") return null;

  return (
    <group>
      {/* Minor 25cm grid: very subtle */}
      <lineSegments raycast={() => null} geometry={minorGeo}>
        <lineBasicMaterial color="#e2e8f0" transparent opacity={0.55} />
      </lineSegments>
      {/* Major 1m grid: slightly more visible */}
      <lineSegments raycast={() => null} geometry={majorGeo}>
        <lineBasicMaterial color="#94a3b8" transparent opacity={0.70} />
      </lineSegments>
    </group>
  );
}
