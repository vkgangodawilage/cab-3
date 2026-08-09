"use client";

import { useEffect, useMemo } from "react";
import { useDesigner } from "@/store/useStore";
import type { CabinetRun, Wall } from "@/store/useStore";
import { getThemeMaterials } from "./CabinetModel";
import { PreviewLine } from "./PreviewLine";
import { DimensionOverlay } from "./DimensionOverlay";
import {
  BASE_HEIGHT,
  COUNTER_THICKNESS,
  WALL_CABINET_DEPTH,
  WALL_CABINET_ELEVATION,
  WALL_CABINET_HEIGHT,
  touchesAnyWall,
} from "@/lib/kitchen";
import {
  planRunLayout,
  BaseCabinetRun,
  WallCabinetRun,
} from "./CabinetLayoutEngine";
import { dist } from "@/lib/geometry";
import type { Vec2 } from "@/lib/geometry";

export function ProceduralCabinetRow() {
  const runs = useDesigner((s) => s.cabinets);
  const walls = useDesigner((s) => s.walls);

  // Escape cancels the active cabinet baseline: discards the preview and
  // clears the active drawing points, staying in Cabinet mode so a new run
  // can be started.
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
      if (s.tool !== "kitchen" || !s.activeCabinetId) return;
      e.preventDefault();
      s.cancelActive();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {runs.map((run) => (
        <CabinetRunMesh key={run.id} run={run} walls={walls} />
      ))}
      <ActiveCabinetPreview />
    </>
  );
}

