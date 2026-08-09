/**
 * Phase 2 — Ghost → Real / committed-module lifecycle (pure).
 *
 * Mirrors the reference concept from `CBX_SeniorDev_Builder.rb`: ghosts are
 * transient records that are validated, then committed into the project state,
 * and a cancelled preview leaves nothing behind.
 *
 * This module keeps the lifecycle LOGIC pure and Node-testable. The Zustand
 * store wires it to the real app state (reusing `cabinets` / `placedItems` —
 * no parallel `committedModules` array is introduced).
 *
 * No React / Three.js / Zustand / DOM. Erasable TS only.
 */

export interface GhostPoint2 {
  x: number;
  z: number;
}

/** Structural CabinetRun shape (duck-typed; no store import). */
export interface GhostRun {
  id: string;
  points: GhostPoint2[];
  closed: boolean;
}

export interface ValidationDiagnostic {
  severity: "warning" | "error";
  message: string;
}

export interface GhostValidationResult {
  valid: boolean;
  diagnostics: string[];
}

/**
 * Validate a ghost plan. Blocks ONLY on hard errors (unresolvable corner
 * conflicts). Warnings are surfaced but do not block, so the editor never
 * traps the user on benign cases.
 */
export function validateGhost(
  cornerDiagnostics: ValidationDiagnostic[]
): GhostValidationResult {
  const errors = cornerDiagnostics.filter((d) => d.severity === "error");
  return {
    valid: errors.length === 0,
    diagnostics: cornerDiagnostics.map((d) => `${d.severity}: ${d.message}`),
  };
}

/**
 * Map a ghost run into a committed record. In this architecture the run IS the
 * committed representation, so this is a shallow, structural copy (a clean
 * seam for future phases that may freeze derived modules).
 */
export function ghostToCommitted(ghost: GhostRun): GhostRun {
  return {
    id: ghost.id,
    points: ghost.points.map((p) => ({ x: p.x, z: p.z })),
    closed: ghost.closed,
  };
}

/* -------------------------------------------------------------------------- */
/* Pure committed-collection reducer (used by the lifecycle tests 8-10).       */
/* -------------------------------------------------------------------------- */

export interface CommittedRecord {
  id: string;
}

export interface CollectionState {
  committed: CommittedRecord[];
  history: CommittedRecord[][];
}

export function emptyCollection(): CollectionState {
  return { committed: [], history: [] };
}

/** Commit a record exactly once, snapshotting the previous committed list. */
export function commitRecord(
  state: CollectionState,
  record: CommittedRecord,
  validation: GhostValidationResult
): { state: CollectionState; ok: boolean } {
  if (!validation.valid) return { state, ok: false };
  return {
    state: {
      committed: [...state.committed, record],
      history: [...state.history, state.committed],
    },
    ok: true,
  };
}

/** A cancelled preview never mutates committed state. */
export function cancelPreview(state: CollectionState): CollectionState {
  return state;
}

/** Undo one commit: restore the previous committed list. */
export function undoCollection(state: CollectionState): CollectionState {
  if (state.history.length === 0) return state;
  const prev = state.history[state.history.length - 1];
  return { committed: prev, history: state.history.slice(0, -1) };
}
