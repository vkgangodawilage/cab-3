/**
 * Facade Rhythm Solver — pure TypeScript port of the Senior Dev reference
 * algorithm (`D:\v1 cab\webcabinets\Senior Dev Implementation\CBX_FacadeRhythmSolver.rb`).
 *
 * It solves a single continuous usable span as a CLOSED equation:
 *
 *   sum(front modules) + sum(filler panels) === span   (exactly, in mm)
 *
 * Behaviour preserved from the reference:
 *   - elastic equal-cell partitions that always close the span (`equal_widths`)
 *   - symmetric distribution of any remainder (`add_symmetric!`)
 *   - standard doors + a REAL filler panel when that scores better
 *   - symmetric pairs, dominant-width preference, few width-types
 *   - merging equal adjacent front cells into wider modules (`merge_cells`)
 *   - deterministic output, explicit invalid result when a span is impossible
 *
 * SketchUp-specific code is excluded. No React / Three.js / Zustand / DOM.
 */

import type {
  FacadeModule,
  FacadePlan,
  FacadePlanOptions,
  PlanCell,
} from "./types.ts";
import { RHYTHM_DEFAULTS } from "./config.ts";

interface ResolvedRules {
  preferredWidths: readonly number[];
  dominantCandidates: readonly number[];
  minFront: number;
  maxFront: number;
  absoluteMinFront: number;
  maxMergeModule: number;
  fillerAbsorbBelow: number;
  fillerPanelMax: number;
  minFillerWidth: number;
}

interface Candidate {
  cells: PlanCell[];
  fillerTotal: number;
  score: number;
}

/** Merge user options over the reference defaults. */
export function resolveRules(options?: FacadePlanOptions): ResolvedRules {
  return {
    preferredWidths: options?.preferredWidths ?? RHYTHM_DEFAULTS.preferredWidths,
    dominantCandidates: options?.dominantCandidates ?? RHYTHM_DEFAULTS.dominantCandidates,
    minFront: options?.minFront ?? RHYTHM_DEFAULTS.minFront,
    maxFront: options?.maxFront ?? RHYTHM_DEFAULTS.maxFront,
    absoluteMinFront: options?.absoluteMinFront ?? RHYTHM_DEFAULTS.absoluteMinFront,
    maxMergeModule: options?.maxMergeModule ?? RHYTHM_DEFAULTS.maxMergeModule,
    fillerAbsorbBelow: options?.fillerAbsorbBelow ?? RHYTHM_DEFAULTS.fillerAbsorbBelow,
    fillerPanelMax: options?.fillerPanelMax ?? RHYTHM_DEFAULTS.fillerPanelMax,
    minFillerWidth: options?.minFillerWidth ?? RHYTHM_DEFAULTS.minFillerWidth,
  };
}

function frontCell(width: number): PlanCell {
  return { width, kind: "front" };
}

function fillerCell(width: number): PlanCell {
  return { width, kind: "filler" };
}

/**
 * Split `span` into `n` integer front widths. The base is equal everywhere and
 * the remainder is distributed symmetrically (mirror pairs stay equal).
 */
export function equalWidths(span: number, n: number): number[] {
  const base = Math.floor(span / n);
  const widths = new Array<number>(n).fill(base);
  addSymmetric(widths, span - base * n);
  return widths;
}

/**
 * Add `extra` millimetres across `widths`, keeping symmetric pairs equal.
 * Cells are visited outer-to-inner (mirror pairs first), so the centre cell is
 * only grown after both ends, matching the reference `add_symmetric!`.
 */
export function addSymmetric(widths: number[], extra: number): number[] {
  const n = widths.length;
  if (n === 0 || extra <= 0) return widths;

  const order: number[] = [];
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    order.push(lo, hi);
    lo += 1;
    hi -= 1;
  }
  if (lo === hi) order.push(lo); // centre cell for odd n

  let i = 0;
  let remaining = extra;
  while (remaining > 0) {
    widths[order[i % order.length]] += 1;
    remaining -= 1;
    i += 1;
  }
  return widths;
}

function symmetryError(fronts: number[]): number {
  let err = 0;
  const last = fronts.length - 1;
  for (let i = 0; i < Math.floor(fronts.length / 2); i++) {
    err += Math.abs(fronts[i] - fronts[last - i]);
  }
  return err;
}

function widthChangeCount(fronts: number[]): number {
  let count = 0;
  for (let i = 1; i < fronts.length; i++) {
    if (fronts[i] !== fronts[i - 1]) count += 1;
  }
  return count;
}

/** Score a candidate partition; lower is calmer / more desirable. */
function buildCandidate(
  cells: PlanCell[],
  fillerTotal: number,
  dominant: number,
  rules: ResolvedRules
): Candidate {
  const fronts = cells.filter((c) => c.kind === "front").map((c) => c.width);
  const fillerPanels = cells.filter((c) => c.kind === "filler").length;

  let score = 0;
  score += fillerTotal * 40;
  score += fronts.filter((w) => w < rules.minFront).length * 2000;
  score += symmetryError(fronts) * 15;
  score += fronts.reduce((s, w) => s + Math.abs(w - dominant), 0) * 3;
  score += Math.max(new Set(fronts).size - 1, 0) * 1500;
  score += widthChangeCount(fronts) * 300;
  score += fillerPanels * 4000;
  score += Math.max(fronts.length - 1, 0) * 5;

  return { cells, fillerTotal, score };
}

/**
 * Best partition of `spanMm` into front cells + optional filler panels.
 * Returns null when the span is impossible to close (too small to be a real
 * filler panel). Port of `best_partition_for`.
 */
