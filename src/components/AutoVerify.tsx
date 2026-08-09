"use client";

import { useEffect, useRef } from "react";
import { useDesigner } from "@/store/useStore";
import { runVerification } from "@/lib/three/verifyScene";
import { createDebouncedRunner } from "@/lib/three/verifyScheduler";
import type { DebouncedRunner } from "@/lib/three/verifyScheduler";
import { VERIFY_DEFAULTS } from "@/lib/planning/config";

/**
 * Phase 4C — automatic Plan Verification refresh.
 *
 * Renders nothing. Watches `verifyRevision` (bumped by the store on every
 * structural change: commit, undo, delete, edit). Each bump is debounced into a
 * trailing window so rapid bursts coalesce into a single run, and the run is
 * deferred one animation frame so the committed scene has fully registered its
 * runtime Object3D refs and R3F has applied transforms.
 *
 * Uses the exact same `runVerification` pipeline as the manual Verify Plan
 * button. A completed run clears the stale flag; the debounce window is marked
 * stale so an old result is never presented as current.
 */
export function AutoVerify() {
  const verifyRevision = useDesigner((s) => s.verifyRevision);

  const runnerRef = useRef<DebouncedRunner | null>(null);
  if (runnerRef.current === null) {
    runnerRef.current = createDebouncedRunner(() => {
      requestAnimationFrame(() => {
        const s = useDesigner.getState();
        const result = runVerification({
          runs: s.cabinets,
          walls: s.walls,
          placedCutouts: s.placedCutouts,
          placedItems: s.placedItems,
          activeCabinetId: s.activeCabinetId,
        });
        s.setVerification(result);
        s.setVerificationStale(false);
      });
    }, VERIFY_DEFAULTS.verifyAutoDebounceMs);
  }

  // Trailing-window coalescing: the previous effect's cleanup cancels any
  // pending run before the new one is scheduled.
  useEffect(() => {
    if (verifyRevision === 0) return;
    runnerRef.current?.request();
    return () => runnerRef.current?.cancel();
  }, [verifyRevision]);

  useEffect(() => () => runnerRef.current?.cancel(), []);

  return null;
}
