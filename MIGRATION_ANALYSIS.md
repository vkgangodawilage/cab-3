# Migration Analysis — `D:\v1 cab` → Kitchen Pantry 3D

Source-level comparison between the reference project (`D:\v1 cab`, a SketchUp Ruby "Cabinetrix" system + an ALU SYS React/Vite web app) and the current project (Next.js + React Three Fiber Kitchen Pantry 3D editor).

Analysis date: 2026-08-09 · Read-only audit · No files were modified, installed, or created during the analysis.

---

# PART 1 — 3D TECHNOLOGY COMPARISON

| Area | `D:\v1 cab` | Current Project | Better Approach |
|---|---|---|---|
| 3D engine | **Two separate worlds**: (a) SketchUp Ruby solid-modeler (`.rb` extension) for real geometry; (b) "ALU SYS" web app whose "3D preview" is **pure CSS transforms** (`Preview3D.tsx`: `perspective(1000px) rotateX/rotateY scale` on divs — **no WebGL at all**) | **Three.js r160 via React Three Fiber 8.18** — real WebGL renderer | **Current** (three.js/R3F). The reference web app has no real 3D engine to copy. |
| Geometry | Native SketchUp solids — faces/edges pushed via `pushpull`, real holes cut into walls (`CBX_RoomBuilder.rb`), true panels with edges/faces | Procedural `BoxGeometry` / `ExtrudeGeometry` / `ShapeGeometry` / custom `BufferGeometry` + `@react-three/csg` booleans (`Wall3D.tsx`) | **Hybrid** — keep current web-native geometry; port the reference's *panel decomposition* concept (18/6 mm panels, grooves, holes from `ProceduralBaseCarcass.tsx`) |
| Cabinet generation | `CBX_Shotgun V2.rb` — full parametric builder: carcass panels, doors, drawers, gola handleless cuts, plinth, sink/cooker/tall subtypes, end panels (`CBX_SeniorDev_Builder.rb`) | Run subdivision → solid boxes + visual fronts (`BaseCabinet3D.tsx`, `WallCabinet3D.tsx`); real panel code exists but is **dead** (`ShakerCabinetModel.tsx`) | **ADAPT reference concept into current renderer** — revive/rewire the existing dead carcass code instead of rewriting from scratch |
| Parametric dimensions | mm-based: width/height/depth + `panel_thk 18`, `back_thk 6`, `door_gap 3`, `plinth 100`, shelf counts, drawer counts, roles (sink/cooker/hood/tall) | meters-based: per-run `baseHeight/wallHeight/wallElevation` + per-item W/H/D sliders; **widths fixed at 0.8 m modules** | **Reference's parametric model** (standard widths 450/600, panel/back thickness) combined with **current's live slider editing** |
| Materials | SketchUp materials; ALU SYS swatch hexes; **no PBR** | Theme-driven PBR kits — clearcoat, transmission glass, `envMapIntensity`, ACES tone mapping (`CabinetModel.tsx`, `LightingEnvironment.tsx`) | **Current** — the reference's flat hex swatches are strictly worse |
| Lighting | SketchUp default + ALU SYS CSS shadows | Studio rig: key/fill/ambient/hemisphere + ceiling spots + LED strips + Lightformer env IBL | **Current** |
| Shadows | SketchUp default | PCFSoft, 4096 map, bias/radius tuned | **Current** |
| Camera | SketchUp camera + fixed snapshot rigs (`take_snapshots` in `CBX_AutoLayout.rb`) | Dual perspective/orthographic with smooth lerp transition, auto-focus on selected wall, arrow-key walk (`CameraController.tsx`) | **Current** |
| Controls | SketchUp native tools + HTML dialogs | Drei OrbitControls + hotkeys + 2D drawing engine | **Current** |
| Selection | SketchUp entity pick (`ph.best_picked`) | R3F raycaster with crash-guard + blue wireframe overlay | **Current** (needs gizmos later) |
| Snapping | SketchUp inference (`InputPoint`) | Grid 0.25 m + vertex 0.2 m + ortho + typed exact length (`geometry.ts`, `DimensionOverlay.tsx`) | **Current** |
| Collision | **Interval reservation** (blocked/usable spans, corner reservation) in `CBX_LayoutPlanner.rb` — no geometric intersection | **None** | **Reference's interval model** (concept), ported to TypeScript |
| Measurements | mm everywhere + **plan-vs-built verification** (`CBX_SeniorDev_Debug.rb` "planW vs realW") | meters internally, feet dimension lines, live length readout; **no verification** | **Reference's verification** + keep current live dims |
| Layout | Wall interval + corner ownership + **FacadeRhythmSolver** (front-width pattern solving) | Freehand polylines + island detection + corner module geometry | **Reference algorithms** ported into `CabinetLayoutEngine` |
| Performance | Native SketchUp (no cost) | memo/cached materials/preload/dpr cap; no instancing/BVH | **Current**, later add instancing |

