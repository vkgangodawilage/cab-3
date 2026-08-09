/**
 * Phase 1 planning configuration.
 *
 * Units: the planning layer works in millimetres; the renderer stays in
 * metres. M_TO_MM / MM_TO_M are the single conversion point used by the
 * adapters and by the layout engine integration — do not scatter raw *1000
 * throughout the codebase.
 *
 * `ENABLE_RHYTHM_PLANNER` is the Phase 1 feature flag. When false, the layout
 * engine falls back to the original fixed-width subdivision untouched.
 */

export const ENABLE_RHYTHM_PLANNER = true;

/** Metres -> millimetres (planning boundary). */
export const M_TO_MM = 1000;
/** Millimetres -> metres (planning boundary). */
export const MM_TO_M = 1 / M_TO_MM;

/**
 * Default facade rhythm rules, matching the Senior Dev reference solver
 * (`CBX_FacadeRhythmSolver.rb`, class FacadeRhythmSolver). Exported so the
 * values are tunable without touching the solver itself.
 */
export const RHYTHM_DEFAULTS = {
  preferredWidths: [600, 450] as number[],
  dominantCandidates: [450, 500, 600] as number[],
  minFront: 400,
  maxFront: 600,
  absoluteMinFront: 350,
  maxMergeModule: 900,
  fillerAbsorbBelow: 20,
  fillerPanelMax: 120,
  minFillerWidth: 20,
} as const;

/**
 * Phase 2 corner-ownership defaults. Values mirror the Senior Dev reference
 * corner logic (BASE_CORNER_RETURN_MM 625 / TOP_CORNER_RETURN_MM 350) adapted
 * to this app's metres/geometry. Returns are derived from cabinet depth so the
 * adjacent wall's reserved space matches the actual corner module footprint.
 */
export const CORNER_DEFAULTS = {
  /** Max distance between two segments' endpoints to count as a corner. */
  endpointTolM: 0.05,
  /** Max |dot| of the two directions to be considered perpendicular. */
  perpTol: 0.05,
  /** Base-layer return/clearance reserved on the non-owner (mm). */
  baseReturnMm: 625,
  /** Top-layer return/clearance reserved on the non-owner (mm). */
  topReturnMm: 350,
  /** Corner module run on the owner (mm) — matches CORNER_MODULE_SIZE. */
  baseCornerRunMm: 900,
  /** Upper corner module run on the owner (mm) — matches UPPER_CORNER_MODULE_SIZE. */
  topCornerRunMm: 650,
} as const;

/**
 * Phase 3 — plan-vs-built verification tolerances (mm / degrees).
 *
 * Justification from the actual geometry: cabinet depth measures ~13mm proud
 * because doors sit 2mm proud of the carcass and handles protrude ~11-13mm on
 * the +Z face; door seams are 6mm. The reference solver uses a 15mm tolerance
 * for W/D/H (CBX_SeniorDev_Debug.rb `compare`). So:
 *   - dimension soft 20mm: covers handle/door protrusion + normal variance;
 *   - dimension hard 45mm: a real sizing error.
 * Position tolerances allow the wall-relative placement offsets; wall-gap
 * tolerances allow planned closed runs to read as PASS.
 */
export const VERIFY_DEFAULTS = {
  /** |delta| <= soft -> PASS, <= hard -> WARNING, else ERROR (mm). */
  dimensionSoftMm: 20,
  dimensionHardMm: 45,
  /** Position (center) deltas, mm. */
  positionSoftMm: 25,
  positionHardMm: 80,
  /** Remaining wall gap, mm. */
  wallGapSoftMm: 20,
  wallGapHardMm: 60,
  /** Module rotation deltas, degrees. */
  rotationSoftDeg: 2,
  rotationHardDeg: 5,
  /**
   * Overlap contact tolerance (metres). Two objects only count as overlapping
   * when their OBB penetration EXCEEDS this — flush contact and tiny numerical
   * penetration between intentionally snug kitchen objects are not errors.
   */
  overlapContactM: 0.01,
  /**
   * Auto-verification settle window (ms). After a structural change (commit,
   * undo, delete, edit) verification is debounced by this long so bursts are
   * coalesced into a single run and the committed scene has time to register
   * its runtime Object3D refs.
   */
  verifyAutoDebounceMs: 80,
} as const;
