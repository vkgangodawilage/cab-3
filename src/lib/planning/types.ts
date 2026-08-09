/**
 * Pure planning-layer types (millimetre-based).
 *
 * This module is part of the Phase 1 planning layer. It must stay free of any
 * React / Three.js / Zustand / DOM dependency so it can run under Node's test
 * runner with zero build step. Only erasable TypeScript is used here.
 */

/** A half-open interval on a 1-D wall axis, in millimetres. */
export interface IntervalMm {
  start: number;
  end: number;
}

/** A single cell of a façade plan: either a cabinet front or a filler panel. */
export type PlanCellKind = "front" | "filler";

export interface PlanCell {
  /** Width in millimetres. */
  width: number;
  kind: PlanCellKind;
}

/** A façade module after merging equal adjacent front cells. */
export interface FacadeModule {
  /** Width in millimetres. */
  width: number;
  kind: PlanCellKind;
  /** Number of front cells merged into this module (1 or 2). */
  fronts: number;
}

/** Tunable rules for the facade rhythm solver. All values are millimetres. */
export interface FacadePlanOptions {
  /** Standard door widths used by the "standard doors + filler" strategy. */
  preferredWidths?: number[];
  /** Global dominant-width candidates (the solver picks the calmest). */
  dominantCandidates?: number[];
  /** Minimum acceptable normal front width. */
  minFront?: number;
  /** Maximum acceptable front width. */
  maxFront?: number;
  /** Hard minimum below which even a front is not allowed. */
  absoluteMinFront?: number;
  /** Two equal front cells are merged into a module only if the pair fits. */
  maxMergeModule?: number;
  /** A remainder below this is absorbed elastically into the fronts. */
  fillerAbsorbBelow?: number;
  /** A remainder at or below this becomes a real filler panel. */
  fillerPanelMax?: number;
  /** Smallest renderable filler; spans below this are impossible. */
  minFillerWidth?: number;
}

/** Result of solving one continuous usable span. */
export interface FacadePlan {
  /** Ordered modules filling the usable span (fronts + real fillers). */
  modules: FacadeModule[];
  /** Sum of front module widths, mm. */
  cabinetTotal: number;
  /** Sum of filler module widths, mm. */
  fillerTotal: number;
  /** The usable length the plan was asked to fill, mm. */
  usableLength: number;
  /** True when the plan closes exactly and every module is valid. */
  valid: boolean;
  /** usableLength - (cabinetTotal + fillerTotal), mm. Always 0 when valid. */
  residual: number;
  /** Diagnostic strings when invalid; null when valid. */
  diagnostics: string[] | null;
}
