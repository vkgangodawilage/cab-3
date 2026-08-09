"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useDesigner } from "@/store/useStore";
import { getThemeMaterials } from "./CabinetModel";
import { getCustomMaterialPreset, buildCustomMaterialKit } from "@/lib/customMaterials";
import { registerObject } from "@/lib/three/measureRegistry";
import type { EndPanelPlan } from "@/lib/planning/endPanels";

/**
 * Phase 4D — renders a single finished end panel as real geometry.
 *
 * The panel is a thin vertical slab derived from the committed run plan. Its
 * material inherits the run's finish: custom material preset -> `panel` colour,
 * otherwise the cabinet door face (`door` for base, `wallDoor` for wall). The
 * root is registered in the runtime registry (deterministic id) so a future
 * phase can verify planned vs actual panel geometry.
 */
export function EndPanel3D({
  plan,
  customMaterialId,
}: {
  plan: EndPanelPlan;
  customMaterialId?: string;
}) {
  const theme = useDesigner((s) => s.theme);

  const material = useMemo(() => {
    if (customMaterialId) {
      const preset = getCustomMaterialPreset(customMaterialId);
      if (preset) return buildCustomMaterialKit(preset).panel;
    }
    const kit = getThemeMaterials(theme);
    return plan.material === "wallDoor" ? kit.wallDoor : kit.door;
  }, [theme, plan.material, customMaterialId]);

  return (
    <group
      position={plan.position}
      rotation={[0, plan.rotationY, 0]}
      ref={(el) => registerObject(plan.id, el)}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[plan.thicknessM, plan.heightM, plan.depthM]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
}
