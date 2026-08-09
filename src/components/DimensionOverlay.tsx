"use client";

import { Html } from "@react-three/drei";
import { useDesigner } from "@/store/useStore";
import type { Vec2 } from "@/lib/geometry";

interface DimensionOverlayProps {
  /** Point A — the last committed vertex of the active run. */
  a: Vec2;
}

/**
 * Floating dimension readout + interactive length input, attached with drei
 * `<Html />` at the midpoint of the preview segment A → B.
 *
 * Direction vector V is locked the moment the user starts typing (or focuses
 * the input), so B = A + (V × Length). Pressing Enter commits that exact
 * point. Manual mouse drawing remains available as a fallback.
 */
export function DimensionOverlay({ a }: DimensionOverlayProps) {
  const pending = useDesigner((s) => s.pending);
  const typedLength = useDesigner((s) => s.typedLength);
  const lockedVector = useDesigner((s) => s.lockedVector);
  const setTypedLength = useDesigner((s) => s.setTypedLength);
  const lockVectorFromCursor = useDesigner((s) => s.lockVectorFromCursor);
  const commitTypedLength = useDesigner((s) => s.commitTypedLength);

  const L = parseFloat(typedLength);
  const typedValid =
    typedLength.trim().length > 0 && isFinite(L) && L > 0;

  const b: Vec2 | null =
    typedValid && lockedVector
      ? { x: a.x + lockedVector.x * L, z: a.z + lockedVector.z * L }
      : pending;

  if (!b) return null;

  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };

  return (
    <Html position={[mid.x, 0.5, mid.z]} center zIndexRange={[40, 0]}>
      <div className="pointer-events-none flex select-none flex-col items-center gap-1">
        <div className="whitespace-nowrap rounded-md border border-cyan-400/30 bg-cyan-950/80 px-2 py-0.5 font-mono text-[11px] leading-none text-cyan-200 shadow-lg backdrop-blur-sm">
          {len.toFixed(2)} m
        </div>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={typedLength}
          onFocus={lockVectorFromCursor}
          onChange={(e) => setTypedLength(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitTypedLength();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.currentTarget.blur();
            }
            e.stopPropagation();
          }}
          placeholder="Length"
          className="pointer-events-auto w-24 rounded-md border border-white/15 bg-slate-900/90 px-2 py-1 text-center font-mono text-xs text-white outline-none backdrop-blur-md placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/30"
        />
      </div>
    </Html>
  );
}
