/**
 * Automatic cost estimator & Bill of Materials (BOM) engine.
 *
 * Scans every wall, cabinet run, placed GLTF item and wall cutout in the
 * Zustand store and aggregates an itemized estimate:
 *
 *   - Base Cabinets   $180/unit · $220/m  (rate per unit scales with width)
 *   - Wall Cabinets   $140/unit · $180/m
 *   - Tall Pantry / Appliance Towers      $450/unit
 *   - Countertop Slabs $250/m² (Marble +20%, Granite +10%)
 *   - Doors $300 · Windows $200
 *   - Hardware & Trim: Handles $15/unit · Toe-Kick Plinth $30/m · LED $40/m
 *
 * Cabinet runs are sub-divided with the same parametric math as the renderer
 * (`planRun`), so quantities always match what is drawn in 3D.
 */

import type { Wall, CabinetRun, PlacedItem, PlacedCutout } from "@/store/useStore";
import { touchesAnyWall } from "@/lib/kitchen";
import { planRunLayout } from "@/components/CabinetLayoutEngine";
import { runBlockedSegmentsWithCorners } from "@/lib/planning/adapters";
import { deriveEndPanels } from "@/lib/planning/endPanels";
import { getCatalogItem } from "@/lib/catalog";

export type CountertopFinish = "standard" | "marble" | "granite";

/** User-adjustable rates held in the Zustand store. */
export interface BomRates {
  countertopFinish: CountertopFinish;
  taxRate: number;
  laborRate: number;
}

export const DEFAULT_BOM_RATES: BomRates = {
  countertopFinish: "standard",
  taxRate: 0.1,
  laborRate: 0.15,
};

export interface PricingConfig {
  baseCabinetPerUnit: number;
  baseCabinetPerMeter: number;
  wallCabinetPerUnit: number;
  wallCabinetPerMeter: number;
  tallUnitPerUnit: number;
  countertopPerSqm: number;
  doorPerUnit: number;
  windowPerUnit: number;
  handlePerUnit: number;
  plinthPerMeter: number;
  ledPerMeter: number;
  endPanelPerUnit: number;
  countertopFinishMultiplier: Record<CountertopFinish, number>;
}

export const DEFAULT_PRICING: PricingConfig = {
  baseCabinetPerUnit: 180,
  baseCabinetPerMeter: 220,
  wallCabinetPerUnit: 140,
  wallCabinetPerMeter: 180,
  tallUnitPerUnit: 450,
  countertopPerSqm: 250,
  doorPerUnit: 300,
  windowPerUnit: 200,
  handlePerUnit: 15,
  plinthPerMeter: 30,
  ledPerMeter: 40,
  endPanelPerUnit: 0,
  countertopFinishMultiplier: { standard: 1.0, marble: 1.2, granite: 1.1 },
};

export interface BOMLine {
  id: string;
  category: string;
  description: string;
  dimensions: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface BOMSummary {
  subtotal: number;
  tax: number;
  labor: number;
  grandTotal: number;
}

export interface CostEstimate {
  lines: BOMLine[];
  summary: BOMSummary;
  totalsByCategory: Record<string, number>;
  baseUnits: number;
  baseMeters: number;
  wallUnits: number;
  wallMeters: number;
  tallUnits: number;
  counterSqm: number;
  doorCount: number;
  windowCount: number;
}

export interface CostInputs {
  walls: Wall[];
  cabinets: CabinetRun[];
  placedItems: PlacedItem[];
  placedCutouts: PlacedCutout[];
}

const TALL_CATALOG_IDS = new Set([
  "pantry-tower",
  "pantry-tower-wide",
  "appliance-tower",
]);
const BASE_CATALOG_IDS = new Set(["base-unit", "corner-unit"]);

export function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Prices each unit at the greater of the flat unit rate and the width rate. */
function cabinetTotal(
  widths: number[],
  perUnit: number,
  perMeter: number
): number {
  return widths.reduce((sum, w) => sum + Math.max(perUnit, perMeter * w), 0);
}

/** Absolute shoelace area (m²) of a closed polygon (world XZ). */
function polygonArea(pts: { x: number; z: number }[]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.z - b.x * a.z;
  }
  return Math.abs(s) / 2;
}

