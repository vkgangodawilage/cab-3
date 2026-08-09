"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { Geometry, Base, Subtraction } from "@react-three/csg";
import { useDesigner } from "@/store/useStore";
import type { PlacedCutout } from "@/store/useStore";
import { getCatalogItem } from "@/lib/catalog";
import { cutoutLocalBox, positionAlongWall } from "@/lib/cutouts";
import { getThemeMaterials, ModelInstance } from "./CabinetModel";
import { WALL_THICKNESS } from "@/constants/dimensions";
import type { Vec2 } from "@/lib/geometry";

const SELECT_WIRE = "#2563eb";
const SELECT_SHELL = "#3b82f6";
/** Never raycast — CSG geometry is transiently disposed by the boolean engine. */
const noRaycast = () => null;

/**
 * Extruded 3D wall rendered through `@react-three/csg`. The solid wall box is
 * the `<Base>`; every committed door/window cutout on this segment is a dynamic
 * `<Subtraction>` box. The final CSG mesh casts/receives shadows so sunlight
 * passes through the carved openings.
 *
 * Clicking a wall in Select mode selects it (blue wireframe + translucent
 * shell highlight); in opening-placement mode the click carves a cutout.
 * Performance: the CSG graph only contains *committed* cutouts, so boolean
 * evaluation happens once per commit, never per-frame.
 */
export function Wall3D({
  a,
  b,
  segmentId,
}: {
  a: Vec2;
  b: Vec2;
  segmentId: string;
}) {
  const theme = useDesigner((s) => s.theme);
  const kit = getThemeMaterials(theme);
  const placedCutouts = useDesigner((s) => s.placedCutouts);
  const selected = useDesigner((s) => s.selectedWallId === segmentId);
  const tool = useDesigner((s) => s.tool);
  const cameraMode = useDesigner((s) => s.cameraMode);
  const activeCatalogItem = useDesigner((s) => s.activeCatalogItem);
  const selectWall = useDesigner((s) => s.selectWall);
  const setCutoutPreview = useDesigner((s) => s.setCutoutPreview);
  const placeCutout = useDesigner((s) => s.placeCutout);
  const ceilingHeight = useDesigner((s) => s.ceilingHeight);

  const openingActive = activeCatalogItem?.kind === "opening";

  const cutouts = useMemo(
    () => placedCutouts.filter((c) => c.wallId === segmentId),
    [placedCutouts, segmentId]
  );

  const len = Math.hypot(b.x - a.x, b.z - a.z);

  const rotY = Math.atan2(b.x - a.x, b.z - a.z);
  const cx = (a.x + b.x) / 2;
  const cz = (a.z + b.z) / 2;

  const seg = useMemo(() => ({ a, b }), [a, b]);

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!openingActive) return;
      setCutoutPreview({
        wallId: segmentId,
        positionOnWall: positionAlongWall(seg, { x: e.point.x, z: e.point.z }),
      });
    },
    [openingActive, seg, segmentId, setCutoutPreview]
  );

  const handlePointerLeave = useCallback(() => {
    if (openingActive) setCutoutPreview(null);
  }, [openingActive, setCutoutPreview]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (openingActive) {
        placeCutout(
          segmentId,
          positionAlongWall(seg, { x: e.point.x, z: e.point.z })
        );
      } else if (cameraMode === "3d" && tool === "select") {
        selectWall(segmentId);
      }
    },
    [openingActive, seg, segmentId, placeCutout, cameraMode, tool, selectWall]
  );

  if (len < 1e-4) return null;

  return (
    <group
      position={[cx, 0, cz]}
      rotation={[0, rotY, 0]}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
      <WallCSGMesh len={len} ceilingHeight={ceilingHeight} cutouts={cutouts} material={kit.wall} />

      {/*
        Invisible interaction catcher. The CSG result geometry is disposed and
        repopulated by @react-three/csg on every boolean update — raycasting it
        can hit an empty position attribute and crash the raycaster. So the CSG
        solid never raycasts; a plain, always-valid box carries the pointer
        events (selection / cutout placement / hover preview) instead.
      */}
      <mesh position={[0, ceilingHeight / 2, 0]}>
        <boxGeometry args={[WALL_THICKNESS, ceilingHeight, len]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {selected && (
        <>
          {/* Translucent blue selection shell */}
          <mesh position={[0, ceilingHeight / 2, 0]}>
            <boxGeometry args={[WALL_THICKNESS + 0.08, ceilingHeight + 0.08, len + 0.08]} />
            <meshBasicMaterial
              color={SELECT_SHELL}
              transparent
              opacity={0.12}
              depthWrite={false}
            />
          </mesh>
          {/* Blue wireframe outline */}
          <mesh position={[0, ceilingHeight / 2, 0]}>
            <boxGeometry args={[WALL_THICKNESS + 0.06, ceilingHeight + 0.06, len + 0.06]} />
            <meshBasicMaterial
              wireframe
              color={SELECT_WIRE}
              transparent
              opacity={0.9}
              depthWrite={false}
            />
          </mesh>
        </>
      )}

      {cutouts.map((c) => (
        <CutoutFrame key={c.id} cutout={c} wallLen={len} />
      ))}
    </group>
  );
}

