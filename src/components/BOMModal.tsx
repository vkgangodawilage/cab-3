"use client";

import { Fragment, useEffect, useMemo } from "react";
import { Calculator, FileDown, Receipt, ShieldCheck, X } from "lucide-react";
import { useDesigner } from "@/store/useStore";
import { runVerification } from "@/lib/three/verifyScene";
import {
  computeCostEstimate,
  formatCurrency,
} from "@/utils/costCalculator";
import type { BOMLine, CountertopFinish } from "@/utils/costCalculator";
import type { VerifyStatus } from "@/lib/planning/planVerification";

/**
 * Slide-over BOM drawer. Renders a live itemized estimate that re-computes on
 * every wall / cabinet / placed-item / cutout change, exposes material rate
 * adjustments, and exports a branded multi-page PDF quotation (jsPDF loaded
 * lazily via dynamic import — no SSR issues).
 */
export function BOMModal() {
  const bomOpen = useDesigner((s) => s.bomOpen);
  const setBomOpen = useDesigner((s) => s.setBomOpen);
  const bomRates = useDesigner((s) => s.bomRates);
  const setBomRates = useDesigner((s) => s.setBomRates);
  const walls = useDesigner((s) => s.walls);
  const cabinets = useDesigner((s) => s.cabinets);
  const placedItems = useDesigner((s) => s.placedItems);
  const placedCutouts = useDesigner((s) => s.placedCutouts);
  const verification = useDesigner((s) => s.verification);
  const setVerification = useDesigner((s) => s.setVerification);
  const verificationStale = useDesigner((s) => s.verificationStale);
  const setVerificationStale = useDesigner((s) => s.setVerificationStale);

  const estimate = useMemo(
    () =>
      computeCostEstimate(
        { walls, cabinets, placedItems, placedCutouts },
        bomRates
      ),
    [walls, cabinets, placedItems, placedCutouts, bomRates]
  );

  const projectId = useMemo(
    () =>
      `KCH-${new Date().getFullYear()}-${Math.random()
        .toString(36)
        .slice(2, 7)
        .toUpperCase()}`,
    []
  );

  useEffect(() => {
    if (!bomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }
      setBomOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bomOpen, setBomOpen]);

  const handleDownload = async () => {
    const { generateQuotationPdf } = await import("@/utils/pdfExporter");
    generateQuotationPdf({
      lines: estimate.lines,
      summary: estimate.summary,
      projectId,
    });
  };

  // Phase 3/4: on-demand plan-vs-built verification (observational only).
  const handleVerify = () => {
    const s = useDesigner.getState();
    const result = runVerification({
      runs: s.cabinets,
      walls: s.walls,
      placedCutouts: s.placedCutouts,
      placedItems: s.placedItems,
      activeCabinetId: s.activeCabinetId,
    });
    setVerification(result);
    setVerificationStale(false);
  };

  const statusColor: Record<VerifyStatus, string> = {
    PASS: "text-emerald-300",
    WARNING: "text-amber-300",
    ERROR: "text-rose-300",
  };

  if (!bomOpen) return null;

  // Group lines by category for a scannable quotation.
  const grouped: { category: string; lines: BOMLine[] }[] = [];
  for (const line of estimate.lines) {
    const group = grouped.find((g) => g.category === line.category);
    if (group) group.lines.push(line);
    else grouped.push({ category: line.category, lines: [line] });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => setBomOpen(false)}
      />
      <aside className="relative flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Receipt size={16} className="text-cyan-300" />
              Cost Estimate &amp; Bill of Materials
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Live estimate · {projectId}
            </p>
          </div>
          <button
            onClick={() => setBomOpen(false)}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Rate adjustments */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-5 py-3 text-xs">
          <label className="flex items-center gap-1.5 text-slate-400">
            Countertop
            <select
              value={bomRates.countertopFinish}
              onChange={(e) =>
                setBomRates({
                  countertopFinish: e.target.value as CountertopFinish,
                })
              }
              className="rounded-md border border-white/10 bg-slate-800 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400/60"
            >
              <option value="standard">Standard Quartz</option>
              <option value="marble">Calacatta Marble (+20%)</option>
              <option value="granite">Granite (+10%)</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-slate-400">
            Tax %
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={(bomRates.taxRate * 100).toFixed(1)}
              onChange={(e) =>
                setBomRates({ taxRate: Number(e.target.value) / 100 })
              }
              className="w-16 rounded-md border border-white/10 bg-slate-800 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400/60"
            />
          </label>
          <label className="flex items-center gap-1.5 text-slate-400">
            Labor %
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={(bomRates.laborRate * 100).toFixed(1)}
              onChange={(e) =>
                setBomRates({ laborRate: Number(e.target.value) / 100 })
              }
              className="w-16 rounded-md border border-white/10 bg-slate-800 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400/60"
            />
          </label>
        </div>

        {/* Itemized table */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-1.5 pr-2 font-medium">Item</th>
                <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
                <th className="py-1.5 pr-2 text-right font-medium">Unit</th>
                <th className="py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    Nothing to quote yet — draw walls, cabinets, or place items.
                  </td>
                </tr>
              )}
              {grouped.map((group) => (
                <Fragment key={group.category}>
                  <tr>
                    <td
                      colSpan={4}
                      className="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300/80"
                    >
                      {group.category}
                    </td>
                  </tr>
                  {group.lines.map((line) => (
                    <tr key={line.id} className="border-b border-white/5">
                      <td className="py-1.5 pr-2 text-slate-300">
                        {line.description}
                        <div className="text-[10px] text-slate-500">
                          {line.dimensions}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 text-right text-slate-300">
                        {line.quantity}
                        {line.unit === "m" ? " m" : line.unit === "m²" ? " m²" : ""}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono text-slate-400">
                        {formatCurrency(line.unitPrice)}
                      </td>
                      <td className="py-1.5 text-right font-mono text-slate-100">
                        {formatCurrency(line.total)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="border-t border-white/10 px-5 py-3 text-xs">
          <div className="flex justify-between py-1 text-slate-400">
            <span>Subtotal</span>
            <span className="font-mono">{formatCurrency(estimate.summary.subtotal)}</span>
          </div>
          <div className="flex justify-between py-1 text-slate-400">
            <span>Estimated Tax ({(bomRates.taxRate * 100).toFixed(0)}%)</span>
            <span className="font-mono">{formatCurrency(estimate.summary.tax)}</span>
          </div>
          <div className="flex justify-between py-1 text-slate-400">
            <span>Installation / Labor ({(bomRates.laborRate * 100).toFixed(0)}%)</span>
            <span className="font-mono">{formatCurrency(estimate.summary.labor)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2.5">
            <span className="flex items-center gap-1.5 font-semibold text-white">
              <Calculator size={15} className="text-cyan-300" /> Grand Total
            </span>
            <span className="font-mono text-sm font-semibold text-cyan-300">
              {formatCurrency(estimate.summary.grandTotal)}
            </span>
          </div>
        </div>

        {/* Plan verification (Phase 3, on-demand) */}
        <div className="border-t border-white/10 px-5 py-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <ShieldCheck size={12} className="text-cyan-300" /> Plan Verification
              {verificationStale && (
                <span className="normal-case tracking-normal text-slate-500">· refreshing…</span>
              )}
            </span>
            <button
              onClick={handleVerify}
              className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
            >
              Verify Plan
            </button>
          </div>
          {verification && (
            <div className="mt-2 space-y-1 text-[11px]">
              <div className={`flex items-center gap-1.5 font-semibold ${statusColor[verification.overall]}`}>
                Overall: {verification.overall}
              </div>
              <div className="text-slate-400">
                {verification.moduleCount} run modules · {verification.passed} PASS · {verification.warnings} WARNING · {verification.errors} ERROR
              </div>
              {verification.placedCount > 0 && (
                <div className="text-slate-400">
                  Placed items · {verification.placedPassed} PASS · {verification.placedWarnings} WARNING · {verification.placedErrors} ERROR
                </div>
              )}
              {verification.endPanelCount > 0 && (
                <div className="text-slate-400">
                  End panels · {verification.endPanelPassed} PASS · {verification.endPanelWarnings} WARNING · {verification.endPanelErrors} ERROR
                </div>
              )}
              {verification.overlapViolations.length > 0 && (
                <div className="text-rose-300/90">
                  Overlap · {verification.overlapViolations.length} error{verification.overlapViolations.length > 1 ? "s" : ""}
                </div>
              )}
              {verification.issues.length === 0 ? (
                <div className="text-emerald-300/90">All modules match the plan within tolerance.</div>
              ) : (
                <ul className="max-h-28 space-y-0.5 overflow-y-auto pr-1">
                  {verification.issues.slice(0, 15).map((issue, i) => (
                    <li key={i} className="text-rose-300/90">{issue}</li>
                  ))}
                  {verification.issues.length > 15 && (
                    <li className="text-slate-500">…and {verification.issues.length - 15} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-white/10 px-5 py-4">
          <button
            onClick={handleDownload}
            disabled={estimate.lines.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileDown size={16} /> Download PDF Quotation
          </button>
        </div>
      </aside>
    </div>
  );
}
