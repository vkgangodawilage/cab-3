"use client";

import clsx from "clsx";
import {
  Box,
  Boxes,
  ChevronLeft,
  ChevronRight,
  DoorClosed,
  LayoutPanelTop,
  Package,
  Refrigerator,
  Warehouse,
  X,
} from "lucide-react";
import { useDesigner } from "@/store/useStore";
import { CATALOG, CATALOG_CATEGORIES } from "@/lib/catalog";
import type { CatalogCategory } from "@/lib/catalog";

const CATEGORY_ICONS: Record<CatalogCategory, React.ReactNode> = {
  pantries: <Warehouse size={14} />,
  appliances: <Refrigerator size={14} />,
  base: <Box size={14} />,
  wall: <LayoutPanelTop size={14} />,
  corners: <Package size={14} />,
  doors: <DoorClosed size={14} />,
  windows: <LayoutPanelTop size={14} />,
};

/**
 * Placement catalog drawer (right side, collapsible). Picking an item arms
 * wall-anchored placement: the item aligns flush to the selected wall, slides
 * along it with the mouse, and commits on floor click.
 */
export function PantryCatalogUI() {
  const activeCatalogItem = useDesigner((s) => s.activeCatalogItem);
  const setActiveCatalogItem = useDesigner((s) => s.setActiveCatalogItem);
  const selectedWallId = useDesigner((s) => s.selectedWallId);
  const isUiVisible = useDesigner((s) => s.isUiVisible);
  const isRightPanelOpen = useDesigner((s) => s.isRightPanelOpen);
  const setRightPanelOpen = useDesigner((s) => s.setRightPanelOpen);

  return (
    <div
      className={clsx(
        "transition-opacity duration-300",
        isUiVisible ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <div className="fixed right-0 top-[11.5rem] z-30">
        {!isRightPanelOpen && (
          <button
            onClick={() => setRightPanelOpen(true)}
            title="Show catalog"
            className="glass pointer-events-auto absolute -left-1 top-0 -translate-y-1/2 rounded-full p-1.5 text-slate-300 shadow-lg transition-colors hover:text-white"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <div
          className={clsx(
            "mr-4 flex justify-end transition-transform duration-300 ease-in-out",
            isRightPanelOpen
              ? "translate-x-0"
              : "pointer-events-none translate-x-[calc(100%+1.25rem)]"
          )}
        >
          <div className="glass pointer-events-auto w-64 overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-300">
                <Boxes size={14} className="text-cyan-300" />
                Placement Catalog
              </span>
              <div className="flex items-center gap-1">
                {activeCatalogItem && (
                  <button
                    onClick={() => setActiveCatalogItem(null)}
                    title="Clear placement (Esc)"
                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X size={13} />
                  </button>
                )}
                <button
                  onClick={() => setRightPanelOpen(false)}
                  title="Collapse catalog"
                  className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>

            <div className="max-h-[42vh] overflow-y-auto p-2">
              {CATALOG_CATEGORIES.map((cat) => (
                <div key={cat.id} className="mb-2">
                  <div className="flex items-center gap-1.5 px-1 pb-1 text-[9px] uppercase tracking-wider text-slate-500">
                    {CATEGORY_ICONS[cat.id]}
                    {cat.label}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {CATALOG.filter((item) => item.category === cat.id).map((item) => {
                      const active = activeCatalogItem?.id === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveCatalogItem(active ? null : item)}
                          className={clsx(
                            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                            active
                              ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40"
                              : "text-slate-400 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          <span className="font-mono text-[9px] leading-none text-slate-500">
                            {item.width.toFixed(2)}×{item.height.toFixed(2)}
                          </span>
                          <span className="flex-1 truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
              {activeCatalogItem ? (
                activeCatalogItem.kind === "opening" ? (
                  <>
                    Cutting{" "}
                    <span className="text-cyan-300">{activeCatalogItem.label}</span>{" "}
                    into the wall — hover a wall to position, click to carve.
                  </>
                ) : selectedWallId ? (
                  <>
                    Placing <span className="text-cyan-300">{activeCatalogItem.label}</span> — move
                    the mouse along the wall to slide, click the floor to place.
                  </>
                ) : (
                  "Click a wall in the 3D view to anchor the item against it."
                )
              ) : (
                "Pick an item, then click a wall in 3D to anchor it."
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
