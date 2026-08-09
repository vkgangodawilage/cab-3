"use client";

import * as THREE from "three";
import { useDesigner } from "@/store/useStore";
import { THEME_PALETTES } from "@/lib/themes";
import type { MaterialTheme } from "@/lib/themes";

import { getCustomMaterialPreset, buildCustomMaterialKit } from "@/lib/customMaterials";
import { ProceduralBaseCarcass } from "./ProceduralBaseCarcass";
import { ProceduralWallCarcass } from "./ProceduralWallCarcass";

const FRAME = 0.05; // Shaker rails / stiles thickness
const PANEL_INSET = 0.015; // recessed center panel depth
const KNOB_RADIUS = 0.013;
const SEAM = 0.006; // drawer seam gap

export interface ShakerMaterials {
  body: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  knob: THREE.MeshStandardMaterial;
  crown: THREE.MeshStandardMaterial;
}

const shakerCache = new Map<MaterialTheme, ShakerMaterials>();
const shakerWallCache = new Map<MaterialTheme, ShakerMaterials>();

/** Theme-keyed Shaker material kit for BASE cabinets — warm body + clearcoat. */
function getShakerMaterials(theme: MaterialTheme): ShakerMaterials {
  let kit = shakerCache.get(theme);
  if (!kit) {
    const p = THEME_PALETTES[theme];
    kit = {
      body: new THREE.MeshPhysicalMaterial({
        color: p.cabinetBody,
        roughness: 0.38,
        metalness: 0.04,
        clearcoat: 0.22,
        clearcoatRoughness: 0.52,
        envMapIntensity: 0.8,
      }) as unknown as THREE.MeshStandardMaterial,
      panel: new THREE.MeshPhysicalMaterial({
        color: p.cabinetDoor,
        roughness: 0.32,
        metalness: 0.04,
        clearcoat: 0.3,
        clearcoatRoughness: 0.45,
        envMapIntensity: 0.9,
      }) as unknown as THREE.MeshStandardMaterial,
      knob: new THREE.MeshStandardMaterial({
        color: p.hardware,
        roughness: p.hardwareRoughness,
        metalness: p.hardwareMetalness,
        envMapIntensity: 1.8,
      }),
      crown: new THREE.MeshPhysicalMaterial({
        color: p.crown,
        roughness: 0.4,
        metalness: 0.03,
        clearcoat: 0.12,
        clearcoatRoughness: 0.65,
        envMapIntensity: 0.6,
      }) as unknown as THREE.MeshStandardMaterial,
    };
    shakerCache.set(theme, kit);
  }
  return kit;
}

/** Theme-keyed Shaker material kit for WALL cabinets — uses wallCabinet/wallDoor colors. */
function getShakerWallMaterials(theme: MaterialTheme): ShakerMaterials {
  let kit = shakerWallCache.get(theme);
  if (!kit) {
    const p = THEME_PALETTES[theme];
    kit = {
      body: new THREE.MeshPhysicalMaterial({
        color: p.wallCabinet,
        roughness: 0.40,
        metalness: 0.04,
        clearcoat: 0.18,
        clearcoatRoughness: 0.60,
        envMapIntensity: 0.75,
      }) as unknown as THREE.MeshStandardMaterial,
      panel: new THREE.MeshPhysicalMaterial({
        color: p.wallDoor,
        roughness: 0.38,
        metalness: 0.04,
        clearcoat: 0.22,
        clearcoatRoughness: 0.55,
        envMapIntensity: 0.85,
      }) as unknown as THREE.MeshStandardMaterial,
      knob: new THREE.MeshStandardMaterial({
        color: p.hardware,
        roughness: p.hardwareRoughness,
        metalness: p.hardwareMetalness,
        envMapIntensity: 1.8,
      }),
      crown: new THREE.MeshPhysicalMaterial({
        color: p.wallCabinet,
        roughness: 0.4,
        metalness: 0.03,
        clearcoat: 0.12,
        clearcoatRoughness: 0.65,
        envMapIntensity: 0.6,
      }) as unknown as THREE.MeshStandardMaterial,
    };
    shakerWallCache.set(theme, kit);
  }
  return kit;
}