---

# PART 2 — REFERENCE PROJECT ALGORITHMS

## 1. FacadeRhythmSolver
**File**: `CBX_FacadeRhythmSolver.rb` (module `CBXLayoutPlanner::FacadeRhythmSolver`).

- **Problem**: A kitchen run's *front facade* must look balanced — symmetric doors, uniform widths, minimal width-types, minimal/acceptable filler — while exactly filling the span (0 mm unresolved gaps).
- **Inputs**: `room` (walls with blocked intervals), `requirements` (tall banks, sink, cooker, dishwasher), `settings`.
- **Outputs**: `placements[]` + `warnings[]` (cabinet modules with `start_mm`, `width_mm`, type) + `LayoutResult`.
- **Algorithm**:
  1. `normalise_room` → `WallSegment` objects with `blocked_base/blocked_top`.
  2. `place_major_units` — corners (1010 mm + 560 mm return), tall bank (1200), sink (900, centered on window), dishwasher (600), cooker (600) + hood.
  3. `absorb_tiny_zones` — <400 mm gaps get absorbed into adjacent corners.
  4. `build_visual_zones` — free spans between blocked areas.
  5. `choose_global_dominant_width` — global 450/500/600.
  6. `solve_zone` per zone — `generate_front_patterns` (permutations of {450,600} with filler ≤160 mm, plus exact-equal "premium" patterns), score via `pattern_score` (filler-over-target ×1000, narrow ×50k, symmetry ×20, dominant-deviation ×5, unique-width ×2k, width-change ×500, custom ×2k), then `distribute_residual` symmetrically.
  7. `group_front_cells_into_modules` — merge 5 mm-equal adjacent fronts into drawers/standard modules.
  8. `close_all_wall_spans` — repair loop: stretch adjacent standard cabinets for gaps ≤60 mm, otherwise insert explicit `Filler`; leftover → warning.
  9. `generate_top_layer` — independent top row (corner returns 350, top corners 650, tall/hood blocks, equal-width top cabinets).
- **Portable to TypeScript?** Yes — it is **pure 2D interval math** with zero SketchUp calls (only `.mm`, structs, arrays).
- **Where it should live**: new `src/lib/rhythmSolver.ts`, consumed by `CabinetLayoutEngine.tsx` *before* `planRunLayout` subdivision (replacing the fixed 0.8 m loop). Feeds `BaseModulePlacement.width`.

## 2. Wall Interval Model
**Files**: `CBX_LayoutPlanner.rb` (`WallSegment`, `calculate_intervals_for_layer`), `CBX_FacadeRhythmSolver.rb` (`calculate_free_spans`, `block_zone`), `CBX_AutoLayout.rb` (`extract_room_data`).

- **Representation**: each wall = `WallSegment { length_mm, blocked_base[], blocked_top[], usable_base[], usable_top[], is_island }`. Openings (doors/windows) and reserved areas (corner 1010, sink 900, cooker 600, tall 1200) are **intervals** `{start_mm, end_mm}` pushed into `blocked_*`.
- **Available space** = *complement* of the union of blocked intervals → `usable_*` spans, recomputed by `calculate_intervals_for_layer` after every reservation.
- **Placement** = greedy/DP packing inside usable spans, then `find_best_pack` (coin-change DP over standard widths [900,600,450,300,250]).
- **Current project comparison**: current has `Wall { points }` and `PlacedCutout { positionOnWall, width }` — the blocked intervals are *implicitly* derivable from `placedCutouts`, but **no usable-span computation exists**; `planRunLayout` ignores openings entirely and works off the raw polyline. The reference is strictly more powerful here.

## 3. Corner Ownership
**Files**: `CBX_LayoutPlanner.rb` (`reserve_u_corners`), `CBX_FacadeRhythmSolver.rb` (`place_major_units` corner branch), `CBX_RoomBuilder.rb` (`CBXZoneTool`).