export function bestPartitionFor(
  spanMm: number,
  dominant: number,
  options?: FacadePlanOptions
): Candidate | null {
  const rules = resolveRules(options);
  const span = Math.round(spanMm);
  if (span <= 0) return null;

  if (span < rules.absoluteMinFront) {
    // Too small for any cabinet front: a real filler panel is the only option,
    // and only if it is big enough to be rendered/measured.
    if (span < rules.minFillerWidth) return null;
    return buildCandidate([fillerCell(span)], span, dominant, rules);
  }

  const candidates: Candidate[] = [];

  // (A) Elastic equal-cell partitions — always close the span exactly.
  const minN = Math.max(1, Math.ceil(span / rules.maxFront));
  const maxN = Math.floor(span / rules.absoluteMinFront);
  for (let n = minN; n <= maxN; n++) {
    const ideal = span / n;
    if (ideal < rules.absoluteMinFront || ideal > rules.maxFront) continue;
    const widths = equalWidths(span, n);
    if (Math.min(...widths) < rules.absoluteMinFront) continue;
    if (Math.max(...widths) > rules.maxFront) continue;
    candidates.push(buildCandidate(widths.map(frontCell), 0, dominant, rules));
  }

  // (B) Standard doors + a real filler panel (never an empty gap).
  for (const w of rules.preferredWidths) {
    const n = Math.floor(span / w);
    if (n < 1) continue;
    const rem = span - n * w;
    if (rem === 0) {
      candidates.push(buildCandidate(Array.from({ length: n }, () => frontCell(w)), 0, dominant, rules));
      continue;
    }
    // Absorb a tiny remainder elastically into the fronts (kept <= max).
    if (rem < rules.fillerAbsorbBelow) {
      const widths = new Array<number>(n).fill(w);
      addSymmetric(widths, rem);
      if (Math.max(...widths) <= rules.maxFront) {
        candidates.push(buildCandidate(widths.map(frontCell), 0, dominant, rules));
      }
    }
    // Represent the remainder as a REAL filler panel when it fits the limit.
    if (rem <= rules.fillerPanelMax) {
      const cells = Array.from({ length: n }, () => frontCell(w));
      cells.push(fillerCell(rem));
      candidates.push(buildCandidate(cells, rem, dominant, rules));
    }
  }

  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const c of candidates) {
    if (c.score < best.score) best = c;
  }
  return best;
}

/**
 * Choose the dominant façade width for a span by scoring each candidate.
 * Port of `choose_global_dominant_width` applied to a single span.
 */
export function chooseDominant(spanMm: number, options?: FacadePlanOptions): number {
  const rules = resolveRules(options);
  let best = rules.dominantCandidates[0];
  let bestScore = Infinity;
  for (const candidate of rules.dominantCandidates) {
    const part = bestPartitionFor(spanMm, candidate, options);
    const score = part ? part.score : 5_000_000;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Merge adjacent equal front cells into a wider module (max `maxMergeModule`).
 * Port of `merge_cells`. Two 400/450 mm cells become a single 800/900 module.
 */
export function mergeCells(cells: PlanCell[], maxMergeModule: number): FacadeModule[] {
  const modules: FacadeModule[] = [];
  let i = 0;
  while (i < cells.length) {
    const c = cells[i];
    const next = cells[i + 1];
    if (
      c.kind === "front" &&
      next &&
      next.kind === "front" &&
      next.width === c.width &&
      c.width * 2 <= maxMergeModule
    ) {
      modules.push({ width: c.width * 2, kind: "front", fronts: 2 });
      i += 2;
    } else {
      modules.push({ width: c.width, kind: c.kind, fronts: 1 });
      i += 1;
    }
  }
  return modules;
}

/**
 * Solve a continuous usable span into a validated façade plan.
 *
 * Invariant (Phase 1 contract): for a valid plan,
 * `cabinetTotal + fillerTotal === usableLength` exactly (integer mm). If the
 * span cannot be closed, the result is marked invalid with diagnostics — the
 * solver NEVER silently stretches cabinets or hides a residual.
 */
export function solveFacadePlan(
  spanMm: number,
  options?: FacadePlanOptions
): FacadePlan {
  const rules = resolveRules(options);
  const usableLength = Math.round(spanMm);

  if (usableLength <= 0) {
    return {
      modules: [],
      cabinetTotal: 0,
      fillerTotal: 0,
      usableLength: 0,
      valid: true,
      residual: 0,
      diagnostics: null,
    };
  }

  const dominant = chooseDominant(usableLength, options);
  const part = bestPartitionFor(usableLength, dominant, options);

  if (!part) {
    return {
      modules: [],
      cabinetTotal: 0,
      fillerTotal: 0,
      usableLength,
      valid: false,
      residual: usableLength,
      diagnostics: [
        `span ${usableLength}mm is impossible: below minimum filler (${rules.minFillerWidth}mm) ` +
          `and below minimum cabinet front (${rules.absoluteMinFront}mm)`,
      ],
    };
  }

  const modules = mergeCells(part.cells, rules.maxMergeModule);
  const cabinetTotal = modules
    .filter((m) => m.kind === "front")
    .reduce((s, m) => s + m.width, 0);
  const fillerTotal = modules
    .filter((m) => m.kind === "filler")
    .reduce((s, m) => s + m.width, 0);

  const residual = usableLength - (cabinetTotal + fillerTotal);

  if (residual !== 0) {
    return {
      modules,
      cabinetTotal,
      fillerTotal,
      usableLength,
      valid: false,
      residual,
      diagnostics: [
        `closure mismatch on ${usableLength}mm span: sum=${cabinetTotal + fillerTotal}mm, residual=${residual}mm`,
      ],
    };
  }

  return {
    modules,
    cabinetTotal,
    fillerTotal,
    usableLength,
    valid: true,
    residual: 0,
    diagnostics: null,
  };
}
