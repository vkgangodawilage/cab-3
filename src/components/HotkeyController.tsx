"use client";

import { useEffect } from "react";
import { useDesigner } from "@/store/useStore";

/**
 * Global hotkey-first workflow controller (renders nothing).
 *
 *  - `w`      → Wall drawing mode
 *  - `k`      → Kitchen cabinet drawing mode
 *  - `esc`    → exit drawing / clear placement / deselect wall
 *  - `0-9 .`  → while drawing: type an exact length (locks the direction)
 *  - `Enter`  → while drawing: commit the typed length (or finish the run)
 *  - `Backspace` → edit the typed length
 *  - `/`      → toggle 2D / 3D
 *  - `Tab`    → hide / show all floating UI (clean preview)
 *
 * Skips keystrokes originating from inputs so the Drei <Html> dimension box
 * (and the BOM modal fields) keep working.
 */
export function HotkeyController() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const s = useDesigner.getState();

      if (e.key === "Tab") {
        e.preventDefault();
        s.setUiVisible(!s.isUiVisible);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        s.setCameraMode(s.cameraMode === "2d" ? "3d" : "2d");
        return;
      }

      const drawingActive =
        s.activeWallId !== null || s.activeCabinetId !== null;

      if (drawingActive) {
        if (/^[0-9.]$/.test(e.key)) {
          e.preventDefault();
          if (s.typedLength === "") s.lockVectorFromCursor();
          s.setTypedLength(s.typedLength + e.key);
        } else if (e.key === "Backspace") {
          e.preventDefault();
          s.setTypedLength(s.typedLength.slice(0, -1));
        } else if (e.key === "Enter") {
          e.preventDefault();
          s.commitTypedLength();
        }
        return;
      }

      switch (e.key) {
        case "v":
        case "V":
          s.setTool("select");
          break;
        case "w":
        case "W":
          s.setTool("wall");
          break;
        case "k":
        case "K":
          s.setTool("kitchen");
          break;
        case "Escape":
          if (s.activeCatalogItem || s.selectedWallId) {
            s.setActiveCatalogItem(null);
            s.selectWall(null);
          }
          break;
        case "Delete":
        case "Backspace":
          // Delete the selected wall (with cascading cleanup). Backspace is
          // reserved for length editing while a line is being drawn, so this
          // only fires when nothing is being drawn.
          if (s.selectedWallId && !s.activeCatalogItem) {
            e.preventDefault();
            s.deleteWall(s.selectedWallId);
          }
          break;
        case "Enter":
          s.finishActive();
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