- **Detection**: endpoints of adjacent walls that coincide (<2 mm) → corner type `end_to_start / start_to_end / end_to_end / start_to_start`.
- **Ownership**: one wall owns the **1010 mm base corner** + **650 mm top corner**; the adjacent wall gets a **560 mm (base) / 650 mm (top) corner-return** interval; if obstacles conflict, it falls back to a smaller `corner_fallback` zone on either wall. `CBX_RoomBuilder` stores `StartCorner/EndCorner` attributes per wall.
- **Overlap prevention**: `conflict?` checks against door/window intervals before reserving; `block_zone` marks the reserved area so nothing else packs there.
- **L/U layouts**: yes — the solver is wall-index-ordered (W1/W2, W2/W3) so it handles U-shapes (both corners) and L-shapes (single corner).
- **In the current 3D system**: current detects corners geometrically in `planRunLayout` (left-turn, `CORNER_TURN_ANGLE`), places the chamfered module, but does **no reservation/conflict logic**. Porting = add a blocked-interval pass over each `Wall` and make `planRunLayout` (or a new run-planner) consume reserved intervals.

## 4. Ghost → Real Build
**Files**: `CBX_AutoLayout.rb` (`generate_ghosts_from_placements`), `CBX_RoomBuilder.rb` (`draw_ghost_box`, GhostRole tagging UI), `CBX_Shotgun V2.rb` (line ~2310 reads `GhostRole`/`GhostType`), `CBX_TestSpecificKitchen.rb`.

- **How it works**: planner emits `placements` → translucent **ghost boxes** (orange bottom / blue top / purple tall) tagged with attributes `GhostID`, `GhostType`, `GhostRole`, `GhostWidth`. The user can re-tag a ghost's role (Sink/Cooker/Drawer/Corner/Filler). A builder pass then reads each ghost and calls the real parametric cabinet builder (`CBX_Shotgun V2`) to produce actual cabinets. A "hard gate" aborts if warnings (unresolved gaps) exist.
- **Useful in the web editor?** Yes, as a **committed-plan pattern**: the live translucent preview in `ProceduralCabinetRow.tsx` (`ActiveCabinetPreview`/`GhostCabinet`) is *already* your ghost layer. The missing piece is **freezing** a plan into persistent per-module records (`placedModules`) instead of re-deriving from the polyline — giving undo-able, editable, verifiable cabinets. Much cleaner in React than in SketchUp (no entity attributes needed; store records suffice).

## 5. Plan vs Built Verification
**Files**: `CBX_SeniorDev_Debug.rb` (planW vs realW/realD/realH columns), `CBX_SeniorDev_Audit.rb` ("measured from the model, not the plan", AUDIT VERDICT: CLEAN), `CBX_AutoLayout.rb` (`verify_and_report` → "FLAWLESS MATCH" / "GAPS").

- **Method**: for each built module, merge its occupied `[start,end]` span with blocked intervals, then `find_gaps` against wall length; report every unresolved gap in mm. The audit path measures actual `Group#bounds` dimensions vs planned.
- **Three.js equivalent**: for each committed module, compute `new THREE.Box3().setFromObject(mesh)` → `getSize(vec3)` and compare with planned W/D/H; for wall coverage, do the same 1-D interval merge/gap check using module world XZ extents. Zero new dependencies.

## 6. End Panel / Filler Logic
**Files**: `CBX_SeniorDev_Builder.rb` (`plan_end_panels` line ~576, `build_end_panels` ~618, `end_panel_extra_mm` default 5, `PANEL_THK_MM 18`), `CBX_RoomBuilder.rb` (filler ghosts), `CBX_TestSpecificKitchen.rb` (line 310 — legs excluded from fillers/end panels).

- **Determination**: end panels are planned *first* — neighbour boxes shrink 18 mm so an exposed run-end gets a finished 18 mm panel, extending `end_panel_extra_mm` deeper than the carcass; fillers are the explicit gap-closing units from `close_all_wall_spans`; boundaries = wall corners and openings (end panels sit beside openings too).
- **Worth porting?** **Yes** — it's a small, pure algorithm (interval logic on run ends/corners) that dramatically improves realism. Current has fillers (leftover/corner-gap) but **no end panels**.

## 7. AI → JSON → 3D
**Files**: `AI-BUILDER/cbx_ai_wizard.rb` (Gemini/GPT-4o dialog, system prompt returning "a valid JSON array of cabinets"), `AI-BUILDER/cbx_cabinet_engine.rb` (`build_from_json` → maps each JSON object to `CBXHandleSysSettings.create_bottom_cabinets / create_top_cabinet_at_offset / create_tall_cabinet`), `ALU SYS/server.ts` (`/api/generate-layout`, Gemini → `{elements, reasoning}`), `ALU SYS/src/types.ts` (`CabinetElement`).