/**
 * Memoized CSG solid. React.memo guarantees the boolean is only re-evaluated
 * when the wall geometry or its committed cutouts actually change — hover
 * previews and unrelated store updates never re-run the CSG.
 */
const WallCSGMesh = memo(function WallCSGMesh({
  len,
  ceilingHeight,
  cutouts,
  material,
}: {
  len: number;
  ceilingHeight: number;
  cutouts: PlacedCutout[];
  material: THREE.Material;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wallGeo = useMemo(() => {
    const geo = new THREE.BoxGeometry(WALL_THICKNESS, ceilingHeight, len);
    geo.translate(0, ceilingHeight / 2, 0);
    return geo;
  }, [len, ceilingHeight]);
  const cutoutGeos = useMemo(
    () =>
      cutouts.map((c) => {
        const dims = cutoutLocalBox(len, c);
        return new THREE.BoxGeometry(
          dims.subtraction[0],
          dims.subtraction[1],
          dims.subtraction[2]
        );
      }),
    [cutouts, len]
  );
  const cutoutPositions = useMemo(
    () => cutouts.map((c) => cutoutLocalBox(len, c).position),
    [cutouts, len]
  );

  useEffect(
    () => () => {
      wallGeo.dispose();
      cutoutGeos.forEach((g) => g.dispose());
    },
    [wallGeo, cutoutGeos]
  );

  // Imperatively disable raycasting on the CSG mesh too — its geometry is
  // transiently disposed by @react-three/csg during boolean rebuilds, and a
  // no-op raycast must be guaranteed even if the JSX prop is ever overridden.
  useEffect(() => {
    if (meshRef.current) meshRef.current.raycast = noRaycast;
  }, []);

  return (
    <mesh ref={meshRef} castShadow receiveShadow raycast={noRaycast}>
      <Geometry>
        <Base geometry={wallGeo} />
        {cutouts.map((c, i) => (
          <Subtraction
            key={c.id}
            geometry={cutoutGeos[i]}
            position={cutoutPositions[i]}
          />
        ))}
      </Geometry>
      <primitive object={material} attach="material" />
    </mesh>
  );
});

/** Renders the GLTF frame + glass panel precisely inside a carved opening. */
function CutoutFrame({ cutout, wallLen }: { cutout: PlacedCutout; wallLen: number }) {
  const theme = useDesigner((s) => s.theme);
  const kit = getThemeMaterials(theme);
  const catalog = getCatalogItem(cutout.catalogId);
  if (!catalog) return null;

  const dims = cutoutLocalBox(wallLen, cutout);

  return (
    <group position={dims.position} rotation={[0, -Math.PI / 2, 0]}>
      <ModelInstance
        url={catalog.model}
        width={cutout.width}
        standardWidth={catalog.standardWidth}
        material={kit.trim}
      />
      {catalog.hasGlass && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[cutout.width, cutout.height, 0.012]} />
          <primitive object={kit.windowGlass} attach="material" />
        </mesh>
      )}
    </group>
  );
}
