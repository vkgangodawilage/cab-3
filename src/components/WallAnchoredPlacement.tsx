"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useDesigner } from "@/store/useStore";
import type { PlacedItem } from "@/store/useStore";
import { getCatalogItem } from "@/lib/catalog";
import { computeWallAnchoredPlacement, getWallSegment } from "@/lib/placement";
import { getThemeMaterials, ModelInstance } from "./CabinetModel";
import { getCustomMaterialPreset } from "@/lib/customMaterials";
import type { Vec2 } from "@/lib/geometry";

const PREVIEW_COLOR = "#22d3ee";

/**
 * Wall-anchored placement:
 *  - Slides the armed catalog item strictly along the selected wall's length
 *    axis (cursor projected onto the wall line).
 *  - Auto-orients it to face OUT of the wall (item local +Z = wall normal)
 *    and snaps elevation to the floor (Y=0) or suspended height (Y=1.45 m).
 *  - Renders committed placed items and the live ghost preview.
 */
export function WallAnchoredPlacement() {
  const activeCatalogItem = useDesigner((s) => s.activeCatalogItem);
  const selectedWallId = useDesigner((s) => s.selectedWallId);
  const walls = useDesigner((s) => s.walls);
  const pointer = useDesigner((s) => s.pointer);
  const placedItems = useDesigner((s) => s.placedItems);
  const placementSide = useDesigner((s) => s.placementSide);
  const setPlacementSide = useDesigner((s) => s.setPlacementSide);

  const seg = useMemo(
    () => (selectedWallId ? getWallSegment(walls, selectedWallId) : null),
    [walls, selectedWallId]
  );

  const result = useMemo(() => {
    if (activeCatalogItem?.kind !== "furniture" || !seg || !pointer) return null;
    return computeWallAnchoredPlacement(seg, activeCatalogItem, pointer, placementSide);
  }, [activeCatalogItem, seg, pointer, placementSide]);

  // Persist the current anchor side so the committed item matches the preview.
  useEffect(() => {
    if (result && result.side !== placementSide) setPlacementSide(result.side);
  }, [result, placementSide, setPlacementSide]);

  return (
    <group>
      {placedItems.map((item) => (
        <PlacedItemMesh key={item.id} item={item} />
      ))}

      {activeCatalogItem && activeCatalogItem.kind === "furniture" && result && seg && (
        <>
          <WallBaseline a={seg.a} b={seg.b} />
          <PreviewItem result={result} item={activeCatalogItem} />
        </>
      )}
    </group>
  );
}

/** Committed catalog item rendered from its GLTF model or custom PBR material. */
function PlacedItemMesh({ item }: { item: PlacedItem }) {
  const theme = useDesigner((s) => s.theme);
  const kit = getThemeMaterials(theme);
  const selectedItemId = useDesigner((s) => s.selectedItemId);
  const selectItem = useDesigner((s) => s.selectItem);
  const tool = useDesigner((s) => s.tool);
  const cameraMode = useDesigner((s) => s.cameraMode);
  const catalog = getCatalogItem(item.catalogId);
  if (!catalog) return null;

  const isSelected = selectedItemId === item.id;
  const itemWidth = item.customWidth ?? catalog.width;
  const itemHeight = item.customHeight ?? catalog.height;
  const itemDepth = item.customDepth ?? catalog.depth;

  // Custom height offset if elevation or height changed
  const basePos = item.position;
  const posY = item.customElevation !== undefined
    ? item.customElevation + itemHeight / 2
    : basePos[1];
  const pos: [number, number, number] = [basePos[0], posY, basePos[2]];

  const customMat = getCustomMaterialPreset(item.customMaterialId);
  const material = customMat
    ? new THREE.MeshStandardMaterial({
        color: customMat.doorColor,
        roughness: customMat.roughness,
        metalness: customMat.metalness,
      })
    : catalog.material === "appliance"
    ? kit.appliance
    : kit.body;

  const handleClick = (e: any) => {
    if (cameraMode === "3d" && tool === "select") {
      e.stopPropagation();
      selectItem(item.id);
    }
  };

  return (
    <group position={pos} rotation={[0, item.rotationY, 0]} onClick={handleClick}>
      <ModelInstance
        url={catalog.model}
        width={itemWidth}
        standardWidth={catalog.standardWidth}
        material={material}
      />
      {isSelected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[itemWidth + 0.05, itemHeight + 0.05, itemDepth + 0.05]} />
          <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Translucent ghost box sliding along the wall during placement. */
function PreviewItem({
  result,
  item,
}: {
  result: { position: [number, number, number]; rotationY: number };
  item: { width: number; height: number; depth: number };
}) {
  return (
    <group position={result.position} rotation={[0, result.rotationY, 0]}>
      <mesh>
        <boxGeometry args={[item.width, item.height, item.depth]} />
        <meshBasicMaterial
          transparent
          opacity={0.4}
          color={PREVIEW_COLOR}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** Cyan strip marking the slide range along the selected wall. */
function WallBaseline({ a, b }: { a: Vec2; b: Vec2 }) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 1e-4) return null;
  const rotY = Math.atan2(b.x - a.x, b.z - a.z);
  return (
    <mesh
      position={[(a.x + b.x) / 2, 0.012, (a.z + b.z) / 2]}
      rotation={[0, rotY, 0]}
    >
      <boxGeometry args={[0.06, 0.02, len]} />
      <meshBasicMaterial
        color={PREVIEW_COLOR}
        transparent
        opacity={0.6}
        depthWrite={false}
      />
    </mesh>
  );
}