- **JSON contract** (Ruby): `{ type: base|wall|tall, width, height, depth, x, z, subtype: sink|cooker|hood|none, bottom_config: drawers|doors|none, drawers_count, top_doors, doors }` in mm.
- **ALU SYS contract**: `{ type, wallId: A|B|C|island, position, width, height, depth }` in cm, plus reasoning.
- **Current comparison**: current has **no AI and no server**, but its `PlacedItem` (wall-anchored, rotation, elevation) and `CatalogItem` model is *structurally ready* to receive AI output. You already render wall-anchored placements (`WallAnchoredPlacement.tsx`) and count them in BOM (`costCalculator.ts`) — so AI output maps to `PlacedItem[]` with almost no new rendering code.

## 8. Hardware / Cost Estimation
**Files**: `cbx_full_estimate.rb`, `cbx_export_estimation.rb` (ABF edgeband face-scan → L1/L2/W1/W2 edges, cut sizes), `AI-BUILDER/cbx_cnc_pipeline.rb` (guillotine sheet nesting, hardware counts: hinges=doors×2, screws=cabs×20, legs=base×4, gola meters, glass doors), `generate_kitchen_job.rb` (hardware hash: `l_gola, c_gola, hinges, drawers, legs, screws, led_length, granite_area, edge_band`).

- **Reusable logic**: yes, conceptually — the *formulas* (hinges/doors, screws/cabinet, legs/base×4, edgeband from part dims, sheet nesting, granite top-face area) are pure math.
- **What's tied to SketchUp**: face-scanning to detect painted edgeband faces (`cbx_export_estimation.rb`), and `GuillotineBin` operating on real part bounds. In web-land you'd instead **derive parts from the parametric cabinet engine** (panels/shelves/doors are known data, not scanned geometry) and run the same aggregation.

---

# PART 3 — CURRENT PROJECT SYSTEMS (already working — don't replace)

| Area | Exact source files | Already works well |
|---|---|---|
| 3D scene | `src/components/Viewport.tsx` | Canvas config, tone mapping, raycast guard, floor, overlays |
| Cabinet components | `BaseCabinet3D.tsx`, `WallCabinet3D.tsx`, `Countertop3D.tsx`, `ProceduralCabinetRow.tsx` | Modular boxes, toe kick, L-corner chamfer, glass fronts, soffit, continuous countertop slab |
| Geometry | `src/lib/proceduralGeometry.ts`, `Wall3D.tsx`, `CeilingCap.tsx`, `FloorGrid.tsx` | CSG cutouts, hull ceiling, UV remapping, multi-layer merge (currently dead) |
| Dimensions | `src/constants/dimensions.ts`, `src/lib/kitchen.ts` | Single source of truth; ROOM_HEIGHT 2.8 / WALL_THICKNESS 0.15 |
| Room/walls | `Wall3D.tsx`, `WallBuilder.tsx`, `WallMesh.tsx`, `CADWall2D.tsx`, `CeilingCap.tsx` | CSG walls, floor polygon, 2D plan |
| State | `src/store/useStore.ts` | Single Zustand store, undo history, full action set |
| Placement | `src/lib/placement.ts`, `WallAnchoredPlacement.tsx`, `DoorWindowPlacementEngine.tsx` | Wall-relative slide/orient/elevation math |
| Snapping | `src/lib/geometry.ts`, `DimensionOverlay.tsx`, `WallDrawingEngine2D.tsx` | Grid/vertex/ortho snap, typed exact length |
| Collision | — (**none**) | — |
| Measurements | `CADDimensionLines.tsx`, `DimensionOverlay.tsx` | Feet dims, live meter readout |
| Materials | `src/lib/themes.ts`, `customMaterials.ts`, `CabinetModel.tsx` | Theme re-skinning, PBR kits |
| UI | `MinimalHUD.tsx`, `LeftDrawingToolbar.tsx`, `HotkeyController.tsx`, `PantryCatalogUI.tsx`, `PantryInspectorUI.tsx`, `BOMModal.tsx` | Clean glass UI, hotkeys, inspectors, BOM drawer |
| APIs | **none** | — |
| Database | **none** | — |

Working systems to **keep unchanged**: the R3F scene root, camera controller, lighting/env, material themes, snapping/drawing engine, BOM + PDF pipeline, and the continuous-countertop outline builder. Do not replace these with anything from the reference.

---

# PART 4 — MIGRATION MATRIX