const DIMS = {
  base: { height: 0.85, depth: 0.6 },
  wall: { height: 0.7, depth: 0.35 },
  filler: { height: 0.85, depth: 0.6 },
} as const;

type ShakerType = keyof typeof DIMS;

interface ShakerCabinetModelProps {
  type: ShakerType;
  position: [number, number, number];
  rotationY?: number;
  width: number;
  customHeight?: number;
  customDepth?: number;
  customMaterialId?: string;
  onClick?: (e: any) => void;
}

/**
 * Procedural classic Shaker cabinet:
 *  - Wall cabinets get inset-panel doors (5 cm frame, 1.5 cm recessed panel)
 *    with a centered matte-black knob + stepped crown molding up to the ceiling.
 *  - Base cabinets get multi-tier drawers (shallow cutlery + deep) with seams.
 *  - Fillers render as a plain carcass.
 * All geometry is parametric so any path width tiles seamlessly.
 */
export function ShakerCabinetModel({
  type,
  position,
  rotationY = 0,
  width,
  customHeight,
  customDepth,
  customMaterialId,
  onClick,
}: ShakerCabinetModelProps) {
  const theme = useDesigner((s) => s.theme);
  const preset = getCustomMaterialPreset(customMaterialId);
  // Wall cabinets use wall-specific palette colors (e.g. dark graphite in Graphite Studio)
  const kit = preset
    ? buildCustomMaterialKit(preset)
    : type === "wall"
      ? getShakerWallMaterials(theme)
      : getShakerMaterials(theme);
  const dims = DIMS[type];
  const height = customHeight ?? dims.height;
  const depth = customDepth ?? dims.depth;
  const z = depth / 2;

  return (
    <group position={position} rotation={[0, rotationY, 0]} onClick={onClick}>
      {/* Carcass */}
      {type === "base" && (
        <ProceduralBaseCarcass width={width} height={height} depth={depth} bodyMat={kit.body} />
      )}
      {type === "wall" && (
        <ProceduralWallCarcass width={width} height={height} depth={depth} bodyMat={kit.body} />
      )}
      {type === "filler" && (
        <mesh position={[0, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[width, height, depth]} />
          <primitive object={kit.body} attach="material" />
        </mesh>
      )}

      {type === "wall" && (
        <>
          <ShakerDoor
            width={width}
            height={height}
            z={z}
            bodyMat={kit.body}
            panelMat={kit.panel}
            knobMat={kit.knob}
          />
          <CrownMolding width={width} depth={depth} bodyMat={kit.crown} />
        </>
      )}

      {type === "base" && (
        <DrawerStack
          width={width}
          height={height}
          z={z}
          bodyMat={kit.body}
          panelMat={kit.panel}
          knobMat={kit.knob}
        />
      )}
    </group>
  );
}

/** Single Shaker door: rails + stiles frame with a recessed center panel. */
function ShakerDoor({
  width,
  height,
  z,
  bodyMat,
  panelMat,
  knobMat,
}: {
  width: number;
  height: number;
  z: number;
  bodyMat: THREE.Material;
  panelMat: THREE.Material;
  knobMat: THREE.Material;
}) {
  const frameFront = z - 0.005;
  return (
    <group>
      <mesh position={[0, height / 2 - FRAME / 2, frameFront]} castShadow>
        <boxGeometry args={[width, FRAME, 0.02]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh position={[0, -height / 2 + FRAME / 2, frameFront]} castShadow>
        <boxGeometry args={[width, FRAME, 0.02]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh position={[-width / 2 + FRAME / 2, 0, frameFront]} castShadow>
        <boxGeometry args={[FRAME, height - FRAME * 2, 0.02]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh position={[width / 2 - FRAME / 2, 0, frameFront]} castShadow>
        <boxGeometry args={[FRAME, height - FRAME * 2, 0.02]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh position={[0, 0, z - PANEL_INSET - 0.004]} receiveShadow>
        <boxGeometry args={[width - FRAME * 2 - 0.02, height - FRAME * 2 - 0.02, PANEL_INSET]} />
        <primitive object={panelMat} attach="material" />
      </mesh>
      <Knob x={0} y={0} z={z} knobMat={knobMat} />
    </group>
  );
}

/** Multi-tier base drawer stack (shallow cutlery + deep drawers). */
function DrawerStack({
  width,
  height,
  z,
  bodyMat,
  panelMat,
  knobMat,
}: {
  width: number;
  height: number;
  z: number;
  bodyMat: THREE.Material;
  panelMat: THREE.Material;
  knobMat: THREE.Material;
}) {
  // Tiers laid out from the top; the last drawer takes the remainder.
  const fixed = [0.16, 0.3];
  const remaining = Math.max(height - fixed[0] - fixed[1] - SEAM * 2, 0.05);
  const hs = [fixed[0], fixed[1], remaining];

  let cursor = height / 2;
  const tiers: { h: number; center: number }[] = [];
  for (let i = 0; i < hs.length; i++) {
    cursor -= hs[i];
    tiers.push({ h: hs[i], center: cursor + hs[i] / 2 });
    cursor -= SEAM;
  }

  return (
    <group>
      {tiers.map((tier, i) => (
        <ShakerDrawerFront
          key={i}
          width={width}
          height={tier.h}
          y={tier.center}
          z={z}
          bodyMat={bodyMat}
          panelMat={panelMat}
          knobMat={knobMat}
        />
      ))}
    </group>
  );
}

/** A drawer front with a mini Shaker inset frame + centered knob. */
function ShakerDrawerFront({
  width,
  height,
  y,
  z,
  bodyMat,
  panelMat,
  knobMat,
}: {
  width: number;
  height: number;
  y: number;
  z: number;
  bodyMat: THREE.Material;
  panelMat: THREE.Material;
  knobMat: THREE.Material;
}) {
  const frame = 0.03;
  const frameFront = z - 0.004;
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, height / 2 - frame / 2, frameFront]} castShadow>
        <boxGeometry args={[width, frame, 0.018]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh position={[0, -height / 2 + frame / 2, frameFront]} castShadow>
        <boxGeometry args={[width, frame, 0.018]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh position={[-width / 2 + frame / 2, 0, frameFront]} castShadow>
        <boxGeometry args={[frame, height - frame * 2, 0.018]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh position={[width / 2 - frame / 2, 0, frameFront]} castShadow>
        <boxGeometry args={[frame, height - frame * 2, 0.018]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh position={[0, 0, z - 0.012]} receiveShadow>
        <boxGeometry args={[width - frame * 2 - 0.015, height - frame * 2 - 0.015, 0.012]} />
        <primitive object={panelMat} attach="material" />
      </mesh>
      <Knob x={0} y={0} z={z} knobMat={knobMat} />
    </group>
  );
}

/** Premium brushed metal T-bar handle. */
function Knob({
  x,
  y,
  z,
  knobMat,
}: {
  x: number;
  y: number;
  z: number;
  knobMat: THREE.Material;
}) {
  return (
    <group position={[x, y, z]}>
      {/* Handle posts */}
      <mesh position={[0, -0.03, 0.01]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.003, 0.003, 0.02, 8]} />
        <primitive object={knobMat} attach="material" />
      </mesh>
      <mesh position={[0, 0.03, 0.01]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.003, 0.003, 0.02, 8]} />
        <primitive object={knobMat} attach="material" />
      </mesh>
      {/* Main bar */}
      <mesh position={[0, 0, 0.02]} castShadow>
        <cylinderGeometry args={[0.004, 0.004, 0.1, 8]} />
        <primitive object={knobMat} attach="material" />
      </mesh>
    </group>
  );
}

/**
 * Classic stepped crown molding running from the wall-cabinet top up to the
 * ceiling (Y ≈ 2.79 m). Wall cabinets are mounted with their bottom at
 * WALL_CABINET_ELEVATION (1.45 m), so the group's local origin sits at 1.8 m.
 */
function CrownMolding({
  width,
  depth,
  bodyMat,
}: {
  width: number;
  depth: number;
  bodyMat: THREE.Material;
}) {
  return (
    <group>
      <mesh position={[0, 0.39, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.05, 0.08, depth + 0.04]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.44, depth]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
      <mesh position={[0, 0.93, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.14, 0.12, depth + 0.1]} />
        <primitive object={bodyMat} attach="material" />
      </mesh>
    </group>
  );
}
