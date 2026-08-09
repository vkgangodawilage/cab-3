/**
 * Material theme presets for the photorealistic kitchen visualizer.
 *
 * Each palette drives every PBR material in the scene (cabinet finishes,
 * countertop stone, hardware, glass, LED temperature, walls and floor) so a
 * single store toggle re-skins the whole 3D scene.
 */

export type MaterialTheme =
  | "luxury-dark"
  | "modern-minimal"
  | "nordic-wood"
  | "shaker-studio"
  | "graphite-studio";

export const MATERIAL_THEMES: MaterialTheme[] = [
  "luxury-dark",
  "modern-minimal",
  "nordic-wood",
  "shaker-studio",
  "graphite-studio",
];

export interface ThemePalette {
  id: MaterialTheme;
  label: string;
  /** Accent used in the UI swatch. */
  swatch: string;
  /** Canvas clear / background color. */
  background: string;

  /** Soft-touch cabinet body & door finishes. */
  cabinetBody: string;
  cabinetDoor: string;
  wallCabinet: string;
  wallDoor: string;

  /** Polished stone countertop (Calacatta / Quartz). */
  countertop: string;
  countertopRoughness: number;
  countertopMetalness: number;

  /** Brushed hardware (handles / trim). */
  hardware: string;
  hardwareRoughness: number;
  hardwareMetalness: number;

  plinth: string;
  crown: string;

  /** Smoked glass for display cabinets. */
  glassTint: string;
  glassInterior: string;

  /** Interior wall paint & floor finishes. */
  wallPaint: string;
  wallPaintRoughness: number;
  floor: string;
  floorInterior: string;

  /** Under-cabinet LED strip temperature + intensity. */
  led: string;
  ledIntensity: number;
}

export const THEME_PALETTES: Record<MaterialTheme, ThemePalette> = {
  "luxury-dark": {
    id: "luxury-dark",
    label: "Luxury Dark",
    swatch: "#c9a227",
    background: "#0b1020",

    cabinetBody: "#1b1b21",
    cabinetDoor: "#232329",
    wallCabinet: "#25252c",
    wallDoor: "#2c2c34",

    countertop: "#f3ede3",
    countertopRoughness: 0.12,
    countertopMetalness: 0.08,

    hardware: "#c9a227",
    hardwareRoughness: 0.22,
    hardwareMetalness: 0.92,

    plinth: "#121318",
    crown: "#18181d",

    glassTint: "#0d0f15",
    glassInterior: "#ffd9a8",

    wallPaint: "#dfd8cc",
    wallPaintRoughness: 0.92,
    floor: "#171c26",
    floorInterior: "#20242e",

    led: "#ffb066",
    ledIntensity: 45,
  },

  "modern-minimal": {
    id: "modern-minimal",
    label: "Modern Minimal",
    swatch: "#e8e6e1",
    background: "#0e141d",

    cabinetBody: "#c9c5be",
    cabinetDoor: "#d4d0c9",
    wallCabinet: "#cfcbc4",
    wallDoor: "#dcd8d1",

    countertop: "#f8f6f3",
    countertopRoughness: 0.16,
    countertopMetalness: 0.02,

    hardware: "#232326",
    hardwareRoughness: 0.32,
    hardwareMetalness: 0.82,

    plinth: "#98948c",
    crown: "#b7b3ac",

    glassTint: "#101318",
    glassInterior: "#ffe6c4",

    wallPaint: "#ece9e2",
    wallPaintRoughness: 0.9,
    floor: "#181d26",
    floorInterior: "#1f2530",

    led: "#ffcf9e",
    ledIntensity: 40,
  },

  "nordic-wood": {
    id: "nordic-wood",
    label: "Nordic Wood",
    swatch: "#96744f",
    background: "#131210",

    cabinetBody: "#7f6146",
    cabinetDoor: "#8d6d4e",
    wallCabinet: "#977556",
    wallDoor: "#a4805f",

    countertop: "#efe8da",
    countertopRoughness: 0.2,
    countertopMetalness: 0.02,

    hardware: "#b9bdc2",
    hardwareRoughness: 0.28,
    hardwareMetalness: 0.86,

    plinth: "#57422f",
    crown: "#6c5439",

    glassTint: "#15120e",
    glassInterior: "#ffe0b8",

    wallPaint: "#f0ece4",
    wallPaintRoughness: 0.88,
    floor: "#1e1b17",
    floorInterior: "#25211b",

    led: "#ffd2a6",
    ledIntensity: 40,
  },

  "shaker-studio": {
    id: "shaker-studio",
    label: "Shaker Studio",
    swatch: "#d5d8de",
    background: "#f5f2ec",

    cabinetBody: "#c8cad0",
    cabinetDoor: "#ced1d8",
    wallCabinet: "#c8cad0",
    wallDoor: "#ced1d8",

    countertop: "#f8f6f2",
    countertopRoughness: 0.08,
    countertopMetalness: 0.02,

    hardware: "#1a1a1a",
    hardwareRoughness: 0.18,
    hardwareMetalness: 0.92,

    plinth: "#b8bbc1",
    crown: "#c8cad0",

    glassTint: "#c4c8cf",
    glassInterior: "#fffef8",

    wallPaint: "#f0ede6",
    wallPaintRoughness: 0.88,
    floor: "#ede9e0",
    floorInterior: "#e8e4da",

    led: "#ffe3b8",
    ledIntensity: 45,
  },

  "graphite-studio": {
    id: "graphite-studio",
    label: "Graphite Studio",
    swatch: "#3d3d42",
    background: "#f0ede8",

    // Base cabinets: warm off-white gloss (like the image lower cabinets)
    cabinetBody: "#e8e4de",
    cabinetDoor: "#f0ece6",

    // Wall cabinets: dark graphite (like the image upper cabinets)
    wallCabinet: "#3d3d42",
    wallDoor: "#48484e",

    // Dark slate countertop (charcoal quartz)
    countertop: "#4a4a52",
    countertopRoughness: 0.08,
    countertopMetalness: 0.06,

    // Brushed steel handles
    hardware: "#a0a4ac",
    hardwareRoughness: 0.25,
    hardwareMetalness: 0.88,

    plinth: "#d0ccc5",
    crown: "#3d3d42",

    glassTint: "#1c1c22",
    glassInterior: "#ffe8c0",

    // Light warm wall paint (bright white walls like image)
    wallPaint: "#f5f2ec",
    wallPaintRoughness: 0.92,
    floor: "#3a3832",
    floorInterior: "#2c2a27",

    // Warm under-cabinet LED
    led: "#ffe0a0",
    ledIntensity: 50,
  },
};
