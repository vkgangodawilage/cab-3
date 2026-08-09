"use client";

import { useEffect, useMemo } from "react";
import { useDesigner } from "@/store/useStore";
import type { Wall } from "@/store/useStore";
import { segmentId } from "@/lib/placement";
import { Wall3D } from "./Wall3D";
import { WallSegment, FloorPolygon } from "./WallMesh";
import { PreviewLine } from "./PreviewLine";
import { DimensionOverlay } from "./DimensionOverlay";
import { dist } from "@/lib/geometry";
import type { Vec2 } from "@/lib/geometry";

export { WALL_HEIGHT, WALL_THICKNESS } from "./WallMesh";

export function WallBuilder() {
  const walls = useDesigner((s) => s.walls);

  // Escape cancels the active wall line: discards the preview and clears the
  // active drawing points, staying in Wall mode so a new line can be started.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      const s = useDesigner.getState();
      if (s.tool !== "wall" || !s.activeWallId) return;
      e.preventDefault();
      s.cancelActive();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {walls.map((w) => (
        <WallMesh key={w.id} wall={w} />
      ))}
      <ActiveWallPreview />
    </>
  );
}

/** Generates [a, b] wall segments (with indices) for a wall run. */
function wallSegments(wall: Wall): { a: Vec2; b: Vec2; index: number }[] {
  const segs: { a: Vec2; b: Vec2; index: number }[] = [];
  for (let i = 0; i < wall.points.length - 1; i++) {
    segs.push({ a: wall.points[i], b: wall.points[i + 1], index: i });
  }
  if (wall.closed && wall.points.length > 2) {
    segs.push({
      a: wall.points[wall.points.length - 1],
      b: wall.points[0],
      index: wall.points.length - 1,
    });
  }
  return segs;
}

function WallMesh({ wall }: { wall: Wall }) {
  const segs = useMemo(() => wallSegments(wall), [wall]);

  return (
    <group>
      {segs.map((seg) => (
        <Wall3D
          key={seg.index}
          a={seg.a}
          b={seg.b}
          segmentId={segmentId(wall.id, seg.index)}
        />
      ))}
      {wall.closed && wall.points.length >= 3 && (
        <FloorPolygon points={wall.points} />
      )}
    </group>
  );
}

function ActiveWallPreview() {
  const activeId = useDesigner((s) => s.activeWallId);
  const walls = useDesigner((s) => s.walls);
  const pending = useDesigner((s) => s.pending);
  const typedLength = useDesigner((s) => s.typedLength);
  const lockedVector = useDesigner((s) => s.lockedVector);
  const cameraMode = useDesigner((s) => s.cameraMode);

  if (!activeId) return null;
  const wall = walls.find((w) => w.id === activeId);
  if (!wall || wall.points.length === 0) return null;

  const last = wall.points[wall.points.length - 1];
  const L = parseFloat(typedLength);
  const typedValid =
    typedLength.trim().length > 0 && isFinite(L) && L > 0;

  const effEnd: Vec2 | null =
    typedValid && lockedVector
      ? { x: last.x + lockedVector.x * L, z: last.z + lockedVector.z * L }
      : pending;
  if (!effEnd) return null;
  if (dist(last, effEnd) < 1e-4 && !typedValid) return null;

  return (
    <group>
      {cameraMode === "3d" && <WallSegment a={last} b={effEnd} preview />}
      {cameraMode === "3d" && <PreviewLine points={[...wall.points, effEnd]} />}
      <DimensionOverlay a={last} />
    </group>
  );
}
