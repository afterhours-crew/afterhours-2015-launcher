// Timing for the window's motion: view changes, entering panels and rows,
// numbers counting up, controls easing between states. Short (150-250 ms),
// ease-out, no bounce, and nothing waits on it: input is never delayed.
// With `prefers-reduced-motion` all of it is off (app.css stops CSS
// animation and transitions; the script-driven parts check reducedMotion).

/** Durations in milliseconds. */
export const MOTION = {
  /** Hover and press feedback, the outgoing view. */
  fast: 150,
  /** Most transitions: pills sliding, switches, state changes. */
  base: 200,
  /** Entering views and panels, bars growing, numbers counting. */
  slow: 250,
} as const;

/** Rows and panels enter one after another, this far apart. */
export const STAGGER_STEP = 25;
/** The last one starts no later than this, however long the list. */
export const STAGGER_CAP = 200;

/** When the `index`-th entering item starts, in ms: stepped, then capped. */
export function staggerDelay(index: number, step = STAGGER_STEP, cap = STAGGER_CAP): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.floor(index) * step, cap);
}

/** Ease-out cubic over 0..1: fast at first, settling at the end, no overshoot. */
export function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/**
 * A number counting up to `target` over `duration` ms, `elapsed` ms in:
 * whole numbers only, never past the target, exactly the target at the end.
 */
export function countAt(target: number, elapsed: number, duration: number = MOTION.slow): number {
  if (!Number.isFinite(target)) return target;
  if (duration <= 0 || elapsed >= duration) return target;
  const value = target * easeOut(elapsed / duration);
  return target < 0 ? Math.ceil(value) : Math.floor(value);
}

/** Whether the person asked for less motion. False outside a browser. */
export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