export function computeCostEstimate(
  inputs: CostInputs,
  rates: BomRates = DEFAULT_BOM_RATES,
  pricing: PricingConfig = DEFAULT_PRICING
): CostEstimate {
  const { walls, cabinets, placedItems, placedCutouts } = inputs;

  const baseWidths: number[] = [];
  const wallWidths: number[] = [];
  let tallUnits = 0;
  let counterSqm = 0;

  // ---- Run-based cabinet systems (parametric subdivision) ----------------
  const cornerBlocked = runBlockedSegmentsWithCorners(cabinets, walls, placedCutouts);
  for (const run of cabinets) {
    const isIsland = !touchesAnyWall(run, walls);
    const blocked = cornerBlocked.runs[run.id];
    const layout = planRunLayout(run.points, isIsland, blocked?.base ?? [], blocked?.top ?? []);
    for (const m of layout.base) baseWidths.push(m.width);
    for (const w of layout.wall) wallWidths.push(w.width);
    for (const wc of layout.wallCorners) wallWidths.push(wc.size);
    counterSqm += polygonArea(layout.counterOutline);
  }

  // ---- Wall-anchored placed GLTF items -----------------------------------
  for (const item of placedItems) {
    const catalog = getCatalogItem(item.catalogId);
    if (!catalog) continue;
    if (TALL_CATALOG_IDS.has(item.catalogId)) {
      tallUnits += 1;
    } else if (BASE_CATALOG_IDS.has(item.catalogId)) {
      baseWidths.push(catalog.width);
    } else if (item.catalogId === "wall-unit") {
      wallWidths.push(catalog.width);
    }
  }

  // ---- Doors & windows (wall cutouts) ------------------------------------
  let doorCount = 0;
  let windowCount = 0;
  for (const cutout of placedCutouts) {
    if (cutout.type === "door") doorCount += 1;
    else windowCount += 1;
  }

  // ---- Finished end panels (Phase 4D, derived from committed runs) --------
  const endPanelCount = deriveEndPanels(cabinets, walls, { cutouts: placedCutouts }).filter(
    (p) => p.reason === "exposed"
  ).length;

  const baseUnits = baseWidths.length;
  const wallUnits = wallWidths.length;
  const baseMeters = baseWidths.reduce((s, w) => s + w, 0);
  const wallMeters = wallWidths.reduce((s, w) => s + w, 0);

  const lines: BOMLine[] = [];
  const addLine = (
    id: string,
    category: string,
    description: string,
    dimensions: string,
    quantity: number,
    unit: string,
    unitPrice: number
  ) => {
    if (quantity <= 0.001) return;
    lines.push({
      id,
      category,
      description,
      dimensions,
      quantity,
      unit,
      unitPrice,
      total: quantity * unitPrice,
    });
  };

  if (baseUnits > 0) {
    addLine(
      "base-cabinets",
      "Base Cabinets",
      "Base Cabinets",
      `${baseUnits} units · ${baseMeters.toFixed(2)} m total`,
      baseUnits,
      "unit",
      cabinetTotal(baseWidths, pricing.baseCabinetPerUnit, pricing.baseCabinetPerMeter) / baseUnits
    );
  }
  if (wallUnits > 0) {
    addLine(
      "wall-cabinets",
      "Wall Cabinets",
      "Wall Cabinets",
      `${wallUnits} units · ${wallMeters.toFixed(2)} m total`,
      wallUnits,
      "unit",
      cabinetTotal(wallWidths, pricing.wallCabinetPerUnit, pricing.wallCabinetPerMeter) / wallUnits
    );
  }
  if (tallUnits > 0) {
    addLine(
      "tall-units",
      "Tall Pantry / Appliance Towers",
      "Tall Pantry / Appliance Towers",
      `${tallUnits} units`,
      tallUnits,
      "unit",
      pricing.tallUnitPerUnit
    );
  }
  if (counterSqm > 0.001) {
    const finish = rates.countertopFinish;
    const multiplier = pricing.countertopFinishMultiplier[finish];
    addLine(
      "countertops",
      "Countertops",
      `Countertop Slab (${finish === "standard" ? "Standard" : finish === "marble" ? "Calacatta Marble" : "Granite"})`,
      `${counterSqm.toFixed(2)} m²`,
      counterSqm,
      "m²",
      pricing.countertopPerSqm * multiplier
    );
  }
  if (doorCount > 0) {
    addLine(
      "doors",
      "Doors",
      "Door Openings (carved + framed)",
      `${doorCount} doors`,
      doorCount,
      "unit",
      pricing.doorPerUnit
    );
  }
  if (windowCount > 0) {
    addLine(
      "windows",
      "Windows",
      "Window Openings (carved + framed)",
      `${windowCount} windows`,
      windowCount,
      "unit",
      pricing.windowPerUnit
    );
  }

  const handleCount = baseUnits + wallUnits + tallUnits;
  if (handleCount > 0) {
    addLine(
      "handles",
      "Hardware & Trim",
      "Brushed Hardware Handles",
      `${handleCount} units`,
      handleCount,
      "unit",
      pricing.handlePerUnit
    );
  }
  if (baseMeters > 0.001) {
    addLine(
      "plinths",
      "Hardware & Trim",
      "Recessed Toe-Kick Plinth",
      `${baseMeters.toFixed(2)} m`,
      baseMeters,
      "m",
      pricing.plinthPerMeter
    );
  }
  if (wallMeters > 0.001) {
    addLine(
      "led-strips",
      "Hardware & Trim",
      "Under-Cabinet LED Strips (2700K)",
      `${wallMeters.toFixed(2)} m`,
      wallMeters,
      "m",
      pricing.ledPerMeter
    );
  }
  if (endPanelCount > 0) {
    addLine(
      "end-panels",
      "End Panels",
      "Finished End Panels",
      `${endPanelCount} panels · 18mm`,
      endPanelCount,
      "panel",
      pricing.endPanelPerUnit
    );
  }

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const tax = subtotal * rates.taxRate;
  const labor = subtotal * rates.laborRate;
  const grandTotal = subtotal + tax + labor;

  const totalsByCategory: Record<string, number> = {};
  for (const line of lines) {
    totalsByCategory[line.category] =
      (totalsByCategory[line.category] ?? 0) + line.total;
  }

  return {
    lines,
    summary: { subtotal, tax, labor, grandTotal },
    totalsByCategory,
    baseUnits,
    baseMeters,
    wallUnits,
    wallMeters,
    tallUnits,
    counterSqm,
    doorCount,
    windowCount,
  };
}
