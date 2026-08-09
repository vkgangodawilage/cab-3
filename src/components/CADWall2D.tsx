"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { useDesigner } from "@/store/useStore";
import type { PlacedCutout, Wall } from "@/store/useStore";
import { segmentsOf, dist } from "@/lib/geometry";
import type { Vec2 } from "@/lib/geometry";
import { segmentId } from "@/lib/placement";
import { positionAlongWall } from "@/lib/cutouts";
import { WALL_THICKNESS } from "./WallMesh";

const Y_FILL = 2.88; // just above wall tops, below dimension lines
const FILL = "#e2e8f0"; // light grey interior fill
const BORDER = "#1e293b"; // dark crisp outline
const BORDER_WIDTH = 2.5; // screen-space pixels — stays crisp at any zoom
const SELECT_FILL = "#3b82f6"; // blue selection fill
const SELECT_BORDER = "#1d4ed8"; // blue selection outline
const SELECT_WIDTH = 3;

/**
 * Bold 2D CAD wall rendering. Each wall segment is drawn as a solid filled
 * polygon (0.15 m thick) with a thick dark outline, and door/window cutouts
 * are carved out of the fill so openings read as gaps in the plan. All
 * linework is Drei <Line> (screen-space width) so it stays razor-sharp at any
 * zoom, and every element is non-raycastable so 2D drawing is unaffected.
 */
export function CADWall2D() {
  const mode = useDesigner((s) => s.cameraMode);
  const walls = useDesigner((s) => s.walls);
  const placedCutouts = useDesigner((s) => s.placedCutouts);

  if (mode !== "2d") return null;

  return (
    <group>
      {walls.map((wall) => (
        <Wall2D key={wall.id} wall={wall} cutouts={placedCutouts} />
      ))}
    </group>
  );
}

function Wall2D({ wall, cutouts }: { wall: Wall; cutouts: PlacedCutout[] }) {
  const segs = useMemo(
    () => segmentsOf(wall.points, wall.closed),
    [wall.points, wall.closed]
  );
  return (
    <group>
      {segs.map(([a, b], i) => (
        <WallSegment2D
          key={i}
          a={a}
          b={b}
          segId={segmentId(wall.id, i)}
          cutouts={cutouts}
        />
      ))}
    </group>
  );
}

function WallSegment2D({
  a,
  b,
  segId,
  cutouts,
}: {
  a: Vec2;
  b: Vec2;
  segId: string;
  cutouts: PlacedCutout[];
}) {
  const tool = useDesigner((s) => s.tool);
  const activeCatalogItem = useDesigner((s) => s.activeCatalogItem);
  const selected = useDesigner((s) => s.selectedWallId === segId);
  const selectWall = useDesigner((s) => s.selectWall);
  const placeCutout = useDesigner((s) => s.placeCutout);

  const openingActive = activeCatalogItem?.kind === "opening";
  // Interactive only in Select / opening placement — never intercepts drawing.
  const interactive = tool === "select" || openingActive;

  const { fillGeo, outline, holeOutlines } = useMemo(() => {
    const len = dist(a, b);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = { x: dx / len, z: dz / len };
    const perp = { x: -d.z, z: d.x };
    const t = WALL_THICKNESS;

    // Footprint corners (world XZ).
    const hx = perp.x * (t / 2);
    const hz = perp.z * (t / 2);
    const c1: [number, number] = [a.x + hx, a.z + hz];
    const c2: [number, number] = [b.x + hx, b.z + hz];
    const c3: [number, number] = [b.x - hx, b.z - hz];
    const c4: [number, number] = [a.x - hx, a.z - hz];

    const shape = new THREE.Shape();
    shape.moveTo(c1[0], c1[1]);
    shape.lineTo(c2[0], c2[1]);
    shape.lineTo(c3[0], c3[1]);
    shape.lineTo(c4[0], c4[1]);
    shape.closePath();

    // Carve door/window openings out of the fill.
    const holeOutlines: [number, number, number][][] = [];
    for (const cutout of cutouts) {
      if (cutout.wallId !== segId) continue;
      const px = a.x + d.x * cutout.positionOnWall;
      const pz = a.z + d.z * cutout.positionOnWall;
      const hw = cutout.width / 2;
      const hp = t / 2 + 0.02;
      const corners: [number, number][] = [
        [px + d.x * hw + perp.x * hp, pz + d.z * hw + perp.z * hp],
        [px + d.x * hw - perp.x * hp, pz + d.z * hw - perp.z * hp],
        [px - d.x * hw - perp.x * hp, pz - d.z * hw - perp.z * hp],
        [px - d.x * hw + perp.x * hp, pz - d.z * hw + perp.z * hp],
      ];
      const hole = new THREE.Path();
      hole.moveTo(corners[0][0], corners[0][1]);
      hole.lineTo(corners[1][0], corners[1][1]);
      hole.lineTo(corners[2][0], corners[2][1]);
      hole.lineTo(corners[3][0], corners[3][1]);
      hole.closePath();
      shape.holes.push(hole);
      holeOutlines.push(
        corners.map((c) => [c[0], Y_FILL, c[1]] as [number, number, number])
      );
    }

    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);

    const outline: [number, number, number][] = [
      [c1[0], Y_FILL, c1[1]],
      [c2[0], Y_FILL, c2[1]],
      [c3[0], Y_FILL, c3[1]],
      [c4[0], Y_FILL, c4[1]],
      [c1[0], Y_FILL, c1[1]],
    ];

    return { fillGeo: geo, outline, holeOutlines };
  }, [a, b, segId, cutouts]);

  useEffect(() => () => fillGeo.dispose(), [fillGeo]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (openingActive) {
      placeCutout(segId, positionAlongWall({ a, b }, { x: e.point.x, z: e.point.z }));
    } else {
      selectWall(segId);
    }
  };

  const borderColor = selected ? SELECT_BORDER : BORDER;
  const borderWidth = selected ? SELECT_WIDTH : BORDER_WIDTH;

  return (
    <group>
      <mesh
        geometry={fillGeo}
        raycast={interactive ? undefined : () => null}
        onClick={interactive ? handleClick : undefined}
      >
        <meshBasicMaterial
          color={selected ? SELECT_FILL : FILL}
          transparent={selected}
          opacity={selected ? 0.6 : 1}
        />
      </mesh>
      <Line points={outline} color={borderColor} lineWidth={borderWidth} raycast={() => null} />
      {holeOutlines.map((pts, i) => (
        <Line key={i} points={[...pts, pts[0]]} color={borderColor} lineWidth={borderWidth} raycast={() => null} />
      ))}
    </group>
  );
}
