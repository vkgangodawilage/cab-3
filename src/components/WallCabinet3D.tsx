"use client";

import { useMemo, type Ref } from "react";
import * as THREE from "three";
import { useDesigner } from "@/store/useStore";
import { getThemeMaterials } from "./CabinetModel";
import type { ThemeMaterials } from "./CabinetModel";
import {
  getCustomMaterialPreset,
  buildCustomMaterialKit,
} from "@/lib/customMaterials";
import {
  WALL_CABINET_DEPTH,
  WALL_CABINET_HEIGHT,
  UPPER_CORNER_MODULE_SIZE,
} from "@/lib/kitchen";

export type WallCabinetVariant = "solid" | "glass";

interface WallKit {
  body: THREE.Material;
  door: THREE.Material;
  handle: THREE.Material;
  glass: THREE.Material;
  led: THREE.Material;
}

const PANEL = 0.02;
const SEAM = 0.006;
const PROUD = 0.002;

/**
 * Modern flat-panel upper wall cabinet.
 *
 * The group origin sits at the BOTTOM of the cabinet (Y = 0 local), so placing
 * the group at `WALL_CABINET_ELEVATION` (1.5 m) drops the box exactly into the
 * 0.6 m backsplash gap above the 0.9 m countertop. An optional `soffit` panel
 * bridges the cabinet top up to the ceiling for a full-height built-in look.
 *
 * Variants:
 *   - "solid": two flush double doors + discrete bottom edge pulls
 *   - "glass": display frame with physical glass + warm interior LED
 */
