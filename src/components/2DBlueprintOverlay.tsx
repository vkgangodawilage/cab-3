"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useDesigner } from "@/store/useStore";
import { touchesAnyWall, WALL_CABINET_DEPTH } from "@/lib/kitchen";
import { planRunLayout } from "./CabinetLayoutEngine";
import { dist } from "@/lib/geometry";

const Y = 2.9; // just above wall tops so it overlays the 2D plan
const DASH = 0.18;
const GAP = 0.12;

function pushRect(segs: number[], cx: number, cz: number, rotY: number, w: number, d: number) {
  const hx = w / 2;
  const hz = d / 2;
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const corners = (
    [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ] as [number, number][]
  ).map(([lx, lz]) => ({
    x: cx + lx * c + lz * s,
    z: cz - lx * s + lz * c,
  }));
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    segs.push(a.x, Y, a.z, b.x, Y, b.z);
  }
}

/** Emits dash segments along an edge (kept in lineSegments — no LineDashedMaterial). */
function pushDashedEdge(segs: number[], ax: number, az: number, bx: number, bz: number) {
  const len = dist({ x: ax, z: az }, { x: bx, z: bz });
  if (len < 1e-4) return;
  const dx = (bx - ax) / len;
  const dz = (bz - az) / len;
  let t = 0;
  while (t < len) {
    const a = t;
    const b = Math.min(t + DASH, len);
    segs.push(ax + dx * a, Y, az + dz * a, ax + dx * b, Y, az + dz * b);
    t += DASH + GAP;
  }
}

function pushDashedRect(segs: number[], cx: number, cz: number, rotY: number, w: number, d: number) {
  const hx = w / 2;
  const hz = d / 2;
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const corners = (
    [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ] as [number, number][]
  ).map(([lx, lz]) => ({
    x: cx + lx * c + lz * s,
    z: cz - lx * s + lz * c,
  }));
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    pushDashedEdge(segs, a.x, a.z, b.x, b.z);
  }
}

function buildLineGeometry(segs: number[]): THREE.BufferGeometry | null {
  if (segs.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(segs), 3));
  return geo;
}

/**
 * 2D blueprint overlay: base cabinets + countertops as clean solid outlines,
 * suspended wall cabinets as dashed interior projection lines. Active in both
 * the 2D plan view and the 3D viewport. Non-raycastable so drawing and
 * selection always hit the intended surfaces.
 */
export function BlueprintOverlay2D() {
  const mode = useDesigner((s) => s.cameraMode);
  const walls = useDesigner((s) => s.walls);
  const cabinets = useDesigner((s) => s.cabinets);

  const { solid, dashed } = useMemo(() => {
    const solid: number[] = [];
    const dashed: number[] = [];
    if (mode !== "2d") return { solid, dashed };

    for (const run of cabinets) {
      const isIsland = !touchesAnyWall(run, walls);
      const layout = planRunLayout(run.points, isIsland);
      for (const m of layout.base) {
        pushRect(solid, m.x, m.z, m.rotationY, m.width, m.depth);
      }
      for (const w of layout.wall) {
        pushDashedRect(dashed, w.x, w.z, w.rotationY, w.width, WALL_CABINET_DEPTH);
      }
      for (const wc of layout.wallCorners) {
        pushDashedRect(dashed, wc.x, wc.z, wc.rotationY, wc.size, wc.size);
      }
      // Countertop: single continuous footprint outline (covers corners).
      if (layout.counterOutline.length >= 3) {
        for (let i = 0; i < layout.counterOutline.length; i++) {
          const a = layout.counterOutline[i];
          const b = layout.counterOutline[(i + 1) % layout.counterOutline.length];
          solid.push(a.x, Y, a.z, b.x, Y, b.z);
        }
      }
    }
    return { solid, dashed };
  }, [mode, walls, cabinets]);

  const solidGeo = useMemo(() => buildLineGeometry(solid), [solid]);
  const dashedGeo = useMemo(() => buildLineGeometry(dashed), [dashed]);

  useEffect(
    () => () => {
      solidGeo?.dispose();
      dashedGeo?.dispose();
    },
    [solidGeo, dashedGeo]
  );

  if (!solidGeo && !dashedGeo) return null;

  return (
    <group>
      {solidGeo && (
        <lineSegments raycast={() => null} geometry={solidGeo}>
          <lineBasicMaterial color="#334155" />
        </lineSegments>
      )}
      {dashedGeo && (
        <lineSegments raycast={() => null} geometry={dashedGeo}>
          <lineBasicMaterial color="#64748b" transparent opacity={0.85} />
        </lineSegments>
      )}
    </group>
  );
}
