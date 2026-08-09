/**
 * Wall-anchored placement catalog. Items are GLTF models (in /public/models)
 * authored at intrinsic dimensions; `standardWidth` is the model's authored
 * width so the runtime X-scale `width / standardWidth` maps 1:1.
 */

export type CatalogCategory =
  | "pantries"
  | "appliances"
  | "base"
  | "wall"
  | "corners"
  | "doors"
  | "windows";

export type OpeningKind = "door" | "window";

export interface CatalogItem {
  id: string;
  label: string;
  /** Furniture is wall-anchored placement; opening is a CSG wall cutout. */
  kind: "furniture" | "opening";
  category: CatalogCategory;
  model: string;
  standardWidth: number;
  /** Footprint width along the wall (local X). */
  width: number;
  height: number;
  depth: number;
  /** Floor-mounted (Y = 0) or suspended wall cabinet (Y = 1.45 m). */
  elevation: "floor" | "wall";
  /** Which PBR material slot to use from the active theme kit. */
  material: "body" | "appliance";
  /* ---- opening-specific (kind === "opening") ---- */
  openingType?: OpeningKind;
  /** Bottom (sill) height of the opening (windows default to 0.9 m). */
  sillHeight?: number;
  /** Render a physical glass panel inside the frame (windows / patio doors). */
  hasGlass?: boolean;
}

export interface CatalogCategoryDef {
  id: CatalogCategory;
  label: string;
}

export const CATALOG_CATEGORIES: CatalogCategoryDef[] = [
  { id: "pantries", label: "Tall Pantries" },
  { id: "appliances", label: "Appliance Towers" },
  { id: "base", label: "Base Units" },
  { id: "wall", label: "Wall Cabinets" },
  { id: "corners", label: "Corner Units" },
  { id: "doors", label: "Doors" },
  { id: "windows", label: "Windows" },
];

export const CATALOG: CatalogItem[] = [
  {
    id: "pantry-tower",
    label: "Tall Pantry",
    kind: "furniture",
    category: "pantries",
    model: "/models/pantry_tower.glb",
    standardWidth: 0.8,
    width: 0.8,
    height: 2.1,
    depth: 0.6,
    elevation: "floor",
    material: "body",
  },
  {
    id: "pantry-tower-wide",
    label: "Wide Pantry",
    kind: "furniture",
    category: "pantries",
    model: "/models/pantry_tower.glb",
    standardWidth: 0.8,
    width: 1.2,
    height: 2.1,
    depth: 0.6,
    elevation: "floor",
    material: "body",
  },
  {
    id: "appliance-tower",
    label: "Fridge Tower",
    kind: "furniture",
    category: "appliances",
    model: "/models/appliance_tower.glb",
    standardWidth: 1.0,
    width: 1.0,
    height: 2.0,
    depth: 0.7,
    elevation: "floor",
    material: "appliance",
  },
  {
    id: "base-unit",
    label: "Base Cabinet",
    kind: "furniture",
    category: "base",
    model: "/models/base_cabinet.glb",
    standardWidth: 0.8,
    width: 0.8,
    height: 0.85,
    depth: 0.6,
    elevation: "floor",
    material: "body",
  },
  {
    id: "wall-unit",
    label: "Wall Cabinet",
    kind: "furniture",
    category: "wall",
    model: "/models/wall_unit.glb",
    standardWidth: 0.8,
    width: 0.8,
    height: 0.7,
    depth: 0.35,
    elevation: "wall",
    material: "body",
  },
  {
    id: "corner-unit",
    label: "Corner Unit",
    kind: "furniture",
    category: "corners",
    model: "/models/corner_unit.glb",
    standardWidth: 0.9,
    width: 0.9,
    height: 0.85,
    depth: 0.9,
    elevation: "floor",
    material: "body",
  },
  /* ------------------------- Wall cutout openings ------------------------- */
  {
    id: "door-interior",
    label: "Interior Door",
    kind: "opening",
    category: "doors",
    model: "/models/door_frame.glb",
    standardWidth: 0.9,
    width: 0.9,
    height: 2.1,
    depth: 0.15,
    elevation: "floor",
    material: "body",
    openingType: "door",
    sillHeight: 0,
    hasGlass: false,
  },
  {
    id: "door-patio",
    label: "Sliding Patio Door",
    kind: "opening",
    category: "doors",
    model: "/models/sliding_door.glb",
    standardWidth: 1.8,
    width: 1.8,
    height: 2.1,
    depth: 0.15,
    elevation: "floor",
    material: "body",
    openingType: "door",
    sillHeight: 0,
    hasGlass: true,
  },
  {
    id: "window-double-hung",
    label: "Double Hung Window",
    kind: "opening",
    category: "windows",
    model: "/models/window_frame.glb",
    standardWidth: 1.0,
    width: 1.0,
    height: 1.2,
    depth: 0.15,
    elevation: "floor",
    material: "body",
    openingType: "window",
    sillHeight: 0.9,
    hasGlass: true,
  },
  {
    id: "window-picture",
    label: "Picture Window",
    kind: "opening",
    category: "windows",
    model: "/models/window_frame.glb",
    standardWidth: 1.0,
    width: 1.5,
    height: 1.2,
    depth: 0.15,
    elevation: "floor",
    material: "body",
    openingType: "window",
    sillHeight: 0.9,
    hasGlass: true,
  },
];

export function getCatalogItem(id: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.id === id);
}
