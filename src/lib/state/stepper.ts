// The number stepper's arithmetic, kept pure so it is tested.

/** What the field holds as a number; `null` when empty or not a whole number. */
export function typedValue(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * One step from `current` within `min`..`max`. From an empty field (the
 * placeholder, such as Auto) − goes to `min` and + to `min + 1`. A value
 * above `max`, saved elsewhere, steps down to `max` and no further up.
 */
export function stepValue(current: number | null, delta: number, min: number, max: number): number {
  if (current === null) return delta > 0 ? Math.min(max, min + 1) : min;
  return Math.min(max, Math.max(min, current + delta));
}
