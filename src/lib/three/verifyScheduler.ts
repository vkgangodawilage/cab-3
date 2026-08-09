/**
 * Phase 4C — debounced verification runner (pure).
 *
 * Coalesces rapid structural changes (commits, undo, deletes, edits) into a
 * single trailing-window run: every `request()` resets the timer, so the
 * callback only fires after a quiet settle period. Timer functions are
 * injectable so the module is testable in Node without a DOM or RAF.
 *
 * No React / Three.js / Zustand / DOM.
 */

export interface TimerLike {
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface DebouncedRunner {
  /** Reset the trailing window and schedule a run. */
  request(): void;
  /** Cancel any pending run. */
  cancel(): void;
  /** Cancel any pending run and execute immediately. */
  flush(): void;
  /** True while a run is scheduled. */
  readonly pending: boolean;
}

export function createDebouncedRunner(
  run: () => void,
  delayMs: number,
  timers: TimerLike = globalThis as unknown as TimerLike
): DebouncedRunner {
  let timer: unknown = null;

  return {
    request() {
      if (timer !== null) timers.clearTimeout(timer);
      timer = timers.setTimeout(() => {
        timer = null;
        run();
      }, Math.max(0, delayMs));
    },
    cancel() {
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
    },
    flush() {
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      run();
    },
    get pending() {
      return timer !== null;
    },
  };
}
