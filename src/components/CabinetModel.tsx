"use client";

import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { Clone, useGLTF } from "@react-three/drei";
import type { GLTF } from "three-stdlib";
import { useDesigner } from "@/store/useStore";
import { THEME_PALETTES } from "@/lib/themes";
import type { MaterialTheme } from "@/lib/themes";

/**
 * GLTF model registry. The placeholder .glb files in /public/models are
 * authored at intrinsic (standard) dimensions so a dynamic X scale of
 * `targetWidth / standardWidth` maps 1:1 onto model space:
 *   - base_cabinet : 0.8 x 0.85 x 0.6 (w x h x d)
 *   - wall_cabinet : 0.8 x 0.7  x 0.35
 *   - filler_piece : 0.1 x 0.85 x 0.6
 */
export const CABINET_MODELS = {
  base: "/models/base_cabinet.glb",
  wall: "/models/wall_cabinet.glb",
  filler: "/models/filler_piece.glb",
} as const;

export type CabinetModelType = keyof typeof CABINET_MODELS;

export const CABINET_STANDARD_WIDTH: Record<CabinetModelType, number> = {
  base: 0.8,
  wall: 0.8,
  filler: 0.1,
};

export const CABINET_DIMENSIONS: Record<
  CabinetModelType,
  { width: number; height: number; depth: number }
> = {
  base: { width: 0.8, height: 0.85, depth: 0.6 },
  wall: { width: 0.8, height: 0.7, depth: 0.35 },
  filler: { width: 0.1, height: 0.85, depth: 0.6 },
};

let preloaded = false;

/**
 * Kick-starts the GLTFLoader cache. Must run on the client (inside an effect)
 * so that no fetch/XHR is attempted during SSR.
 */
export function preloadCabinetModels() {
  if (preloaded) return;
  preloaded = true;
  Object.values(CABINET_MODELS).forEach((path) => useGLTF.preload(path));
}

/* -------------------------------------------------------------------------- */
/* Theme-driven PBR material kit (cached per theme — bounded, no leaks)       */
/* -------------------------------------------------------------------------- */

export interface ThemeMaterials {
  body: THREE.MeshStandardMaterial;
  door: THREE.MeshStandardMaterial;
  wallBody: THREE.MeshStandardMaterial;
  wallDoor: THREE.MeshStandardMaterial;
  hardware: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  plinth: THREE.MeshStandardMaterial;
  crown: THREE.MeshStandardMaterial;
  countertop: THREE.MeshPhysicalMaterial;
  led: THREE.MeshBasicMaterial;
  /** Brushed stainless steel for appliance towers (catalog placement). */
  appliance: THREE.MeshStandardMaterial;
  /** Soft interior wall paint (extruded walls). */
  wall: THREE.MeshStandardMaterial;
  /** Neutral door/window frame trim. */
  trim: THREE.MeshStandardMaterial;
  /** Physical glass for windows / patio doors. */
  windowGlass: THREE.MeshPhysicalMaterial;
}

const materialCache = new Map<MaterialTheme, ThemeMaterials>();

function buildMaterials(theme: MaterialTheme): ThemeMaterials {
  const p = THEME_PALETTES[theme];

  const std = (
    color: string,
    opts: Partial<THREE.MeshStandardMaterialParameters> = {}
  ) => new THREE.MeshStandardMaterial({ color, ...opts });

  const countertop = new THREE.MeshPhysicalMaterial({
    color: p.countertop,
    roughness: p.countertopRoughness,
    metalness: p.countertopMetalness,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    specularIntensity: 1.2,
    envMapIntensity: 1.4,
  });

  const glass = new THREE.MeshPhysicalMaterial({
    color: p.glassTint,
    roughness: 0.08,
    metalness: 0,
    transmission: 0.92,
    thickness: 0.5,
    ior: 1.52,
    specularIntensity: 1.5,
    envMapIntensity: 1.6,
    side: THREE.DoubleSide,
  });

  const led = new THREE.MeshBasicMaterial({
    color: p.led,
    toneMapped: false,
  });

  const windowGlass = new THREE.MeshPhysicalMaterial({
    color: "#dceef7",
    roughness: 0.04,
    metalness: 0,
    transmission: 0.97,
    transparent: true,
    ior: 1.5,
    envMapIntensity: 1.8,
    side: THREE.DoubleSide,
  });

  // Cabinet body — soft-touch matte lacquer with slight clearcoat sheen
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: p.cabinetBody,
    roughness: 0.38,
    metalness: 0.04,
    clearcoat: 0.15,
    clearcoatRoughness: 0.6,
    envMapIntensity: 0.7,
  });
  const doorMat = new THREE.MeshPhysicalMaterial({
    color: p.cabinetDoor,
    roughness: 0.36,
    metalness: 0.04,
    clearcoat: 0.2,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.8,
  });
  const wallBodyMat = new THREE.MeshPhysicalMaterial({
    color: p.wallCabinet,
    roughness: 0.38,
    metalness: 0.04,
    clearcoat: 0.15,
    clearcoatRoughness: 0.6,
    envMapIntensity: 0.7,
  });
  const wallDoorMat = new THREE.MeshPhysicalMaterial({
    color: p.wallDoor,
    roughness: 0.36,
    metalness: 0.04,
    clearcoat: 0.2,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.8,
  });

  return {
    body: bodyMat as unknown as THREE.MeshStandardMaterial,
    door: doorMat as unknown as THREE.MeshStandardMaterial,
    wallBody: wallBodyMat as unknown as THREE.MeshStandardMaterial,
    wallDoor: wallDoorMat as unknown as THREE.MeshStandardMaterial,
    hardware: std(p.hardware, {
      roughness: p.hardwareRoughness,
      metalness: p.hardwareMetalness,
      envMapIntensity: 1.6,
    }),
    glass,
    plinth: std(p.plinth, { roughness: 0.55, metalness: 0.08, envMapIntensity: 0.5 }),
    crown: std(p.crown, { roughness: 0.38, metalness: 0.04, envMapIntensity: 0.6 }),
    countertop,
    led,
    appliance: std("#c8d0d8", { roughness: 0.28, metalness: 0.92, envMapIntensity: 1.6 }),
    wall: std(p.wallPaint, { roughness: p.wallPaintRoughness, envMapIntensity: 0.3 }),
    trim: std("#ede8dc", { roughness: 0.48, metalness: 0.04 }),
    windowGlass,
  };
}