function CabinetRunMesh({ run, walls }: { run: CabinetRun; walls: Wall[] }) {
  const selectCabinet = useDesigner((s) => s.selectCabinet);
  const selectedCabinetId = useDesigner((s) => s.selectedCabinetId);
  const tool = useDesigner((s) => s.tool);
  const cameraMode = useDesigner((s) => s.cameraMode);

  const isIsland = useMemo(() => !touchesAnyWall(run, walls), [run, walls]);
  const layout = useMemo(
    () => planRunLayout(run.points, isIsland),
    [run.points, isIsland]
  );

  const baseHeight = run.baseHeight ?? BASE_HEIGHT;
  const wallHeight = run.wallHeight ?? WALL_CABINET_HEIGHT;
  const wallElevation = run.wallElevation ?? WALL_CABINET_ELEVATION;
  const customMaterialId = run.customMaterialId;
  const isSelected = selectedCabinetId === run.id;

  const handleClick = (e: any) => {
    if (cameraMode === "3d" && tool === "select") {
      e.stopPropagation();
      selectCabinet(run.id);
    }
  };

  return (
    <group onClick={handleClick}>
      {/* Solid modular base cabinets + seamless countertop (from the engine). */}
      <BaseCabinetRun
        points={run.points}
        isIsland={isIsland}
        baseHeight={baseHeight}
        customMaterialId={customMaterialId}
      />

      {/* Modern upper wall cabinets, synced over the base modules. */}
      <WallCabinetRun
        points={run.points}
        isIsland={isIsland}
        wallHeight={wallHeight}
        wallElevation={wallElevation}
        customMaterialId={customMaterialId}
      />

      {/* Waterfall edges on the free slab ends of island runs. */}
      {isIsland &&
        layout.counters.map(
          (c, i) =>
            !c.isCornerTile && (
              <WaterfallEdge
                key={`wf-${i}`}
                position={[c.x, 0, c.z]}
                rotationY={c.rotationY}
                width={c.width}
                depth={c.depth}
                height={baseHeight + COUNTER_THICKNESS}
              />
            )
        )}

      {isSelected && (
        <group>
          {layout.counters.map((c, i) => (
            <mesh
              key={`sel-${i}`}
              position={[c.x, (baseHeight + COUNTER_THICKNESS) / 2, c.z]}
              rotation={[0, c.rotationY, 0]}
            >
              <boxGeometry
                args={[
                  c.width + 0.05,
                  baseHeight + COUNTER_THICKNESS + 0.05,
                  c.depth + 0.05,
                ]}
              />
              <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.6} depthWrite={false} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Architectural detail components                                            */
/* -------------------------------------------------------------------------- */

/** Waterfall marble edge — vertical slab dropped to the floor on both side
 *  edges of an island run. */
function WaterfallEdge({
  position,
  rotationY,
  width,
  depth,
  height,
}: {
  position: [number, number, number];
  rotationY: number;
  width: number;
  depth: number;
  height?: number;
}) {
  const theme = useDesigner((s) => s.theme);
  const kit = getThemeMaterials(theme);
  const effHeight = height ?? (BASE_HEIGHT + COUNTER_THICKNESS);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[width / 2, effHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.02, effHeight, depth]} />
        <primitive object={kit.countertop} attach="material" />
      </mesh>
      <mesh position={[-width / 2, effHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.02, effHeight, depth]} />
        <primitive object={kit.countertop} attach="material" />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Live drawing preview                                                        */
/* -------------------------------------------------------------------------- */

function ActiveCabinetPreview() {
  const activeId = useDesigner((s) => s.activeCabinetId);
  const cabinets = useDesigner((s) => s.cabinets);
  const pending = useDesigner((s) => s.pending);
  const walls = useDesigner((s) => s.walls);
  const typedLength = useDesigner((s) => s.typedLength);
  const lockedVector = useDesigner((s) => s.lockedVector);
  const cameraMode = useDesigner((s) => s.cameraMode);

  if (!activeId) return null;
  const run = cabinets.find((c) => c.id === activeId);
  if (!run || run.points.length === 0) return null;

  const last = run.points[run.points.length - 1];
  const L = parseFloat(typedLength);
  const typedValid =
    typedLength.trim().length > 0 && isFinite(L) && L > 0;

  const effEnd: Vec2 | null =
    typedValid && lockedVector
      ? { x: last.x + lockedVector.x * L, z: last.z + lockedVector.z * L }
      : pending;
  if (!effEnd) return null;
  if (dist(last, effEnd) < 1e-4 && !typedValid) return null;

  const previewRun: CabinetRun = { ...run, points: [...run.points, effEnd] };
  const isIsland = !touchesAnyWall(previewRun, walls);
  const layout = planRunLayout(previewRun.points, isIsland);

  return (
    <group>
      {cameraMode === "3d" && <PreviewLine points={[...run.points, effEnd]} />}
      {cameraMode === "3d" &&
        layout.base.map((p, i) => (
          <GhostCabinet
            key={`gb-${i}`}
            position={[p.x, 0, p.z]}
            rotationY={p.rotationY}
            width={p.width}
            depth={p.depth}
            height={BASE_HEIGHT}
            color={p.kind === "l-corner" ? "#fbbf24" : "#22d3ee"}
          />
        ))}
      {cameraMode === "3d" &&
        !isIsland &&
        layout.wall.map((p, i) => (
          <GhostCabinet
            key={`gw-${i}`}
            position={[p.x, WALL_CABINET_ELEVATION + WALL_CABINET_HEIGHT / 2, p.z]}
            rotationY={p.rotationY}
            width={p.width}
            depth={WALL_CABINET_DEPTH}
            height={WALL_CABINET_HEIGHT}
            color="#67e8f9"
          />
        ))}
      {cameraMode === "3d" &&
        !isIsland &&
        layout.wallCorners.map((p, i) => (
          <GhostCabinet
            key={`gwc-${i}`}
            position={[p.x, WALL_CABINET_ELEVATION + WALL_CABINET_HEIGHT / 2, p.z]}
            rotationY={p.rotationY}
            width={p.size}
            depth={p.size}
            height={WALL_CABINET_HEIGHT}
            color="#fbbf24"
          />
        ))}
      <DimensionOverlay a={last} />
    </group>
  );
}

function GhostCabinet({
  position,
  rotationY,
  width,
  depth,
  height,
  color,
}: {
  position: [number, number, number];
  rotationY: number;
  width: number;
  depth: number;
  height: number;
  color: string;
}) {
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <boxGeometry args={[width, height, depth]} />
      <meshBasicMaterial
        transparent
        opacity={0.35}
        color={color}
        depthWrite={false}
      />
    </mesh>
  );
}