| Reference Technology | Current Equivalent | Action | Difficulty | Priority |
|---|---|---|---|---|
| FacadeRhythmSolver | Fixed `STD_CABINET_WIDTH` subdivision in `CabinetLayoutEngine.tsx` `planRunLayout` | **PORT** | Low | High |
| Wall interval model | `Wall.points` + `PlacedCutout`; no usable-span computation | **ADAPT** | Medium | High |
| Corner ownership | Geometric L-corner detection only (`planRunLayout`); no reservation | **ADAPT** | Medium | High |
| Ghost → Real Build | Live `GhostCabinet` preview in `ProceduralCabinetRow.tsx`; layout is re-derived, not committed | **ADAPT** | Medium | High |
| Plan vs Built verification | **none** | **PORT** | Low | Medium |
| End panel/filler logic | Fillers exist; end panels don't | **ADAPT** | Low | Medium |
| AI → JSON → 3D | **none** (no server, no AI) | **ADAPT** | Medium | Low-Med |
| Hardware/cost logic | `costCalculator.ts` (rates-based) | **ADAPT** | Medium | Medium |

---

# PART 5 — WHAT NOT TO TRANSFER

| Item | Source | Why skip |
|---|---|---|
| SketchUp-specific APIs | `Sketchup.active_model`, `entities.add_face`, `pushpull`, `Geom::Point3d` across all `.rb` | No browser equivalent; the current R3F scene graph replaces them entirely |
| Ruby code itself | all `.rb` | Port *algorithms* to TypeScript; never Ruby |
| SketchUp UI dialogs | `UI::HtmlDialog`, `UI.inputbox`, toolbars, SVG icons, `UI.openURL` | Replaced by existing React UI |
| Entity attributes as a data bus | `grp.set_attribute("CBX", "GhostRole", ...)` | Store records (Zustand) are a better container; attributes-on-groups is a desktop-workaround |
| CNC/DXF nesting engine | `cbx_cnc_pipeline.rb` GuillotineBin + DXF board output | Requires real part geometry + DXF writers; out of scope for a visual editor MVP — keep only the *cost formulas* |
| ABF face-scan edgeband detection | `cbx_export_estimation.rb` (reads painted faces) | SketchUp-specific; parts should be *known* data in web-land, not scanned |
| The ALU SYS CSS-3D "preview" | `ALU SYS/src/components/Preview3D.tsx` | Strictly worse than current three.js; nothing to copy |
| ALU SYS Express/Vite/Firebase stack | `ALU SYS/server.ts`, `package.json` | Current uses Next.js App Router; adding a second server framework conflicts |
| Hardcoded LKR pricing | `cbx_cnc_pipeline.rb`, `cbx_full_estimate.rb` (LKR rates, "PAINT 64") | Keep current rate-driven `BomRates` model |
| One-shot "regenerate whole room" flow | `CBX_AutoLayout.run_layout` | Current incremental editor UX is better; only adopt the *solver*, not the destroy-and-rebuild flow |
| `generate_u_kitchen.rb` / `build_u_kitchen.rb` fixed room scripts | — | Hard-coded test rooms; the solver supersedes them |
| ALU SYS keystone photo flow as-is | `WallCanvas.tsx` | The **homography util** is worth porting, but the canvas UI should adapt to current styling; the `@google/genai` + WhatsApp/Firebase backend is a separate product |

---

# PART 6 — RECOMMENDED ARCHITECTURE

```
User
  ↓
Kitchen Editor UI (existing: MinimalHUD, Toolbar, Catalog, Inspector, BOM)
  ↓
Store / State  (useStore.ts — extend, don't replace)
  ↓
Layout / Planning Layer            NEW  src/lib/planning/
  ├─ Wall Interval Solver          (walls → blocked/usable spans)
  ├─ Corner Ownership              (reserve corner + return + fallback vs cutouts)
  ├─ Facade Rhythm Solver          (front widths, symmetry, fillers, 0 mm closure)
  └─ Run Planner                   (consumes runs OR AI placements → committed plan)
  ↓
Parametric Cabinet Engine          REVIVE src/components/Procedural*Carcass + ShakerCabinetModel
  ├─ Base/Wall/Tall units          (roles: sink/cooker/hood/drawers)
  ├─ End Panels / Fillers
  └─ Panel params (18/6 mm, gaps, shelves, drawers)
  ↓
Geometry Builder                   existing proceduralGeometry.ts + CabinetLayoutEngine.tsx
  ↓
Three.js / React Three Fiber       existing Viewport.tsx scene (unchanged)
  ↓
Renderer
```

