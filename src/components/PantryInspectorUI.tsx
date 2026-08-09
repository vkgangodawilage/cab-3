"use client";

import { useDesigner } from "@/store/useStore";
import { CUSTOM_MATERIALS } from "@/lib/customMaterials";
import { getCatalogItem } from "@/lib/catalog";
import { Trash2, X, Sliders, Palette } from "lucide-react";
import clsx from "clsx";

export function PantryInspectorUI() {
  const selectedItemId = useDesigner((s) => s.selectedItemId);
  const selectedCabinetId = useDesigner((s) => s.selectedCabinetId);
  const placedItems = useDesigner((s) => s.placedItems);
  const cabinets = useDesigner((s) => s.cabinets);
  const selectItem = useDesigner((s) => s.selectItem);
  const selectCabinet = useDesigner((s) => s.selectCabinet);
  const updatePlacedItem = useDesigner((s) => s.updatePlacedItem);
  const updateCabinetRun = useDesigner((s) => s.updateCabinetRun);
  const deletePlacedItem = useDesigner((s) => s.deletePlacedItem);
  const deleteCabinetRun = useDesigner((s) => s.deleteCabinetRun);
  const isUiVisible = useDesigner((s) => s.isUiVisible);

  if (!isUiVisible) return null;
  if (!selectedItemId && !selectedCabinetId) return null;

  const item = selectedItemId ? placedItems.find((i) => i.id === selectedItemId) : null;
  const cabinet = selectedCabinetId ? cabinets.find((c) => c.id === selectedCabinetId) : null;
  const catalogItem = item ? getCatalogItem(item.catalogId) : null;

  const handleClose = () => {
    selectItem(null);
    selectCabinet(null);
  };

  return (
    <div className="fixed right-4 top-16 z-30 glass w-80 rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-slate-100 shadow-2xl backdrop-blur-md transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-4">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
          <Sliders size={14} />
          Pantry Inspector
        </span>
        <button
          onClick={handleClose}
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {/* Item Inspector */}
      {item && catalogItem && (
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-slate-400">Selected Item</div>
            <div className="text-sm font-semibold text-white">{catalogItem.label}</div>
          </div>

          {/* Premium Material Picker */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-slate-400">
              <Palette size={12} className="text-cyan-400" />
              Pantry Material & Finish
            </div>
            <div className="grid grid-cols-7 gap-2">
              {CUSTOM_MATERIALS.map((mat) => {
                const active = item.customMaterialId === mat.id;
                return (
                  <button
                    key={mat.id}
                    onClick={() => updatePlacedItem(item.id, { customMaterialId: mat.id })}
                    title={mat.name}
                    style={{ backgroundColor: mat.swatchHex }}
                    className={clsx(
                      "h-8 w-8 rounded-full border transition-all duration-200",
                      active
                        ? "border-cyan-400 scale-110 ring-2 ring-cyan-400/40"
                        : "border-white/10 hover:scale-105"
                    )}
                  />
                );
              })}
            </div>
          </div>

          {/* Dimensions Sliders */}
          <div className="space-y-3 border-t border-white/10 pt-3">
            <div className="text-xs font-semibold text-cyan-300">Adjust Dimensions (උස සහ මිනුම් වෙනස් කරන්න)</div>

            {/* Width */}
            <div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Width (පළල)</span>
                <span className="font-mono text-white">{(item.customWidth ?? catalogItem.width).toFixed(2)} m</span>
              </div>
              <input
                type="range"
                min="0.30"
                max="2.40"
                step="0.05"
                value={item.customWidth ?? catalogItem.width}
                onChange={(e) => updatePlacedItem(item.id, { customWidth: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Height */}
            <div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Height (උස)</span>
                <span className="font-mono text-white">{(item.customHeight ?? catalogItem.height).toFixed(2)} m</span>
              </div>
              <input
                type="range"
                min="0.50"
                max="2.80"
                step="0.05"
                value={item.customHeight ?? catalogItem.height}
                onChange={(e) => updatePlacedItem(item.id, { customHeight: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Depth */}
            <div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Depth (ගැඹුර)</span>
                <span className="font-mono text-white">{(item.customDepth ?? catalogItem.depth).toFixed(2)} m</span>
              </div>
              <input
                type="range"
                min="0.20"
                max="1.00"
                step="0.05"
                value={item.customDepth ?? catalogItem.depth}
                onChange={(e) => updatePlacedItem(item.id, { customDepth: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Elevation */}
            <div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Elevation (පොළවේ සිට උස)</span>
                <span className="font-mono text-white">
                  {(item.customElevation ?? (catalogItem.elevation === "wall" ? 1.45 : 0)).toFixed(2)} m
                </span>
              </div>
              <input
                type="range"
                min="0.00"
                max="2.00"
                step="0.05"
                value={item.customElevation ?? (catalogItem.elevation === "wall" ? 1.45 : 0)}
                onChange={(e) => updatePlacedItem(item.id, { customElevation: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
          </div>

          {/* Delete Button */}
          <button
            onClick={() => deletePlacedItem(item.id)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/20 py-2 text-xs font-semibold text-rose-300 border border-rose-500/20 hover:bg-rose-500/30 transition-colors"
          >
            <Trash2 size={14} />
            Delete Cabinet (කබඩ් එක මකන්න)
          </button>
        </div>
      )}

      {/* Cabinet Run Inspector */}
      {cabinet && (
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-slate-400">Selected Cabinet Row</div>
            <div className="text-sm font-semibold text-white">Procedural Kitchen Line</div>
          </div>

          {/* Premium Material Picker */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-slate-400">
              <Palette size={12} className="text-cyan-400" />
              Cabinet Row Finish
            </div>
            <div className="grid grid-cols-7 gap-2">
              {CUSTOM_MATERIALS.map((mat) => {
                const active = cabinet.customMaterialId === mat.id;
                return (
                  <button
                    key={mat.id}
                    onClick={() => updateCabinetRun(cabinet.id, { customMaterialId: mat.id })}
                    title={mat.name}
                    style={{ backgroundColor: mat.swatchHex }}
                    className={clsx(
                      "h-8 w-8 rounded-full border transition-all duration-200",
                      active
                        ? "border-cyan-400 scale-110 ring-2 ring-cyan-400/40"
                        : "border-white/10 hover:scale-105"
                    )}
                  />
                );
              })}
            </div>
          </div>

          {/* Dimensions Sliders */}
          <div className="space-y-3 border-t border-white/10 pt-3">
            <div className="text-xs font-semibold text-cyan-300">Adjust Heights (උස මට්ටම් වෙනස් කරන්න)</div>

            {/* Base Height */}
            <div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Base Cabinet Height (පහළ කබඩ්)</span>
                <span className="font-mono text-white">{(cabinet.baseHeight ?? 0.85).toFixed(2)} m</span>
              </div>
              <input
                type="range"
                min="0.50"
                max="1.30"
                step="0.05"
                value={cabinet.baseHeight ?? 0.85}
                onChange={(e) => updateCabinetRun(cabinet.id, { baseHeight: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Wall Height */}
            <div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Wall Cabinet Height (ඉහළ කබඩ්)</span>
                <span className="font-mono text-white">{(cabinet.wallHeight ?? 0.70).toFixed(2)} m</span>
              </div>
              <input
                type="range"
                min="0.30"
                max="1.40"
                step="0.05"
                value={cabinet.wallHeight ?? 0.70}
                onChange={(e) => updateCabinetRun(cabinet.id, { wallHeight: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Wall Elevation */}
            <div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Wall Cabinet Elevation (ඉහළ කබඩ් උස)</span>
                <span className="font-mono text-white">{(cabinet.wallElevation ?? 1.45).toFixed(2)} m</span>
              </div>
              <input
                type="range"
                min="1.00"
                max="2.20"
                step="0.05"
                value={cabinet.wallElevation ?? 1.45}
                onChange={(e) => updateCabinetRun(cabinet.id, { wallElevation: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
          </div>

          {/* Delete Button */}
          <button
            onClick={() => deleteCabinetRun(cabinet.id)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/20 py-2 text-xs font-semibold text-rose-300 border border-rose-500/20 hover:bg-rose-500/30 transition-colors"
          >
            <Trash2 size={14} />
            Delete Cabinet Row (පේළියම මකන්න)
          </button>
        </div>
      )}
    </div>
  );
}
