"use client";

import { useDesigner } from "@/store/useStore";
import { getWallSegment } from "@/lib/placement";
import { clampOpeningCenter } from "@/lib/cutouts";
import { dist } from "@/lib/geometry";
import { WALL_THICKNESS } from "@/constants/dimensions";

const PREVIEW_COLOR = "#22d3ee";

/**
 * Live ghost preview for door / window cutouts.
 *
 * Uses the wall mesh hover state (cutoutPreview) to show a translucent opening
 * box snapped to the wall baseline, elevation-locked to the item's sill. This
 * is a plain box — it never runs a CSG boolean, so hovering stays smooth.
 */
export function DoorWindowPlacementEngine() {
  const activeCatalogItem = useDesigner((s) => s.activeCatalogItem);
  const cutoutPreview = useDesigner((s) => s.cutoutPreview);
  const walls = useDesigner((s) => s.walls);

  if (!activeCatalogItem || activeCatalogItem.kind !== "opening") return null;
  if (!cutoutPreview) return null;

  const seg = getWallSegment(walls, cutoutPreview.wallId);
  if (!seg) return null;

  const len = dist(seg.a, seg.b);
  const t = clampOpeningCenter(
    len,
    activeCatalogItem.width,
    cutoutPreview.positionOnWall
  );
  const sill =
    activeCatalogItem.openingType === "window"
      ? activeCatalogItem.sillHeight ?? 0.9
      : 0;

  const rotY = Math.atan2(seg.b.x - seg.a.x, seg.b.z - seg.a.z);
  const cx = (seg.a.x + seg.b.x) / 2;
  const cz = (seg.a.z + seg.b.z) / 2;
  const cy = sill + activeCatalogItem.height / 2;
  const localZ = t - len / 2;

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
      <mesh position={[0, cy, localZ]}>
        <boxGeometry args={[WALL_THICKNESS + 0.07, activeCatalogItem.height, activeCatalogItem.width]} />
        <meshBasicMaterial
          color={PREVIEW_COLOR}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, cy, localZ]}>
        <boxGeometry args={[WALL_THICKNESS + 0.09, activeCatalogItem.height + 0.03, activeCatalogItem.width + 0.03]} />
        <meshBasicMaterial
          wireframe
          color={PREVIEW_COLOR}
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
