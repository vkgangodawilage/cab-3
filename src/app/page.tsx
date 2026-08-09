"use client";

import { Viewport } from "@/components/Viewport";
import { MinimalHUD } from "@/components/MinimalHUD";
import { LeftDrawingToolbar } from "@/components/LeftDrawingToolbar";
import { HotkeyController } from "@/components/HotkeyController";
import { PantryCatalogUI } from "@/components/PantryCatalogUI";
import { PantryInspectorUI } from "@/components/PantryInspectorUI";
import { BOMModal } from "@/components/BOMModal";
import { AutoVerify } from "@/components/AutoVerify";

export default function Home() {
  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#f0f1f3] text-slate-100"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Viewport />
      <MinimalHUD />
      <LeftDrawingToolbar />
      <HotkeyController />
      <PantryCatalogUI />
      <PantryInspectorUI />
      <BOMModal />
      <AutoVerify />
    </main>
  );
}