Where each element goes:
- **Wall interval solver** → new `src/lib/planning/intervals.ts`, fed from `useStore.walls` + `placedCutouts`.
- **Facade rhythm solver** → new `src/lib/planning/rhythmSolver.ts`; plugged into `CabinetLayoutEngine.tsx` `planRunLayout`.
- **Corner ownership** → new `src/lib/planning/corners.ts`; called before subdivision; integrates with `cutouts.ts` conflict checks.
- **Fillers** → keep current filler generation, extend with reference's "stretch ≤60 mm, else explicit filler, else warn".
- **End panels** → new `src/lib/planning/endPanels.ts`; output as new `BaseModuleKind`/`WallModuleKind` in `RunLayout`; render thin boxes in `BaseCabinet3D`/`WallCabinet3D`.
- **Cabinet dimensions** → extend `CabinetRun` + `CatalogItem` with panel/back thickness, door system, drawer count; drive `Procedural*Carcass` (currently dead).
- **Collision** → new `src/lib/planning/collision.ts` (2D interval overlap between runs/cutouts + wall-intersection test); called on commit and during drawing preview.
- **Measurement verification** → new `src/lib/verification.ts` (Box3 size + wall-gap interval check); surfaced in `BOMModal`/inspector.
- **Material system** → keep `themes.ts`/`customMaterials.ts` untouched.
- **AI JSON parser** → new `src/lib/ai/parseLayout.ts` + `src/app/api/generate-layout/route.ts`; outputs `PlacedItem[]`/`CabinetRun[]`.

---

# PART 7 — EXACT FILE MIGRATION PLAN

