import { describe, expect, it } from "vitest";
import { MOTION, STAGGER_CAP, countAt, easeOut, reducedMotion, staggerDelay } from "./motion";

describe("motion timing", () => {
  it("stays within 150-250 ms", () => {
    for (const ms of Object.values(MOTION)) {
      expect(ms).toBeGreaterThanOrEqual(150);
      expect(ms).toBeLessThanOrEqual(250);
    }
  });

  it("staggers items 25 ms apart and caps the last start", () => {
    expect([0, 1, 2, 3].map((i) => staggerDelay(i))).toEqual([0, 25, 50, 75]);
    expect(staggerDelay(8)).toBe(STAGGER_CAP);
    expect(staggerDelay(500)).toBe(STAGGER_CAP);
    expect(staggerDelay(3, 30, 60)).toBe(60);
    expect(staggerDelay(-1)).toBe(0);
    expect(staggerDelay(Number.NaN)).toBe(0);
  });

  it("eases out without overshooting", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(2)).toBe(1);
    expect(easeOut(-1)).toBe(0);
    const samples = Array.from({ length: 21 }, (_, i) => easeOut(i / 20));
    for (let i = 1; i < samples.length; i++)
      expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
  });
});

describe("counting up", () => {
  it("starts at zero and ends exactly on the target", () => {
    expect(countAt(250_000, 0)).toBe(0);
    expect(countAt(250_000, MOTION.slow)).toBe(250_000);
    expect(countAt(250_000, 10_000)).toBe(250_000);
  });

  it("only shows whole numbers, rising, never past the target", () => {
    let last = -1;
    for (let ms = 0; ms <= MOTION.slow; ms += 10) {
      const value = countAt(18, ms);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(last);
      expect(value).toBeLessThanOrEqual(18);
      last = value;
    }
  });

  it("handles zero, negatives and no duration", () => {
    expect(countAt(0, 100)).toBe(0);
    expect(countAt(-40, 100)).toBeLessThanOrEqual(0);
    expect(countAt(-40, 100)).toBeGreaterThanOrEqual(-40);
    expect(countAt(99, 0, 0)).toBe(99);
  });

  it("assumes full motion outside a browser", () => {
    expect(reducedMotion()).toBe(false);
  });
});
