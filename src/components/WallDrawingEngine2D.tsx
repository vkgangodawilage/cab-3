"use client";

import { useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { useDesigner } from "@/store/useStore";
import { dist, formatFeet } from "@/lib/geometry";
import type { Vec2 } from "@/lib/geometry";

/** Intersects the raycaster ray with the floor (y = 0) plane. */
function floorPoint(ray: THREE.Ray): Vec2 | null {
  if (Math.abs(ray.direction.y) < 1e-6) return null;
  const t = -ray.origin.y / ray.direction.y;
  if (t <= 0) return null;
  return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
}

/**
 * Interactive 2D mouse drawing engine — fixed for smooth, accurate drawing.
 *
 * Key fix: onClick always commits the store's `pending` point (which is already
 * ortho-snapped + grid-snapped), not the raw raycaster e.point. This ensures
 * the visual cursor dot always matches the committed vertex exactly.
 */
export function WallDrawingEngine2D() {
  const handlePrimaryClick = useDesigner((s) => s.handlePrimaryClick);
  const finishDrawing = useDesigner((s) => s.finishDrawing);
  const cancelActive = useDesigner((s) => s.cancelActive);
  const setTool = useDesigner((s) => s.setTool);
  const snap = useDesigner((s) => s.snap);
  const setPointer = useDesigner((s) => s.setPointer);
  const setHover = useDesigner((s) => s.setHover);
  const setPending = useDesigner((s) => s.setPending);
  const pending = useDesigner((s) => s.pending);
  const cameraMode = useDesigner((s) => s.cameraMode);
  const activeWallId = useDesigner((s) => s.activeWallId);
  const activeCabinetId = useDesigner((s) => s.activeCabinetId);
  const walls = useDesigner((s) => s.walls);
  const cabinets = useDesigner((s) => s.cabinets);

  // Throttle pointermove so we don't re-render on every micro pixel move
  const lastMoveTime = useRef(0);

  const isDrawing = activeWallId !== null || activeCabinetId !== null;

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const now = performance.now();
    if (now - lastMoveTime.current < 10) return; // throttle to ~100fps max
    lastMoveTime.current = now;
    const raw = floorPoint(e.ray);
    if (!raw) return;
    setPointer(raw);
    const snapped = snap(raw);
    setHover(snapped);
    setPending(snapped);
  };

  const handlePointerLeave = () => {
    setPointer(null);
    setHover(null);
    setPending(null);
  };

  const activePoints: Vec2[] | null =
    (activeWallId
      ? walls.find((w) => w.id === activeWallId)?.points
      : activeCabinetId
        ? cabinets.find((c) => c.id === activeCabinetId)?.points
        : null) ?? null;

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={(e) => (e.target as Element).setPointerCapture(e.pointerId)}
        onPointerUp={(e) => (e.target as Element).releasePointerCapture(e.pointerId)}
        onClick={(e) => {
          e.stopPropagation();
          // Skip second click of double-click
          if (e.nativeEvent.detail > 1) return;
          // ✅ Use the already-snapped pending point from store, not raw e.point
          // This guarantees what you see (cursor dot) == what gets committed.
          const commitPt = pending ?? { x: e.point.x, z: e.point.z };
          handlePrimaryClick(commitPt);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          finishDrawing();
        }}
        onContextMenu={(e) => {
          e.nativeEvent.preventDefault();
          cancelActive();
          setTool("select");
        }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 2D CAD live preview (clean plan lines, no ghost 3D walls). */}
      {cameraMode === "2d" && isDrawing && activePoints && pending && (
        <ActivePathPreview points={activePoints} pending={pending} />
      )}
    </group>
  );
}

/** CAD-style active path preview: committed segments + bold dashed live segment. */
function ActivePathPreview({ points, pending }: { points: Vec2[]; pending: Vec2 }) {
  const y = 2.95; // above CAD dimension lines so it always reads on top
  const start = points[0];
  const last = points[points.length - 1];
  const committed: [number, number, number][] = points.map((p) => [p.x, y, p.z]);
  const len = dist(last, pending);

  // Offset the length label perpendicular to the live segment so it sits
  // clearly beside the line (and away from the dimension input).
  const dx = pending.x - last.x;
  const dz = pending.z - last.z;
  const l = Math.hypot(dx, dz) || 1;
  const lx = (-dz / l) * 0.4;
  const lz = (dx / l) * 0.4;
  const mid: [number, number, number] = [
    (last.x + pending.x) / 2 + lx,
    y,
    (last.z + pending.z) / 2 + lz,
  ];

  return (
    <group>
      {points.length >= 2 && (
        <Line points={committed} color="#2563eb" lineWidth={2} raycast={() => null} />
      )}
      <Line
        points={[
          [last.x, y, last.z],
          [pending.x, y, pending.z],
        ]}
        color="#2563eb"
        lineWidth={3}
        dashed
        dashSize={0.2}
        gapSize={0.12}
        raycast={() => null}
      />
      <mesh position={[start.x, y, start.z]} raycast={() => null}>
        <circleGeometry args={[0.08, 16]} />
        <meshBasicMaterial color="#2563eb" depthWrite={false} />
      </mesh>
      <mesh position={[pending.x, y, pending.z]} raycast={() => null}>
        <circleGeometry args={[0.06, 16]} />
        <meshBasicMaterial color="#f472b6" depthWrite={false} />
      </mesh>
      <Html position={mid} center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
        <div className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-blue-700 shadow-sm">
          {formatFeet(len)}
        </div>
      </Html>
    </group>
  );
}
