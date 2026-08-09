"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import { Box, MousePointer2, Pencil, Trash2 } from "lucide-react";
import { useDesigner } from "@/store/useStore";
import type { Tool } from "@/store/useStore";

interface ToolDef {
  id: Tool;
  label: string;
  hotkey: string;
  icon: ReactNode;
}

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select / Pointer", hotkey: "V", icon: <MousePointer2 size={18} /> },
  { id: "wall", label: "Draw Walls", hotkey: "W", icon: <Pencil size={18} /> },
  { id: "kitchen", label: "Draw Kitchen", hotkey: "K", icon: <Box size={18} /> },
];

/**
 * Minimal floating left drawing toolbar: Select / Draw Walls / Draw Kitchen /
 * Clear-all (with two-step confirmation). Active tool is highlighted and each
 * button shows an icon tooltip.
 */
export function LeftDrawingToolbar() {
  const tool = useDesigner((s) => s.tool);
  const setTool = useDesigner((s) => s.setTool);
  const clearAll = useDesigner((s) => s.clearAll);
  const selectedWallId = useDesigner((s) => s.selectedWallId);
  const deleteWall = useDesigner((s) => s.deleteWall);
  const isUiVisible = useDesigner((s) => s.isUiVisible);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div
      className={clsx(
        "fixed left-3 top-1/2 z-30 -translate-y-1/2 transition-opacity duration-300",
        isUiVisible ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <div className="glass pointer-events-auto flex flex-col items-center gap-1 rounded-2xl p-1.5">
        {TOOLS.map((t) => {
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.hotkey})`}
              className={clsx(
                "group relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                active
                  ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              {t.icon}
              <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md border border-white/10 bg-slate-900/90 px-2 py-1 text-[10px] text-slate-200 opacity-0 shadow-lg backdrop-blur-sm transition-opacity group-hover:opacity-100">
                {t.label}{" "}
                <kbd className="ml-1 rounded bg-white/10 px-1 font-mono">{t.hotkey}</kbd>
              </span>
            </button>
          );
        })}

        <div className="my-0.5 h-px w-6 bg-white/10" />

        <button
          onClick={() => {
            // A selected wall is deleted immediately; otherwise clear-all.
            if (selectedWallId) {
              deleteWall(selectedWallId);
              setConfirmClear(false);
              return;
            }
            if (confirmClear) {
              clearAll();
              setConfirmClear(false);
            } else {
              setConfirmClear(true);
            }
          }}
          onBlur={() => setConfirmClear(false)}
          title={
            selectedWallId
              ? "Delete selected wall"
              : confirmClear
                ? "Click again to confirm"
                : "Clear all"
          }
          className={clsx(
            "group relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
            selectedWallId
              ? "bg-blue-500/25 text-blue-300 ring-1 ring-blue-400/50"
              : confirmClear
                ? "bg-rose-500/30 text-rose-300 ring-1 ring-rose-400/50"
                : "text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"
          )}
        >
          <Trash2 size={18} />
          <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md border border-white/10 bg-slate-900/90 px-2 py-1 text-[10px] text-rose-200 opacity-0 shadow-lg backdrop-blur-sm transition-opacity group-hover:opacity-100">
            {selectedWallId
              ? "Delete selected wall"
              : confirmClear
                ? "Confirm clear?"
                : "Clear all"}
          </span>
        </button>
      </div>
    </div>
  );
}