/** Returns the shared, theme-keyed material kit (created once per theme). */
export function getThemeMaterials(theme: MaterialTheme): ThemeMaterials {
  let kit = materialCache.get(theme);
  if (!kit) {
    kit = buildMaterials(theme);
    materialCache.set(theme, kit);
  }
  return kit;
}

/* -------------------------------------------------------------------------- */
/* GLTF instance with PBR override                                            */
/* -------------------------------------------------------------------------- */

/**
 * Reusable GLTF instance: clones the cached scene, overrides every mesh with
 * the provided theme PBR material, and scales the X axis to fit a custom
 * width. Keyed by theme so switching materials re-clones cleanly.
 */
export function ModelInstance({
  url,
  width,
  standardWidth = 0.8,
  material,
}: {
  url: string;
  width: number;
  standardWidth?: number;
  material: THREE.Material;
}) {
  const theme = useDesigner((s) => s.theme);
  const { scene } = useGLTF(url) as GLTF;
  const sx = width / standardWidth;

  // Apply the theme PBR override to the cached GLTF scene *before* `<Clone />`
  // duplicates it, so every clone (which shares the material reference) renders
  // with the luxury material on the very first frame.
  useMemo(() => {
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).material = material;
      }
    });
  }, [scene, material]);

  return (
    <Clone
      key={theme}
      object={scene}
      scale={[sx, 1, 1]}
      castShadow
      receiveShadow
    />
  );
}

function GLTFCabinet({
  url,
  sx,
  dims,
  material,
}: {
  url: string;
  sx: number;
  dims: { width: number; height: number; depth: number };
  material: THREE.Material;
}) {
  return (
    <ModelInstance
      url={url}
      width={dims.width * sx}
      standardWidth={dims.width}
      material={material}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Procedural detail meshes (doors, hardware, glass)                          */
/* -------------------------------------------------------------------------- */

function DoorPanel({
  w,
  h,
  d,
  material,
  inset = 0.03,
}: {
  w: number;
  h: number;
  d: number;
  material: THREE.Material;
  inset?: number;
}) {
  return (
    <mesh position={[0, 0, d / 2 - 0.012]} castShadow receiveShadow>
      <boxGeometry args={[w - inset * 2, h - inset * 2, 0.024]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function Handle({
  w,
  d,
  material,
  type,
}: {
  w: number;
  d: number;
  material: THREE.Material;
  type: CabinetModelType;
}) {
  const length = type === "wall" ? 0.16 : 0.22;
  return (
    <mesh position={[-w / 2 + 0.1, 0, d / 2 + 0.01]} castShadow>
      <boxGeometry args={[0.012, length, 0.014]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function GlassDoor({
  w,
  h,
  d,
  material,
}: {
  w: number;
  h: number;
  d: number;
  material: THREE.Material;
}) {
  return (
    <mesh position={[0, 0, d / 2 - 0.014]}>
      <boxGeometry args={[w - 0.16, h - 0.16, 0.012]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/* CabinetModel — GLTF base + luxury detailing                                */
/* -------------------------------------------------------------------------- */

interface CabinetModelProps {
  type: CabinetModelType;
  position: [number, number, number];
  rotationY?: number;
  /** Target width to fit (filler gaps < standard width scale the X axis). */
  width: number;
  standardWidth?: number;
  /** Render the center door as smoked tempered glass (wall cabinets). */
  display?: boolean;
}

export function CabinetModel({
  type,
  position,
  rotationY = 0,
  width,
  standardWidth = 0.8,
  display = false,
}: CabinetModelProps) {
  const theme = useDesigner((s) => s.theme);
  const kit = useMemo(() => getThemeMaterials(theme), [theme]);

  const dims = CABINET_DIMENSIONS[type];
  const sx = width / standardWidth;
  const w = dims.width * sx;

  const bodyMaterial = type === "wall" ? kit.wallBody : kit.body;
  const doorMaterial = type === "wall" ? kit.wallDoor : kit.door;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Suspense fallback={null}>
        <GLTFCabinet
          url={CABINET_MODELS[type]}
          sx={sx}
          dims={dims}
          material={bodyMaterial}
        />
      </Suspense>

      {type !== "filler" && (
        <>
          <DoorPanel w={w} h={dims.height} d={dims.depth} material={doorMaterial} />
          <Handle w={w} d={dims.depth} material={kit.hardware} type={type} />
        </>
      )}

      {type === "wall" && display && (
        <>
          <GlassDoor w={w} h={dims.height} d={dims.depth} material={kit.glass} />
          <pointLight
            position={[0, 0.05, -dims.depth / 2 + 0.06]}
            intensity={8}
            distance={2.5}
            decay={2}
            color={THEME_PALETTES[theme].glassInterior}
          />
        </>
      )}
    </group>
  );
}
