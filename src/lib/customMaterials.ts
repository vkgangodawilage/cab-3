import * as THREE from "three";

export interface CustomMaterialPreset {
  id: string;
  name: string;
  category: "wood" | "matte" | "marble" | "metallic";
  bodyColor: string;
  doorColor: string;
  hardwareColor: string;
  hardwareMetalness: number;
  hardwareRoughness: number;
  roughness: number;
  metalness: number;
  swatchHex: string;
}

export const CUSTOM_MATERIALS: CustomMaterialPreset[] = [
  {
    id: "luxury-walnut",
    name: "Luxury Walnut & Brushed Gold",
    category: "wood",
    bodyColor: "#2a1c15",
    doorColor: "#3b281e",
    hardwareColor: "#d4af37",
    hardwareMetalness: 0.95,
    hardwareRoughness: 0.15,
    roughness: 0.45,
    metalness: 0.05,
    swatchHex: "#3b281e",
  },
  {
    id: "matte-obsidian",
    name: "Matte Obsidian & Rose Gold",
    category: "matte",
    bodyColor: "#121316",
    doorColor: "#1a1b20",
    hardwareColor: "#e5b869",
    hardwareMetalness: 0.92,
    hardwareRoughness: 0.18,
    roughness: 0.5,
    metalness: 0.08,
    swatchHex: "#1a1b20",
  },
  {
    id: "royal-emerald",
    name: "Royal Emerald & Satin Brass",
    category: "matte",
    bodyColor: "#0d241c",
    doorColor: "#123327",
    hardwareColor: "#f3c677",
    hardwareMetalness: 0.94,
    hardwareRoughness: 0.15,
    roughness: 0.42,
    metalness: 0.05,
    swatchHex: "#123327",
  },
  {
    id: "imperial-navy",
    name: "Imperial Navy & Polish Chrome",
    category: "matte",
    bodyColor: "#0f182a",
    doorColor: "#152138",
    hardwareColor: "#e2e8f0",
    hardwareMetalness: 0.9,
    hardwareRoughness: 0.22,
    roughness: 0.45,
    metalness: 0.05,
    swatchHex: "#152138",
  },
  {
    id: "nordic-oak",
    name: "Scandinavian Light Oak",
    category: "wood",
    bodyColor: "#be9e7a",
    doorColor: "#d2b490",
    hardwareColor: "#262626",
    hardwareMetalness: 0.85,
    hardwareRoughness: 0.3,
    roughness: 0.6,
    metalness: 0.02,
    swatchHex: "#d2b490",
  },
  {
    id: "calacatta-white",
    name: "Calacatta Pure White Marble",
    category: "marble",
    bodyColor: "#e6e4df",
    doorColor: "#f3f2ee",
    hardwareColor: "#c5a059",
    hardwareMetalness: 0.92,
    hardwareRoughness: 0.18,
    roughness: 0.2,
    metalness: 0.02,
    swatchHex: "#f3f2ee",
  },
  {
    id: "cashmere-grey",
    name: "Cashmere Grey & Copper",
    category: "matte",
    bodyColor: "#3a3734",
    doorColor: "#4f4b47",
    hardwareColor: "#b87333",
    hardwareMetalness: 0.94,
    hardwareRoughness: 0.18,
    roughness: 0.48,
    metalness: 0.05,
    swatchHex: "#4f4b47",
  },
];

export function getCustomMaterialPreset(id?: string): CustomMaterialPreset | null {
  if (!id) return null;
  return CUSTOM_MATERIALS.find((m) => m.id === id) || null;
}

export function buildCustomMaterialKit(preset: CustomMaterialPreset) {
  return {
    body: new THREE.MeshStandardMaterial({
      color: preset.bodyColor,
      roughness: preset.roughness,
      metalness: preset.metalness,
    }),
    panel: new THREE.MeshStandardMaterial({
      color: preset.doorColor,
      roughness: preset.roughness,
      metalness: preset.metalness,
    }),
    knob: new THREE.MeshStandardMaterial({
      color: preset.hardwareColor,
      roughness: preset.hardwareRoughness,
      metalness: preset.hardwareMetalness,
    }),
    crown: new THREE.MeshStandardMaterial({
      color: preset.bodyColor,
      roughness: preset.roughness,
      metalness: preset.metalness,
    }),
  };
}