| REFERENCE FILE | CURRENT FILE | ACTION | EXPLANATION |
|---|---|---|---|
| `webcabinets\CBX_FacadeRhythmSolver.rb` | `src/components/CabinetLayoutEngine.tsx` (subdivision loop) | **PORT** | Port `generate_front_patterns`, `pattern_score`, `distribute_residual`, `group_front_cells_into_modules`, `close_all_wall_spans`, `generate_top_layer` to TS in a new `src/lib/planning/rhythmSolver.ts`; call before `planRunLayout`. |
| `webcabinets\CBX_LayoutPlanner.rb` | `src/lib/kitchen.ts` + `src/store/useStore.ts` (`Wall`) | **ADAPT** | Port `WallSegment` (blocked_base/top, usable spans) + `calculate_intervals_for_layer` + `find_best_pack` DP into `src/lib/planning/intervals.ts`. Derive blocked intervals from `placedCutouts`; keep meters internally (convert at the planning boundary). |
| `webcabinets\CBX_LayoutPlanner.rb` (`reserve_u_corners`) + `CBX_FacadeRhythmSolver.rb` (`place_major_units` corners) | `src/components/CabinetLayoutEngine.tsx` (corner block) + `src/lib/cutouts.ts` | **ADAPT** | Add corner ownership: reserve 0.90/0.65 m on one wall + return on the adjacent; conflict-check against cutouts; port `corner_fallback`. |
| `webcabinets\CBX_AutoLayout.rb` (`generate_ghosts_from_placements`, `extract_room_data`, `verify_and_report`) | `src/components/ProceduralCabinetRow.tsx` (`GhostCabinet`) + `src/store/useStore.ts` | **ADAPT** | Introduce `placedRuns`/`committedModules` records (React's "ghost→real"). Keep live preview as the ghost layer; commit on user action. |
| `webcabinets\Senior Dev Implementation\CBX_SeniorDev_Debug.rb` + `CBX_SeniorDev_Audit.rb` | `src/utils/costCalculator.ts` + `BOMModal.tsx` | **PORT** | Implement plan-vs-built in a new `src/lib/verification.ts` using `THREE.Box3` and the interval gap-check; surface in BOM/inspector. |
| `webcabinets\Senior Dev Implementation\CBX_SeniorDev_Builder.rb` (`plan_end_panels`, `build_end_panels`) | `src/components/CabinetLayoutEngine.tsx` (`RunLayout`) + `BaseCabinet3D.tsx`/`WallCabinet3D.tsx` | **ADAPT** | Emit `endPanel` placements; shrink neighbours 18 mm; render 18 mm panels proud by 5 mm on run ends/corners. |
| `webcabinets\CBX_RoomBuilder.rb` (filler ghosts, `close_all_wall_spans` filler rule) | `src/components/CabinetLayoutEngine.tsx` (filler branch) | **ADAPT** | Extend filler logic with stretch-or-insert-filler + warning. |
| `webcabinets\AI-BUILDER\cbx_ai_wizard.rb` + `cbx_cabinet_engine.rb` (system prompt, JSON contract, `build_from_json`) | `src/app/api/generate-layout/route.ts` (new) + `src/store/useStore.ts` (`applyAiPlan`) | **ADAPT** | Port the system-prompt + JSON contract to a Next.js route handler; map JSON → `PlacedItem[]`/`CabinetRun[]`. |
| `webcabinets\cbx_full_estimate.rb` + `generate_kitchen_job.rb` (hardware formulas) | `src/utils/costCalculator.ts` | **ADAPT** | Add hardware line items derived from the parametric engine's part counts (hinges, screws, legs, edgeband meters, gola). |
| `webcabinets\ALU SYS\src\utils\perspectiveTransform.ts` | `src/lib/perspectiveTransform.ts` (new) | **PORT** | Already TypeScript + dependency-free; drop in as-is. |
| `webcabinets\ALU SYS\src\components\WallCanvas.tsx` | `src/components/` (new photo wall panel) | **SKIP for MVP** | Port only the homography util + the *available-space area* computation; skip the canvas UI until needed. |
| `webcabinets\ALU SYS\server.ts` | — | **SKIP** | Use a Next.js route handler instead of Express. |
| `webcabinets\CBX_Shotgun V2.rb` (real cabinet builder) | `src/components/ProceduralBaseCarcass.tsx` + `ProceduralWallCarcass.tsx` + `ShakerCabinetModel.tsx` | **ADAPT** | Don't port Ruby. Instead **rewire the existing dead TS carcass components** into the committed-plan renderer; port the *role* concept (sink/cooker/drawer) and `door_system`/gola as new `CabinetRun` options. |
| `webcabinets\AI-BUILDER\cbx_cnc_pipeline.rb` (GuillotineBin nesting) | — | **SKIP** | Keep only cost formulas; nesting needs a DXF/CNC output stage not in scope. |
| `webcabinets\CBX_RoomBuilder.rb` (wall/obstacle tools) | `src/store/useStore.ts` (`Wall`, `placedCutouts`) | **KEEP CURRENT** | Current wall drawing + CSG cutouts already exceed the reference's pushpull approach. |
| `webcabinets\CBX_TestSpecificKitchen.rb` / `CBX_TestMacro.rb` / `test_zones.rb` | — | **SKIP** | SketchUp test harnesses; replace with Vitest unit tests of the ported TS solvers. |

---

# PART 8 — IMPLEMENTATION ORDER

**Phase 1 — Pure algorithm ports (no renderer change, lowest risk).** `rhythmSolver.ts`, `intervals.ts`, `endPanels.ts`, `collision.ts` (interval overlap + wall intersection) as standalone pure TS functions with unit tests.

**Phase 2 — Parametric cabinet improvements (revive dead code).** Wire `ProceduralBaseCarcass`/`ProceduralWallCarcass`/`ShakerCabinetModel` back into `BaseCabinetRun`/`WallCabinetRun`; add panel thickness, back panel, door system, drawer-count, shelf-count to `CabinetRun`/`CatalogItem` + `PantryInspectorUI`.

**Phase 3 — Commit model (Ghost → Real).** Add `committedModules` to the store; renderer renders committed modules when present, ghost preview otherwise; undo/delete per module.

**Phase 4 — Wall/layout solving.** Build the room model (wall → blocked/usable intervals from `placedCutouts`); make runs optionally wall-attached; feed intervals into the run planner.

**Phase 5 — Corner handling.** Port corner ownership + fallback + conflict checks on top of intervals; align with existing chamfer geometry.

**Phase 6 — Snapping/collision UX.** Add live overlap warnings during drawing/preview (using `collision.ts`); highlight collisions in red; block commits on hard collisions.

**Phase 7 — Measurement verification + fillers/end panels polish.** Add `verification.ts`, a "Verify" panel, and the stretch-or-filler rule.

**Phase 8 — AI integration.** Add `src/app/api/generate-layout/route.ts` (Gemini via env key) + `applyAiPlan`; reuse `perspectiveTransform.ts` for photo walls.

**Phase 9 — Performance optimization (optional later).** Instancing for repeated modules, BVH raycast, commit-time geometry caching.

Safe ordering rationale: pure-math first (reversible, testable), then renderer-affecting changes, then new backend/AI last.

---

# PART 9 — RISK ANALYSIS

| Risk | Detail | Mitigation |
|---|---|---|
| Breaking the working 3D scene | Replacing `planRunLayout` could regress countertop/soffit logic | Keep `planRunLayout` as the *geometry emitter*; add the new solvers as a pre-stage that only changes `width`/module-kind inputs; feature-flag new path |
| Unit mismatch (mm vs m) | Reference is mm everywhere; current is meters | Convert **only at the planning boundary** (`mm⇄m` helpers in `geometry.ts`); keep the whole scene in meters |
| Coordinate-system differences | SketchUp Y-up world vs current XZ-floor world | Port algorithms as 1-D/2-D math on the run plane (XZ); the `rotationY = atan2(-dz, dx)` convention already exists |
| State conflicts | Adding `committedModules` could fork the render path | Keep it additive: renderer picks committed plan only when non-empty; `undo` snapshots already deep-clone |
| React re-render storms | Solver output in render body (current `planRunLayout` in `useMemo`) | Keep all new solvers pure + memoized; commit plan to store only on user actions |
| Dead-code revival risk | `Procedural*Carcass` may have stale coordinate assumptions | Add unit tests + visual snapshots before/after; verify Y-origin convention (comments in file flag the mismatch) |
| Dependency conflicts | Adding AI libs could pull Node-only deps | Use a Next.js route handler with `@google/genai` server-side; zero new client deps except the standalone `perspectiveTransform.ts` |
| Performance | Per-module meshes + CSG + committed-plan layers | Instancing later (Phase 9); reuse cached geometries; keep CSG commit-only |
| Incompatible algorithms | Facade rhythm assumes wall-fixed runs; current runs are free polyline | Make rhythm solver run per *segment* (it already is interval-based); islands skip facade solving |
| SketchUp assumptions leaking in | `Placement` structs use wall_id + start_mm; current uses world position + rotation | Map `PlacedItem` to a `<wallId>#<index>`-anchored placement (already exists via `placement.ts`) |

---

# FINAL RESULT

## RECOMMENDED MIGRATION

### MUST PORT
- **FacadeRhythmSolver** → `src/lib/planning/rhythmSolver.ts` (pure port; replaces fixed-width subdivision)
- **Wall interval model** (blocked/usable spans + DP packing) → `src/lib/planning/intervals.ts`
- **Plan vs Built verification** → `src/lib/verification.ts` (Box3 + gap check)
- **End-panel planning** → `src/lib/planning/endPanels.ts`
- **Homography utility** → `src/lib/perspectiveTransform.ts` (already TypeScript)

### SHOULD ADAPT
- **Corner ownership** (+ return/fallback vs obstacles) into `CabinetLayoutEngine.tsx`/`cutouts.ts`
- **Ghost → Real Build** → committed-module store records in `useStore.ts`
- **AI → JSON → 3D** → Next.js route handler + `applyAiPlan` action mapping to existing `PlacedItem`
- **Hardware/cost formulas** (hinges/screws/legs/edgeband/gola) into `costCalculator.ts`
- **Real panel carcasses** — revive `Procedural*Carcass`/`ShakerCabinetModel` instead of re-writing

### KEEP CURRENT
- Three.js/R3F scene, dual camera, lighting/environment, PBR material themes, snapping/drawing engine, continuous countertop slab, CSG wall cutouts, BOM + PDF pipeline, all existing UI
- Do **not** adopt the reference's CSS-3D preview, SketchUp UI, or Express/Firebase stack

### DO NOT PORT
- Ruby/SketchUp APIs and entity-attribute data bus
- CNC/DXF nesting engine and ABF face-scanning
- ALU SYS CSS-3D preview and its Vite/Express/Firebase architecture
- Hardcoded LKR pricing and fixed room-generator scripts
- One-shot whole-room regeneration flow

### HIGHEST PRIORITY
1. FacadeRhythmSolver (immediate visual quality + 0 mm closure)
2. Wall interval model (enables obstacle-aware layout)
3. Corner ownership (correct corner + return geometry)
4. Ghost → Real commit model (unlocks edit/verify/export)

### EXPECTED RESULT
Your current project keeps its superior WebGL rendering, live editing, CAD snapping, and BOM/PDF pipeline, while gaining the reference's **professional kitchen-engineering brain**: rhythm-solved symmetrical facades, obstacle-aware wall-interval packing, correct corner ownership, committed editable cabinets, plan-vs-built verification, end panels, AI-to-layout, and hardware-level costing. The result is a browser kitchen editor with SketchUp-grade planning intelligence — not a copy of either project.

---

*This analysis was produced in a read-only session; no project files were modified. Implementation is staged for later phases.*
