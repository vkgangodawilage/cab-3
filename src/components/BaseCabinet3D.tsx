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
  BASE_DEPTH,
  BASE_HEIGHT,
  TOE_KICK_HEIGHT,
  TOE_KICK_INSET,
  CORNER_MODULE_SIZE,
  STD_CABINET_WIDTH,
} from "@/lib/kitchen";

export type BaseCabinetVariant = "double-door" | "drawer" | "l-corner" | "filler";

interface CabinetKit {
  body: THREE.Material;
  door: THREE.Material;
  handle: THREE.Material;
  plinth: THREE.Material;
}

const PANEL = 0.02; // door / drawer front thickness
const SEAM = 0.006; // reveal gap between doors / drawers
const PROUD = 0.002; // fronts sit flush with the carcass edge (no z-fighting)

/**
 * Solid, fully-enclosed modular base cabinet.
 *
 * The group origin sits ON the floor (Y = 0) and the unit grows straight up:
 *   Y [0, 0.10]  → inset solid toe kick (plinth)
 *   Y [0.10, h]  → enclosed carcass box + flush front faces (doors/drawers)
 * so the countertop can rest exactly on top with zero floating gap.
 *
 * Variants:
 *   - "double-door" : two flush door panels + vertical edge pulls
 *   - "drawer"      : three stacked drawer fronts + subtle bar handles
 *   - "l-corner"    : 0.9 x 0.9 blind corner unit with a 45° diagonal door
 *   - "filler"      : plain solid filler panel
 */
