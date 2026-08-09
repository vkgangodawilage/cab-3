import { create } from "zustand";
import {
  CLOSE_DISTANCE,
  ERASER_RADIUS,
  SNAP_DISTANCE,
  dist,
  distToSegment,
  orthoSnap,
  segmentsOf,
  snapToGrid,
} from "@/lib/geometry";
import type { Vec2 } from "@/lib/geometry";
import type { MaterialTheme } from "@/lib/themes";
import type { CatalogItem } from "@/lib/catalog";
import {
  computeWallAnchoredPlacement,
  getWallSegment,
  parseSegmentId,
} from "@/lib/placement";
import { clampOpeningCenter } from "@/lib/cutouts";
import { ROOM_HEIGHT } from "@/constants/dimensions";
import type { BomRates } from "@/utils/costCalculator";
import { DEFAULT_BOM_RATES } from "@/utils/costCalculator";
import { runBlockedSegmentsWithCorners } from "@/lib/planning/adapters";
import { validateGhost } from "@/lib/planning/ghostModel";
import type { VerificationResult } from "@/lib/planning/planVerification";

export type Tool = "select" | "wall" | "kitchen" | "eraser";
export type CameraMode = "2d" | "3d";

export interface Wall {
  id: string;
  points: Vec2[];
  closed: boolean;
}

export interface CabinetRun {
  id: string;
  points: Vec2[];
  closed: boolean;
  baseHeight?: number;
  wallHeight?: number;
  wallElevation?: number;
  customMaterialId?: string;
}

/** A wall-anchored catalog item committed to the scene. */
export interface PlacedItem {
  id: string;
  catalogId: string;
  /** Wall segment id the item is anchored to (`<wallId>#<index>`). */
  wallId: string;
  position: [number, number, number];
  rotationY: number;
  customHeight?: number;
  customWidth?: number;
  customDepth?: number;
  customElevation?: number;
  customMaterialId?: string;
}

export type CutoutType = "door" | "window";

/** Live hover preview for the door/window cutout engine. */
export interface CutoutPreview {
  /** Wall segment id (`<wallId>#<index>`). */
  wallId: string;
  /** Un-clamped cursor distance along the wall (0..L). */
  positionOnWall: number;
}

/** A committed CSG wall opening (door or window). */
export interface PlacedCutout {
  id: string;
  /** Wall segment id the opening is carved into. */
  wallId: string;
  catalogId: string;
  type: CutoutType;
  /** Center distance along the wall centerline from segment start (0..L). */
  positionOnWall: number;
  width: number;
  height: number;
  /** Bottom (sill) height: 0 for doors, 0.9 m for windows. */
  sillHeight: number;
}

interface Snapshot {
  walls: Wall[];
  cabinets: CabinetRun[];
}

export interface DesignerState {
  tool: Tool;
  cameraMode: CameraMode;
  walls: Wall[];
  cabinets: CabinetRun[];
  activeWallId: string | null;
  activeCabinetId: string | null;
  pending: Vec2 | null;
  hover: Vec2 | null;
  past: Snapshot[];

  /** Active material theme — re-skins every PBR material in the scene. */
  theme: MaterialTheme;

  /** Currently selected item or cabinet for inspection & custom height/material. */
  selectedItemId: string | null;
  selectedCabinetId: string | null;

  /**
   * Precise dimension-input engine.
   * `typedLength` is the number string being entered on the keyboard; when it
   * becomes non-empty the directional vector is locked at `lockedVector`, so
   * pressing Enter commits Point B = A + (V * length) at an exact distance.
   */
  typedLength: string;
  lockedVector: Vec2 | null;

  /* ---------------- Wall selection & anchored placement ---------------- */
  /** Currently selected wall segment id (`<wallId>#<index>`), or null. */
  selectedWallId: string | null;
  /** Catalog item armed for placement, or null. */
  activeCatalogItem: CatalogItem | null;
  /** Committed wall-anchored items. */
  placedItems: PlacedItem[];
  /** Raw (un-snapped) cursor position on the floor — drives slide previews. */
  pointer: Vec2 | null;
  /** Remembered anchor side (-1 | 1) so preview & commit stay consistent. */
  placementSide: number;

  /** Committed CSG wall openings (doors / windows). */
  placedCutouts: PlacedCutout[];
  /** Live hover preview for the cutout engine. */
  cutoutPreview: CutoutPreview | null;

  /** BOM drawer visibility + adjustable material rates. */
  bomOpen: boolean;
  bomRates: BomRates;

