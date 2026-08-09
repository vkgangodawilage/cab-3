"use client";

import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useDesigner } from "@/store/useStore";
import type { Vec2 } from "@/lib/geometry";
import { preloadCabinetModels } from "./CabinetModel";
import { LightingEnvironment } from "./LightingEnvironment";
import { CameraController } from "./CameraController";
import { WallBuilder } from "./WallBuilder";
import { ProceduralCabinetRow } from "./ProceduralCabinetRow";
import { WallAnchoredPlacement } from "./WallAnchoredPlacement";
import { DoorWindowPlacementEngine } from "./DoorWindowPlacementEngine";
import { WallDrawingEngine2D } from "./WallDrawingEngine2D";
import { CeilingCap } from "./CeilingCap";
import { FloorGrid } from "./FloorGrid";
import { CADWall2D } from "./CADWall2D";
import { CADDimensionLines } from "./CADDimensionLines";
import { BlueprintOverlay2D } from "./2DBlueprintOverlay";

/** Intersects the raycaster ray with the floor (y = 0) plane. */
function floorPoint(ray: THREE.Ray): Vec2 | null {
  if (Math.abs(ray.direction.y) < 1e-6) return null;
  const t = -ray.origin.y / ray.direction.y;
  if (t <= 0) return null;
  return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
}

/**
 * Exception-safe raycaster guard. Wraps `Raycaster.intersectObject` with a
 * try/catch so a single object whose geometry is transiently empty or disposed
 * (e.g. the CSG result mid-rebuild) can never throw and break pointer handling.
 * The rest of the scene still intersects normally.
 */
function RaycastGuard() {
  const raycaster = useThree((s) => s.raycaster);

  useEffect(() => {
    const original = raycaster.intersectObject.bind(raycaster) as (
      object: THREE.Object3D,
      recursive?: boolean,
      intersects?: THREE.Intersection[]
    ) => THREE.Intersection[];
    raycaster.intersectObject = ((
      object: THREE.Object3D,
      recursive?: boolean,
      intersects?: THREE.Intersection[]
    ) => {
      try {
        return original(object, recursive, intersects);
      } catch {
        return intersects ?? [];
      }
    }) as typeof raycaster.intersectObject;
    return () => {
      raycaster.intersectObject = original as typeof raycaster.intersectObject;
    };
  }, [raycaster]);

  return null;
}

export function Viewport() {
  const snap = useDesigner((s) => s.snap);
  const setPointer = useDesigner((s) => s.setPointer);
  const setHover = useDesigner((s) => s.setHover);
  const setPending = useDesigner((s) => s.setPending);

  useEffect(() => {
    preloadCabinetModels();
  }, []);

  // Tracks the pointer over any surface (floor, walls, cabinets) so the
  // wall-anchored slide preview follows the cursor smoothly.
  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
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

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, logarithmicDepthBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.35;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        gl.useLegacyLights = false;
      }}
    >
      {/* Defensive: never let a broken mesh geometry crash pointer handling. */}
      <RaycastGuard />
      <LightingEnvironment />
      <CeilingCap />

      <CameraController />

      <group onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
        {/* Polished warm-white porcelain floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
          <planeGeometry args={[120, 120]} />
          <meshStandardMaterial
            color="#f4f1ec"
            roughness={0.48}
            metalness={0.04}
            envMapIntensity={0.6}
          />
        </mesh>
        {/* Very subtle gloss coat on top of shadow receiver */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
          <planeGeometry args={[120, 120]} />
          <meshPhysicalMaterial
            color="#ffffff"
            roughness={0.12}
            metalness={0}
            transparent
            opacity={0.07}
            depthWrite={false}
            envMapIntensity={1.4}
          />
        </mesh>

        {/* Full-canvas architectural grid (2D + 3D). */}
        <FloorGrid />

        <WallDrawingEngine2D />

        <Suspense fallback={null}>
          <WallBuilder />
          <ProceduralCabinetRow />
          <WallAnchoredPlacement />
          <DoorWindowPlacementEngine />
        </Suspense>

        {/* Bold CAD walls + dimension lines, and cabinet blueprint layer. */}
        <CADWall2D />
        <CADDimensionLines />
        <BlueprintOverlay2D />

        <HoverMarker />
      </group>
    </Canvas>
  );
}

function HoverMarker() {
  const mode = useDesigner((s) => s.cameraMode);
  const hover = useDesigner((s) => s.hover);
  const hover_raw = useDesigner((s) => s.pointer);
  const walls = useDesigner((s) => s.walls);
  const cabinets = useDesigner((s) => s.cabinets);
  const tool = useDesigner((s) => s.tool);
  const activeCatalogItem = useDesigner((s) => s.activeCatalogItem);

  // Cursor dot is 2D-only — 3D shows clean geometry with zero markers.
  if (mode !== "2d" || !hover) return null;

  // Detect if we are snapped to an existing vertex (vs grid)
  const isVertexSnap = (() => {
    if (!hover_raw) return false;
    for (const w of walls) {
      for (const p of w.points) {
        if (Math.hypot(p.x - hover_raw.x, p.z - hover_raw.z) < 0.2) return true;
      }
    }
    for (const c of cabinets) {
      for (const p of c.points) {
        if (Math.hypot(p.x - hover_raw.x, p.z - hover_raw.z) < 0.2) return true;
      }
    }
    return false;
  })();

  const isEraser = tool === "eraser";
  const color = isEraser ? "#f87171" : isVertexSnap ? "#22c55e" : "#2563eb";
  const y = 0.025;
  const r = isVertexSnap ? 0.12 : 0.07;

  return (
    <group position={[hover.x, y, hover.z]}>
      {/* Main dot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r, 24]} />
        <meshBasicMaterial color={color} transparent opacity={isVertexSnap ? 0.25 : 0.85} depthWrite={false} />
      </mesh>
      {/* Snap ring outline */}
      {isVertexSnap && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.01, r + 0.015, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
      {/* Crosshair lines for vertex snap */}
      {isVertexSnap && [
        [[-0.22, 0, 0], [0.22, 0, 0]] as const,
        [[0, 0, -0.22], [0, 0, 0.22]] as const,
      ].map((pts, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={new Float32Array([...pts[0], ...pts[1]])}
              count={2}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color={color} transparent opacity={0.75} depthWrite={false} />
        </line>
      ))}
    </group>
  );
}