export function BaseCabinet3D({
  position,
  rotationY = 0,
  width = STD_CABINET_WIDTH,
  depth = BASE_DEPTH,
  height = BASE_HEIGHT,
  variant = "double-door",
  customMaterialId,
  innerRef,
}: {
  position: [number, number, number];
  rotationY?: number;
  width?: number;
  depth?: number;
  height?: number;
  variant?: BaseCabinetVariant;
  customMaterialId?: string;
  /** Optional ref to this module's root group (Phase 3 measurement). */
  innerRef?: Ref<THREE.Group>;
}) {
  const theme = useDesigner((s) => s.theme);

  const kit = useMemo<CabinetKit>(() => {
    const preset = getCustomMaterialPreset(customMaterialId);
    if (preset) {
      const c = buildCustomMaterialKit(preset);
      return { body: c.body, door: c.panel, handle: c.knob, plinth: c.body };
    }
    const t: ThemeMaterials = getThemeMaterials(theme);
    return { body: t.body, door: t.door, handle: t.hardware, plinth: t.plinth };
  }, [theme, customMaterialId]);

  const boxHeight = Math.max(height - TOE_KICK_HEIGHT, 0.05);
  const boxY = TOE_KICK_HEIGHT + boxHeight / 2;

  return (
    <group ref={innerRef} position={position} rotation={[0, rotationY, 0]}>
      {variant === "l-corner" ? (
        <LCornerUnit kit={kit} boxY={boxY} boxHeight={boxHeight} />
      ) : (
        <>
          <ToeKick width={width} depth={depth} kit={kit} />

          {/* Fully enclosed carcass box (solid, never hollow). */}
          <mesh position={[0, boxY, 0]} castShadow receiveShadow>
            <boxGeometry args={[width, boxHeight, depth]} />
            <primitive object={kit.body} attach="material" />
          </mesh>

          {variant === "double-door" && (
            <DoubleDoors
              width={width}
              boxY={boxY}
              boxHeight={boxHeight}
              depth={depth}
              kit={kit}
            />
          )}
          {variant === "drawer" && (
            <DrawerStack
              width={width}
              boxY={boxY}
              boxHeight={boxHeight}
              depth={depth}
              kit={kit}
            />
          )}
        </>
      )}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Toe kick + regular front faces                                             */
/* -------------------------------------------------------------------------- */

function ToeKick({
  width,
  depth,
  kit,
}: {
  width: number;
  depth: number;
  kit: CabinetKit;
}) {
  return (
    <mesh
      position={[0, TOE_KICK_HEIGHT / 2, depth / 2 - TOE_KICK_INSET - 0.01]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[width, TOE_KICK_HEIGHT, 0.02]} />
      <primitive object={kit.plinth} attach="material" />
    </mesh>
  );
}

function DoubleDoors({
  width,
  boxY,
  boxHeight,
  depth,
  kit,
}: {
  width: number;
  boxY: number;
  boxHeight: number;
  depth: number;
  kit: CabinetKit;
}) {
  const doorWidth = (width - SEAM) / 2;
  const z = depth / 2 - PANEL / 2 + PROUD;
  const cx = (width + SEAM) / 4;
  const handleY = boxY;
  const handleZ = depth / 2 + 0.006;

  return (
    <group>
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <mesh
            position={[side * cx, boxY, z]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[doorWidth, boxHeight, PANEL]} />
            <primitive object={kit.door} attach="material" />
          </mesh>
          {/* Vertical edge pull near the outer door edge */}
          <mesh
            position={[side * (width / 2 - 0.055), handleY, handleZ]}
            castShadow
          >
            <boxGeometry args={[0.008, 0.36, 0.014]} />
            <primitive object={kit.handle} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DrawerStack({
  width,
  boxY,
  boxHeight,
  depth,
  kit,
}: {
  width: number;
  boxY: number;
  boxHeight: number;
  depth: number;
  kit: CabinetKit;
}) {
  // Shallow top drawer + two deeper drawers filling the full carcass height.
  const tiers = [0.2, 0.26, Math.max(boxHeight - 0.46, 0.1)];
  const z = depth / 2 - PANEL / 2 + PROUD;
  let cursor = boxY + boxHeight / 2 - SEAM / 2;

  return (
    <group>
      {tiers.map((h, i) => {
        const panelH = Math.max(h - SEAM, 0.04);
        const cy = cursor - panelH / 2;
        cursor -= h;
        return (
          <group key={i}>
            <mesh position={[0, cy, z]} castShadow receiveShadow>
              <boxGeometry args={[width - SEAM * 2, panelH, PANEL]} />
              <primitive object={kit.door} attach="material" />
            </mesh>
            {/* Subtle horizontal bar handle */}
            <mesh
              position={[0, cy, depth / 2 + 0.012]}
              castShadow
            >
              <boxGeometry args={[Math.min(0.18, width * 0.3), 0.009, 0.012]} />
              <primitive object={kit.handle} attach="material" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* L-corner blind base: chamfered solid + 45° diagonal door                   */
/* -------------------------------------------------------------------------- */

function LCornerUnit({
  kit,
  boxY,
  boxHeight,
}: {
  kit: CabinetKit;
  boxY: number;
  boxHeight: number;
}) {
  const size = CORNER_MODULE_SIZE;
  const depth = BASE_DEPTH;
  const half = size / 2;
  // Exact 45° cut so the diagonal connects the two adjacent 0.6 m fronts:
  // (0,0) (S,0) (S,D) (D,S) (0,S) relative to the back-wall intersection.
  const chamfer = size - depth;
  const doorWidth = chamfer * Math.SQRT2;
  const faceCenter = half - chamfer / 2;
  const o = 0.01; // door proud offset along the chamfer outward normal
  const doorRotY = (Math.PI * 3) / 4; // chamfer normal faces the room (+, -)

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

  const extrudeOpts = useMemo(
    () => ({ depth: boxHeight, bevelEnabled: false }),
    [boxHeight]
  );

  return (
    <group>
      {/* Toe kick: same footprint, plinth material, anchored at the floor [0, 0.1] */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, { depth: TOE_KICK_HEIGHT, bevelEnabled: false }]} />
        <primitive object={kit.plinth} attach="material" />
      </mesh>

      {/* Solid chamfered carcass anchored on the toe kick [0.1, 0.86] */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TOE_KICK_HEIGHT, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, extrudeOpts]} />
        <primitive object={kit.body} attach="material" />
      </mesh>

      {/* 45° diagonal door on the chamfer face */}
      <mesh
        rotation={[0, doorRotY, 0]}
        position={[faceCenter - o * Math.SQRT1_2, boxY, -(faceCenter - o * Math.SQRT1_2)]}
        castShadow
      >
        <boxGeometry args={[doorWidth, boxHeight, PANEL]} />
        <primitive object={kit.door} attach="material" />
      </mesh>

      {/* Vertical edge pull on the diagonal door */}
      <mesh
        rotation={[0, doorRotY, 0]}
        position={[faceCenter + 0.012 * Math.SQRT1_2, boxY, -(faceCenter + 0.012 * Math.SQRT1_2)]}
        castShadow
      >
        <boxGeometry args={[0.008, 0.36, 0.014]} />
        <primitive object={kit.handle} attach="material" />
      </mesh>
    </group>
  );
}