  /* ------------------- UI visibility & panel drawers -------------------- */
  /** Tab toggles all floating UI for a full-screen clean preview. */
  isUiVisible: boolean;
  isRightPanelOpen: boolean;

  /**
   * Single source of truth for the room height. Wall3D extrudes walls from
   * Y = 0 to Y = ceilingHeight and CeilingCap is locked at Y = ceilingHeight,
   * so the wall tops and ceiling bottom always meet with zero gap.
   */
  ceilingHeight: number;

  setTool: (tool: Tool) => void;
  setCameraMode: (mode: CameraMode) => void;
  toggleCameraMode: () => void;
  setTheme: (theme: MaterialTheme) => void;
  setPending: (p: Vec2 | null) => void;
  setHover: (p: Vec2 | null) => void;
  setPointer: (p: Vec2 | null) => void;
  setTypedLength: (v: string) => void;
  setLockedVector: (v: Vec2 | null) => void;
  lockVectorFromCursor: () => void;
  commitTypedLength: () => void;
  snap: (raw: Vec2) => Vec2;
  handleFloorClick: (raw: Vec2, opts?: { exact?: boolean }) => void;
  /** Routes a primary floor click between placement / deselect / drawing. */
  handlePrimaryClick: (raw: Vec2) => void;
  selectWall: (id: string | null) => void;
  selectItem: (id: string | null) => void;
  selectCabinet: (id: string | null) => void;
  updatePlacedItem: (id: string, updates: Partial<PlacedItem>) => void;
  updateCabinetRun: (id: string, updates: Partial<CabinetRun>) => void;
  deletePlacedItem: (id: string) => void;
  deleteCabinetRun: (id: string) => void;
  deleteWall: (id: string) => void;
  setActiveCatalogItem: (item: CatalogItem | null) => void;
  setPlacementSide: (side: number) => void;
  placeItemAtPreview: () => void;
  setCutoutPreview: (preview: CutoutPreview | null) => void;
  /** Commit a door/window cutout on the given wall segment at cursor distance. */
  placeCutout: (wallId: string, rawT: number) => void;
  setBomOpen: (open: boolean) => void;
  setBomRates: (rates: Partial<BomRates>) => void;
  setCeilingHeight: (ceilingHeight: number) => void;
  setUiVisible: (visible: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  finishActive: () => void;
  /** Confirm the current multi-segment path and stop drawing (double-click). */
  finishDrawing: () => void;
  /**
   * Commit the active ghost run/wall after validation. Blocks (returns false)
   * when corner ownership reports a hard error; the ghost stays previewable.
   */
  commitActive: () => boolean;
  /** Phase 2 commit-validation result (null = no failed attempt pending). */
  lastValidation: { valid: boolean; diagnostics: string[] } | null;
  setLastValidation: (v: { valid: boolean; diagnostics: string[] } | null) => void;
  /** Phase 3 plan-vs-built verification result (serializable, on-demand). */
  verification: VerificationResult | null;
  setVerification: (v: VerificationResult | null) => void;
  /**
   * Phase 4C — auto-refresh. `verifyRevision` bumps on every structural change
   * (commit, undo, delete, edit); the `<AutoVerify />` component debounces and
   * re-runs verification. `verificationStale` marks the debounce window so an
   * old result is never presented as current.
   */
  verifyRevision: number;
  verificationStale: boolean;
  requestVerification: () => void;
  setVerificationStale: (stale: boolean) => void;
  cancelActive: () => void;
  removeLastPoint: () => void;
  undo: () => void;
  clearAll: () => void;
}

type EraseTarget =
  | { kind: "wall"; wall: Wall }
  | { kind: "cabinet"; run: CabinetRun };

let uid = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function pushHistory(set: any, get: () => DesignerState) {
  const { walls, cabinets, past } = get();
  const next = [...past, { walls: clone(walls), cabinets: clone(cabinets) }];
  if (next.length > 50) next.shift();
  set({ past: next });
}

function allVertices(walls: Wall[], cabinets: CabinetRun[]): Vec2[] {
  return [...walls.flatMap((w) => w.points), ...cabinets.flatMap((c) => c.points)];
}

/**
 * Returns the last placed point of the currently active drawing run.
 * This is "Point A" for the dimension-input engine (B = A + V * L).
 */
function activeLastPoint(s: DesignerState): Vec2 | undefined {
  if (s.activeWallId) {
    return s.walls.find((w) => w.id === s.activeWallId)?.points.at(-1);
  }
  if (s.activeCabinetId) {
    return s.cabinets.find((c) => c.id === s.activeCabinetId)?.points.at(-1);
  }
  return undefined;
}

function eraseNearest(set: any, get: () => DesignerState, p: Vec2) {
  const { walls, cabinets } = get();
  let bestD = ERASER_RADIUS;
  let target: EraseTarget | null = null;

  for (const w of walls) {
    for (const v of w.points) {
      const d = dist(p, v);
      if (d < bestD) {
        bestD = d;
        target = { kind: "wall", wall: w };
      }
    }
    for (const [a, b] of segmentsOf(w.points, w.closed)) {
      const d = distToSegment(p, a, b);
      if (d < bestD) {
        bestD = d;
        target = { kind: "wall", wall: w };
      }
    }
  }

  for (const c of cabinets) {
    for (const v of c.points) {
      const d = dist(p, v);
      if (d < bestD) {
        bestD = d;
        target = { kind: "cabinet", run: c };
      }
    }
    for (const [a, b] of segmentsOf(c.points, c.closed)) {
      const d = distToSegment(p, a, b);
      if (d < bestD) {
        bestD = d;
        target = { kind: "cabinet", run: c };
      }
    }
  }

  if (!target) return;
  pushHistory(set, get);
  if (target.kind === "wall") {
    set({ walls: walls.filter((w) => w.id !== target.wall.id) });
  } else {
    set({ cabinets: cabinets.filter((c) => c.id !== target.run.id) });
  }
}

export const useDesigner = create<DesignerState>((set, get) => ({
  tool: "select",
  cameraMode: "3d",
  walls: [],
  cabinets: [],
  activeWallId: null,
  activeCabinetId: null,
  pending: null,
  hover: null,
  past: [],
  typedLength: "",
  lockedVector: null,
  theme: "graphite-studio",
  selectedWallId: null,
  selectedItemId: null,
  selectedCabinetId: null,
  activeCatalogItem: null,
  placedItems: [],
  pointer: null,
  placementSide: 1,
  placedCutouts: [],
  cutoutPreview: null,
  bomOpen: false,
  bomRates: DEFAULT_BOM_RATES,
  ceilingHeight: ROOM_HEIGHT,
  isUiVisible: true,
  isRightPanelOpen: false,
  lastValidation: null,
  verification: null,
  verifyRevision: 0,
  verificationStale: false,

  setTool: (tool) => {
    const s = get();
    if (tool !== "wall" && s.activeWallId) s.finishActive();
    if (tool !== "kitchen" && s.activeCabinetId) s.finishActive();
    set({ tool, pending: null, typedLength: "", lockedVector: null });
  },

  setCameraMode: (cameraMode) => set({ cameraMode }),
  toggleCameraMode: () =>
    set({ cameraMode: get().cameraMode === "2d" ? "3d" : "2d" }),
  setTheme: (theme) => set({ theme }),
  setPending: (p) => {
    const s = get();
    if (
      p &&
      (s.tool === "wall" || s.tool === "kitchen") &&
      (s.activeWallId || s.activeCabinetId)
    ) {
      set({ pending: orthoSnap(activeLastPoint(s)!, p) });
    } else {
      set({ pending: p });
    }
  },
  setPointer: (pointer) => set({ pointer }),
  setPlacementSide: (side) => set({ placementSide: side }),
  setHover: (hover) => set({ hover }),
  setTypedLength: (typedLength) => set({ typedLength }),
  setLockedVector: (lockedVector) => set({ lockedVector }),
  lockVectorFromCursor: () => {
    const s = get();
    const last = activeLastPoint(s);
    if (!last || !s.hover) return;
    const dx = s.hover.x - last.x;
    const dz = s.hover.z - last.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    set({ lockedVector: { x: dx / len, z: dz / len } });
  },
  commitTypedLength: () => {
    const s = get();
    const last = activeLastPoint(s);
    if (!last || !s.lockedVector) return;
    const len = parseFloat(s.typedLength);
    if (isNaN(len) || len <= 0) {
      set({ typedLength: "", lockedVector: null });
      return;
    }
    const target: Vec2 = {
      x: last.x + s.lockedVector.x * len,
      z: last.z + s.lockedVector.z * len,
    };
    s.handleFloorClick(target, { exact: true });
    set({ typedLength: "", lockedVector: null });
  },

  snap: (raw) => {
    const s = get();
    const grid = snapToGrid(raw);
    const verts = allVertices(s.walls, s.cabinets);
    for (const v of verts) {
      if (dist(raw, v) < SNAP_DISTANCE) return v;
    }
    return grid;
  },

  handleFloorClick: (raw, opts) => {
    const s = get();
    const pt = opts?.exact ? raw : s.snap(raw);

    // Phase 2 ghost model: drawing steps never push undo history. A line is
    // committed (and snapshot once) only on finish/commit; cancelling leaves
    // no undo entry behind (Part 14).
    if (s.tool === "wall") {
      if (!s.activeWallId) {
        const wall: Wall = { id: nextId("wall"), points: [pt], closed: false };
        set({
          walls: [...s.walls, wall],
          activeWallId: wall.id,
          pending: pt,
          typedLength: "",
          lockedVector: null,
          lastValidation: null,
        });
        return;
      }
      const active = s.walls.find((w) => w.id === s.activeWallId);
      if (!active) return;
      const first = active.points[0];
      const prev = active.points[active.points.length - 1];
      if (dist(pt, prev) < 1e-4) return;
      if (active.points.length >= 3 && dist(pt, first) < CLOSE_DISTANCE) {
        // Closing the loop commits the wall — one history snapshot.
        pushHistory(set, get);
        set({
          walls: s.walls.map((w) =>
            w.id === s.activeWallId ? { ...w, closed: true } : w
          ),
          activeWallId: null,
          pending: null,
          typedLength: "",
          lockedVector: null,
          lastValidation: null,
          verifyRevision: s.verifyRevision + 1,
          verificationStale: true,
        });
        return;
      }
      set({
        walls: s.walls.map((w) =>
          w.id === s.activeWallId ? { ...w, points: [...w.points, pt] } : w
        ),
        pending: pt,
        typedLength: "",
        lockedVector: null,
      });
    } else if (s.tool === "kitchen") {
      const active = s.cabinets.find((c) => c.id === s.activeCabinetId);
      if (!active) {
        const run: CabinetRun = { id: nextId("cab"), points: [pt], closed: false };
        set({
          cabinets: [...s.cabinets, run],
          activeCabinetId: run.id,
          pending: pt,
          typedLength: "",
          lockedVector: null,
          lastValidation: null,
        });
        return;
      }
      const prev = active.points[active.points.length - 1];
      if (dist(pt, prev) < 1e-4) return;
      set({
        cabinets: s.cabinets.map((c) =>
          c.id === s.activeCabinetId ? { ...c, points: [...c.points, pt] } : c
        ),
        pending: pt,
        typedLength: "",
        lockedVector: null,
      });
    } else if (s.tool === "eraser") {
      eraseNearest(set, get, pt);
    }
  },

  handlePrimaryClick: (raw) => {
    const s = get();
    if (s.activeCatalogItem) {
      if (s.activeCatalogItem.kind === "furniture" && s.selectedWallId) {
        s.placeItemAtPreview();
      }
      return;
    }
    if (s.tool === "select") {
      s.selectWall(null);
      s.selectItem(null);
      s.selectCabinet(null);
      return;
    }
    s.handleFloorClick(raw);
  },

  selectWall: (id) => set({ selectedWallId: id, selectedItemId: null, selectedCabinetId: null, placementSide: 1 }),
  selectItem: (id) => set({ selectedItemId: id, selectedWallId: null, selectedCabinetId: null }),
  selectCabinet: (id) => set({ selectedCabinetId: id, selectedWallId: null, selectedItemId: null }),

  updatePlacedItem: (id, updates) => {
    const s = get();
    pushHistory(set, get);
    set({
      placedItems: s.placedItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
      verifyRevision: s.verifyRevision + 1,
      verificationStale: true,
    });
  },

  updateCabinetRun: (id, updates) => {
    const s = get();
    pushHistory(set, get);
    set({
      cabinets: s.cabinets.map((cab) =>
        cab.id === id ? { ...cab, ...updates } : cab
      ),
      verifyRevision: s.verifyRevision + 1,
      verificationStale: true,
    });
  },

  deletePlacedItem: (id) => {
    const s = get();
    pushHistory(set, get);
    set({
      placedItems: s.placedItems.filter((i) => i.id !== id),
      selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
      verifyRevision: s.verifyRevision + 1,
      verificationStale: true,
    });
  },

  deleteCabinetRun: (id) => {
    const s = get();
    pushHistory(set, get);
    set({
      cabinets: s.cabinets.filter((c) => c.id !== id),
      selectedCabinetId: s.selectedCabinetId === id ? null : s.selectedCabinetId,
      verifyRevision: s.verifyRevision + 1,
      verificationStale: true,
    });
  },

  deleteWall: (id) => {
    const s = get();
    const parsed = parseSegmentId(id);
    if (!parsed) return;
    const wall = s.walls.find((w) => w.id === parsed.wallId);
    if (!wall) return;

    pushHistory(set, get);

    // Cascading cleanup: drop cutouts + anchored items on any segment of the run.
    const placedCutouts = s.placedCutouts.filter((c) => {
      const p = parseSegmentId(c.wallId);
      return !(p && p.wallId === parsed.wallId);
    });
    const placedItems = s.placedItems.filter((item) => {
      const p = parseSegmentId(item.wallId);
      return !(p && p.wallId === parsed.wallId);
    });

    set({
      walls: s.walls.filter((w) => w.id !== parsed.wallId),
      placedCutouts,
      placedItems,
      activeWallId: s.activeWallId === parsed.wallId ? null : s.activeWallId,
      pending: s.activeWallId === parsed.wallId ? null : s.pending,
      selectedWallId: s.selectedWallId === id ? null : s.selectedWallId,
      cutoutPreview: null,
      verifyRevision: s.verifyRevision + 1,
      verificationStale: true,
    });
  },

  setActiveCatalogItem: (item) => {
    const s = get();
    if (item && (s.activeWallId || s.activeCabinetId)) s.finishActive();
    set({
      activeCatalogItem: item,
      tool: item ? "select" : s.tool,
      placementSide: 1,
      cutoutPreview: null,
    });
  },

  placeItemAtPreview: () => {
    const s = get();
    const item = s.activeCatalogItem;
    const wid = s.selectedWallId;
    if (!item || item.kind !== "furniture" || !wid || !s.pointer) return;
    const seg = getWallSegment(s.walls, wid);
    if (!seg) return;
    const result = computeWallAnchoredPlacement(seg, item, s.pointer, s.placementSide);
    const placed: PlacedItem = {
      id: nextId("item"),
      catalogId: item.id,
      wallId: wid,
      position: result.position,
      rotationY: result.rotationY,
    };
    set({
      placedItems: [...s.placedItems, placed],
      verifyRevision: s.verifyRevision + 1,
      verificationStale: true,
    });
  },

  setCutoutPreview: (preview) => set({ cutoutPreview: preview }),

  placeCutout: (wallId, rawT) => {
    const s = get();
    const item = s.activeCatalogItem;
    if (!item || item.kind !== "opening") return;
    const seg = getWallSegment(s.walls, wallId);
    if (!seg) return;
    const len = dist(seg.a, seg.b);
    const t = clampOpeningCenter(len, item.width, rawT);
    const sill =
      item.openingType === "window" ? item.sillHeight ?? 0.9 : 0;
    const cutout: PlacedCutout = {
      id: nextId("cut"),
      wallId,
      catalogId: item.id,
      type: item.openingType === "window" ? "window" : "door",
      positionOnWall: t,
      width: item.width,
      height: item.height,
      sillHeight: sill,
    };
    set({
      placedCutouts: [...s.placedCutouts, cutout],
      cutoutPreview: null,
      verifyRevision: s.verifyRevision + 1,
      verificationStale: true,
    });
  },

  setBomOpen: (bomOpen) => set({ bomOpen }),

  setBomRates: (rates) => set({ bomRates: { ...get().bomRates, ...rates } }),

  setCeilingHeight: (ceilingHeight) => set({ ceilingHeight: Math.max(ceilingHeight, 1) }),

  setUiVisible: (isUiVisible) => set({ isUiVisible }),
  setRightPanelOpen: (isRightPanelOpen) => set({ isRightPanelOpen }),

  finishActive: () => {
    const s = get();
    // Commit point for implicit finishes (tool switch): snapshot once.
    const committed = !!(s.activeWallId || s.activeCabinetId);
    if (committed) pushHistory(set, get);
    set({
      activeWallId: null,
      activeCabinetId: null,
      pending: null,
      hover: null,
      typedLength: "",
      lockedVector: null,
      lastValidation: null,
      verifyRevision: committed ? s.verifyRevision + 1 : s.verifyRevision,
      verificationStale: committed ? true : s.verificationStale,
    });
  },

  setLastValidation: (lastValidation) => set({ lastValidation }),
  setVerification: (verification) => set({ verification }),
  requestVerification: () =>
    set((s) => ({ verifyRevision: s.verifyRevision + 1, verificationStale: true })),
  setVerificationStale: (verificationStale) => set({ verificationStale }),

  commitActive: () => {
    const s = get();
    if (s.activeCabinetId) {
      // Validate the whole ghost plan (cutouts + corner ownership) before
      // committing. Hard corner errors block the commit so the user can fix
      // the run while it is still a previewable ghost.
      const planned = runBlockedSegmentsWithCorners(
        s.cabinets,
        s.walls,
        s.placedCutouts
      );
      const validation = validateGhost(planned.cornerDiagnostics);
      if (!validation.valid) {
        set({ lastValidation: { valid: false, diagnostics: validation.diagnostics } });
        return false;
      }
      pushHistory(set, get);
      set({
        activeCabinetId: null,
        pending: null,
        hover: null,
        typedLength: "",
        lockedVector: null,
        lastValidation: null,
        verifyRevision: s.verifyRevision + 1,
        verificationStale: true,
      });
      return true;
    }
    if (s.activeWallId) {
      pushHistory(set, get);
      set({
        activeWallId: null,
        pending: null,
        hover: null,
        typedLength: "",
        lockedVector: null,
        lastValidation: null,
        verifyRevision: s.verifyRevision + 1,
        verificationStale: true,
      });
      return true;
    }
    return false;
  },

  finishDrawing: () => {
    const s = get();
    if (s.activeWallId) {
      const wall = s.walls.find((w) => w.id === s.activeWallId);
      if (wall && wall.points.length >= 2) {
        s.commitActive();
      } else {
        s.cancelActive();
      }
    } else if (s.activeCabinetId) {
      const run = s.cabinets.find((c) => c.id === s.activeCabinetId);
      if (run && run.points.length >= 2) {
        s.commitActive();
      } else {
        s.cancelActive();
      }
    }
  },

  cancelActive: () => {
    const s = get();
    // A cancelled ghost must NOT create an undo entry (Part 14).
    const walls = s.activeWallId
      ? s.walls.filter((w) => w.id !== s.activeWallId)
      : s.walls;
    const cabinets = s.activeCabinetId
      ? s.cabinets.filter((c) => c.id !== s.activeCabinetId)
      : s.cabinets;
    set({ walls, cabinets, activeWallId: null, activeCabinetId: null, pending: null, hover: null, typedLength: "", lockedVector: null, lastValidation: null });
  },

  removeLastPoint: () => {
    const s = get();
    if (s.activeWallId) {
      const active = s.walls.find((w) => w.id === s.activeWallId);
      if (!active || active.points.length === 0) return;
      const points = active.points.slice(0, -1);
      set({
        walls: points.length
          ? s.walls.map((w) => (w.id === active.id ? { ...w, points } : w))
          : s.walls.filter((w) => w.id !== active.id),
        activeWallId: points.length ? s.activeWallId : null,
        pending: null,
        typedLength: "",
        lockedVector: null,
      });
      return;
    }
    if (s.activeCabinetId) {
      const active = s.cabinets.find((c) => c.id === s.activeCabinetId);
      if (!active || active.points.length === 0) return;
      const points = active.points.slice(0, -1);
      set({
        cabinets: points.length
          ? s.cabinets.map((c) => (c.id === active.id ? { ...c, points } : c))
          : s.cabinets.filter((c) => c.id !== active.id),
        activeCabinetId: points.length ? s.activeCabinetId : null,
        pending: null,
        typedLength: "",
        lockedVector: null,
      });
    }
  },

  undo: () => {
    const s = get();
    const { past } = s;
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({
      walls: prev.walls,
      cabinets: prev.cabinets,
      past: past.slice(0, -1),
      activeWallId: null,
      activeCabinetId: null,
      pending: null,
      hover: null,
      typedLength: "",
      lockedVector: null,
      lastValidation: null,
      verifyRevision: s.verifyRevision + 1,
      verificationStale: true,
    });
  },

  clearAll: () => {
    const s = get();
    pushHistory(set, get);
    set({
      walls: [],
      cabinets: [],
      activeWallId: null,
      activeCabinetId: null,
      pending: null,
      hover: null,
      pointer: null,
      typedLength: "",
      lockedVector: null,
      selectedWallId: null,
      activeCatalogItem: null,
      placedItems: [],
      placedCutouts: [],
      cutoutPreview: null,
      placementSide: 1,
      verifyRevision: s.verifyRevision + 1,
      verificationStale: true,
    });
  },
}));
