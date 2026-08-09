"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { Box, ChevronDown, Grid3x3, Palette } from "lucide-react";
import { useDesigner } from "@/store/useStore";
import { computeCostEstimate } from "@/utils/costCalculator";
import { MATERIAL_THEMES, THEME_PALETTES } from "@/lib/themes";

const SHORTCUTS = [
  { keys: "W", label: "Draw Walls" },
  { keys: "K", label: "Draw Kitchen" },
  { keys: "ESC", label: "Cancel" },
  { keys: "123", label: "Type length" },
  { keys: "/", label: "Switch 2D/3D" },
];

/**
 * Ultra-minimal HUD with theme picker, view toggle, and cost estimator.
 */
export function MinimalHUD() {
  const isUiVisible = useDesigner((s) => s.isUiVisible);
  const setBomOpen = useDesigner((s) => s.setBomOpen);
  const cameraMode = useDesigner((s) => s.cameraMode);
  const toggleCameraMode = useDesigner((s) => s.toggleCameraMode);
  const theme = useDesigner((s) => s.theme);
  const setTheme = useDesigner((s) => s.setTheme);
  const walls = useDesigner((s) => s.walls);
  const cabinets = useDesigner((s) => s.cabinets);
  const placedItems = useDesigner((s) => s.placedItems);
  const placedCutouts = useDesigner((s) => s.placedCutouts);
  const bomRates = useDesigner((s) => s.bomRates);

  const grandTotal = useMemo(
    () =>
      computeCostEstimate(
        { walls, cabinets, placedItems, placedCutouts },
        bomRates
      ).summary.grandTotal,
    [walls, cabinets, placedItems, placedCutouts, bomRates]
  );
  const price = `$${Math.round(grandTotal).toLocaleString("en-US")}`;

  return (
    <div
      className={clsx(
        "transition-opacity duration-300",
        isUiVisible ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      {/* Bottom-left shortcut badges */}
      <div className="pointer-events-none fixed bottom-3 left-3 z-20 flex flex-wrap items-center gap-1.5">
        {SHORTCUTS.map((sc) => (
          <div
            key={sc.keys}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900/40 px-2 py-1 backdrop-blur-sm"
          >
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-slate-100">
              {sc.keys}
            </kbd>
            <span className="text-[10px] text-slate-400">{sc.label}</span>
          </div>
        ))}
      </div>

      {/* Top-left Style/Theme Picker */}
      <div className="fixed left-3 top-3 z-20 flex items-center gap-1">
        <div className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1 shadow-lg">
          <div className="flex items-center gap-1 px-2.5 text-slate-400 text-xs font-semibold">
            <Palette size={13} className="text-cyan-300" />
            <span className="hidden sm:inline text-white text-[11px] uppercase tracking-wider">Style</span>
          </div>
          <div className="flex items-center gap-0.5">
            {MATERIAL_THEMES.map((tId) => {
              const pal = THEME_PALETTES[tId];
              const active = theme === tId;
              return (
                <button
                  key={tId}
                  onClick={() => setTheme(tId)}
                  title={`Switch style to: ${pal.label}`}
                  style={{ backgroundColor: pal.swatch }}
                  className={clsx(
                    "h-6 w-6 rounded-full border transition-all duration-250",
                    active
                      ? "border-cyan-400 scale-110 ring-2 ring-cyan-400/40"
                      : "border-white/15 hover:scale-105"
                  )}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Top-right: view toggle badge + price pill */}
      <div className="fixed right-3 top-3 z-20 flex items-center gap-1.5">
        <button
          onClick={toggleCameraMode}
          title={`Switch to ${cameraMode === "2d" ? "3D" : "2D"} (/)`}
          className="glass pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors hover:border-white/20"
        >
          {cameraMode === "2d" ? (
            <Grid3x3 size={14} className="text-cyan-300" />
          ) : (
            <Box size={14} className="text-cyan-300" />
          )}
          <span className="font-mono font-semibold text-white">
            {cameraMode === "2d" ? "2D" : "3D"}
          </span>
        </button>
        <button
          onClick={() => setBomOpen(true)}
          title="Open cost estimate / BOM (click)"
          className="glass pointer-events-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-colors hover:border-white/20"
        >
          <span className="font-mono font-semibold text-white">{price}</span>
          <ChevronDown size={14} className="text-slate-400" />
        </button>
      </div>
    </div>
  );
}