export function WallCabinet3D({
  position,
  rotationY = 0,
  width,
  height = WALL_CABINET_HEIGHT,
  depth = WALL_CABINET_DEPTH,
  variant = "solid",
  customMaterialId,
  soffit = 0,
  innerRef,
}: {
  position: [number, number, number];
  rotationY?: number;
  width: number;
  height?: number;
  depth?: number;
  variant?: WallCabinetVariant;
  customMaterialId?: string;
  soffit?: number;
  /** Optional ref to this module's root group (Phase 3 measurement). */
  innerRef?: Ref<THREE.Group>;
}) {
  const theme = useDesigner((s) => s.theme);

  const kit = useMemo<WallKit>(() => {
    const preset = getCustomMaterialPreset(customMaterialId);
    if (preset) {
      const c = buildCustomMaterialKit(preset);
      return { body: c.body, door: c.panel, handle: c.knob, glass: c.panel, led: c.body };
    }
    const t: ThemeMaterials = getThemeMaterials(theme);
    return {
      body: t.wallBody,
      door: t.wallDoor,
      handle: t.hardware,
      glass: t.glass,
      led: t.led,
    };
  }, [theme, customMaterialId]);

  return (
    <group ref={innerRef} position={position} rotation={[0, rotationY, 0]}>
      {/* Enclosed carcass box */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <primitive object={kit.body} attach="material" />
      </mesh>

      {variant === "solid" ? (
        <SolidFront width={width} height={height} depth={depth} kit={kit} />
      ) : (
        <GlassFront width={width} height={height} depth={depth} kit={kit} />
      )}

      {soffit > 0 && (
        <mesh position={[0, height + soffit / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[width, soffit, depth]} />
          <primitive object={kit.body} attach="material" />
        </mesh>
      )}
    </group>
  );
}

/** Two flush double doors with discrete bottom edge pulls. */
function SolidFront({
  width,
  height,
  depth,
  kit,
}: {
  width: number;
  height: number;
  depth: number;
  kit: WallKit;
}) {
  const doorWidth = (width - SEAM) / 2;
  const cx = (width + SEAM) / 4;
  const z = depth / 2 - PANEL / 2 + PROUD;
  const pullY = 0.09; // discrete pull near the bottom edge

  return (
    <group>
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <mesh position={[side * cx, height / 2, z]} castShadow receiveShadow>
            <boxGeometry args={[doorWidth, height, PANEL]} />
            <primitive object={kit.door} attach="material" />
          </mesh>
          {/* Discrete bottom edge pull */}
          <mesh position={[side * cx, pullY, depth / 2 + 0.012]} castShadow>
            <boxGeometry args={[Math.min(0.16, width * 0.28), 0.012, 0.012]} />
            <primitive object={kit.handle} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Glass-front display unit with a warm interior LED. */
function GlassFront({
  width,
  height,
  depth,
  kit,
}: {
  width: number;
  height: number;
  depth: number;
  kit: WallKit;
}) {
  const frame = 0.06;
  const front = depth / 2 - 0.004;
  const ledColor = (kit.led as THREE.MeshBasicMaterial).color;
  const ledHex = `#${ledColor.getHex().toString(16).padStart(6, "0")}`;

  return (
    <group>
      {/* Door frame rails + stiles */}
      <mesh position={[0, height - frame / 2, front]} castShadow>
        <boxGeometry args={[width, frame, 0.02]} />
        <primitive object={kit.door} attach="material" />
      </mesh>
      <mesh position={[0, frame / 2, front]} castShadow>
        <boxGeometry args={[width, frame, 0.02]} />
        <primitive object={kit.door} attach="material" />
      </mesh>
      <mesh position={[-(width - frame) / 2, height / 2, front]} castShadow>
        <boxGeometry args={[frame, height - frame * 2, 0.02]} />
        <primitive object={kit.door} attach="material" />
      </mesh>
      <mesh position={[(width - frame) / 2, height / 2, front]} castShadow>
        <boxGeometry args={[frame, height - frame * 2, 0.02]} />
        <primitive object={kit.door} attach="material" />
      </mesh>

      {/* Physical glass panel */}
      <mesh position={[0, height / 2, depth / 2 - 0.02]}>
        <boxGeometry args={[width - frame * 2 - 0.01, height - frame * 2 - 0.01, 0.01]} />
        <primitive object={kit.glass} attach="material" />
      </mesh>

      {/* Interior back panel + shelf */}
      <mesh position={[0, height / 2, -depth / 2 + 0.03]} receiveShadow>
        <boxGeometry args={[width - 0.05, height - 0.05, 0.012]} />
        <primitive object={kit.body} attach="material" />
      </mesh>
      <mesh position={[0, height / 2, 0]} receiveShadow>
        <boxGeometry args={[width - 0.06, 0.015, depth - 0.1]} />
        <primitive object={kit.body} attach="material" />
      </mesh>

      {/* Warm interior LED */}
      <pointLight
        position={[0, height * 0.72, -0.08]}
        intensity={5}
        distance={2.2}
        decay={2}
        color={ledHex}
      />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Upper L-corner blind unit (0.65 m x 0.65 m) — 45° diagonal door            */
/* -------------------------------------------------------------------------- */

export function UpperCornerCabinet3D({
  position,
  rotationY = 0,
  size = UPPER_CORNER_MODULE_SIZE,
  height = WALL_CABINET_HEIGHT,
  customMaterialId,
  soffit = 0,
  innerRef,
}: {
  position: [number, number, number];
  rotationY?: number;
  size?: number;
  height?: number;
  customMaterialId?: string;
  soffit?: number;
  /** Optional ref to this module's root group (Phase 3 measurement). */
  innerRef?: Ref<THREE.Group>;
}) {
  const theme = useDesigner((s) => s.theme);

  const kit = useMemo<WallKit>(() => {
    const preset = getCustomMaterialPreset(customMaterialId);
    if (preset) {
      const c = buildCustomMaterialKit(preset);
      return { body: c.body, door: c.panel, handle: c.knob, glass: c.panel, led: c.body };
    }
    const t: ThemeMaterials = getThemeMaterials(theme);
    return {
      body: t.wallBody,
      door: t.wallDoor,
      handle: t.hardware,
      glass: t.glass,
      led: t.led,
    };
  }, [theme, customMaterialId]);

  const depth = WALL_CABINET_DEPTH;
  const half = size / 2;
  // Exact 45° cut so the diagonal connects the two adjacent 0.35 m fronts:
  // (0,0) (S,0) (S,D) (D,S) (0,S) relative to the back-wall intersection.
  const chamfer = size - depth;
  const doorWidth = chamfer * Math.SQRT2;
  const faceCenter = half - chamfer / 2;

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-half, -half);
    s.lineTo(half, -half);
    s.lineTo(half, -half + depth);
    s.lineTo(depth - half, half);
    s.lineTo(-half, half);
    s.closePath();
    return s;
  }, [half, depth]);

  const offset = 0.01; // door proud offset along the chamfer outward normal
  const doorRotY = (Math.PI * 3) / 4; // chamfer normal faces the room (+, -)

  return (
    <group ref={innerRef} position={position} rotation={[0, rotationY, 0]}>
      {/* Solid chamfered carcass anchored at the group bottom [0, height] */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, { depth: height, bevelEnabled: false }]} />
        <primitive object={kit.body} attach="material" />
      </mesh>

      {/* 45° diagonal door on the chamfer face */}
      <mesh
        rotation={[0, doorRotY, 0]}
        position={[faceCenter - offset * Math.SQRT1_2, height / 2, -(faceCenter - offset * Math.SQRT1_2)]}
        castShadow
      >
        <boxGeometry args={[doorWidth, height, PANEL]} />
        <primitive object={kit.door} attach="material" />
      </mesh>

      {/* Vertical edge pull on the diagonal door */}
      <mesh
        rotation={[0, doorRotY, 0]}
        position={[faceCenter + 0.012 * Math.SQRT1_2, height / 2, -(faceCenter + 0.012 * Math.SQRT1_2)]}
        castShadow
      >
        <boxGeometry args={[0.008, 0.3, 0.014]} />
        <primitive object={kit.handle} attach="material" />
      </mesh>

      {/* Bridging chamfered soffit up to the ceiling, sitting on the box top */}
      {soffit > 0 && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, height, 0]}
          castShadow
          receiveShadow
        >
          <extrudeGeometry args={[shape, { depth: soffit, bevelEnabled: false }]} />
          <primitive object={kit.body} attach="material" />
        </mesh>
      )}
    </group>
  );
}
