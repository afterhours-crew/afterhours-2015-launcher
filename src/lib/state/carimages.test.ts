import { describe, expect, it } from "vitest";
import type { CarImage, CarImages } from "$lib/api/types";
import {
  carPicture,
  coverRect,
  insideDir,
  needsCarImages,
  parseRatio,
  type ImageSize,
} from "./carimages";
import { groupCars } from "./cars";
import { SAMPLE_CARS, SAMPLE_PROFILE } from "./sample";

const DIR =
  "C:\\Users\\Driver\\AppData\\Local\\Afterhours2015\\artifacts\\content\\car-images\\f00d";
const png = (name: string, size: number): CarImage => ({
  path: `${DIR}\\${name}.png`,
  width: size,
  height: size,
  source_format: "BC1_UNORM",
});
const both: CarImages = { medium: png("m", 256), large: png("l", 512) };
const carImagePath = (
  image: CarImages | null | undefined,
  size: ImageSize,
  enabled: boolean,
  dir: string | null,
) => carPicture(image, size, enabled, dir)?.path ?? null;

describe("choosing a car's picture", () => {
  it("takes the medium picture for thumbnails and the large one for the panel", () => {
    expect(carImagePath(both, "medium", true, DIR)).toBe(`${DIR}\\m.png`);
    expect(carImagePath(both, "large", true, DIR)).toBe(`${DIR}\\l.png`);
  });

  it("falls back to the other size when one is missing", () => {
    expect(carImagePath({ medium: null, large: png("l", 512) }, "medium", true, DIR)).toBe(
      `${DIR}\\l.png`,
    );
    expect(carImagePath({ medium: png("m", 256), large: null }, "large", true, DIR)).toBe(
      `${DIR}\\m.png`,
    );
  });

  it("shows the squeezed large pictures at 16:9 and the medium ones square", () => {
    expect(carPicture(both, "large", true, DIR)?.aspect).toBeCloseTo(16 / 9);
    expect(carPicture(both, "medium", true, DIR)?.aspect).toBe(1);
    // The aspect follows the picture used, not the size asked for.
    expect(
      carPicture({ medium: null, large: png("l", 512) }, "medium", true, DIR)?.aspect,
    ).toBeCloseTo(16 / 9);
    expect(carPicture({ medium: png("m", 256), large: null }, "large", true, DIR)?.aspect).toBe(1);
  });

  it("shows the placeholder for a car without pictures or before they exist", () => {
    expect(carImagePath({ medium: null, large: null }, "medium", true, DIR)).toBeNull();
    expect(carImagePath(null, "large", true, DIR)).toBeNull();
    expect(carImagePath(undefined, "large", true, DIR)).toBeNull();
    expect(carImagePath(both, "large", true, null)).toBeNull();
  });

  it("shows nothing without the server's car-images capability", () => {
    expect(carImagePath(both, "medium", false, DIR)).toBeNull();
    expect(carImagePath(both, "large", false, DIR)).toBeNull();
  });

  it("never uses a file outside the image folder", () => {
    const outside: CarImages = {
      medium: { ...png("m", 256), path: "C:\\Users\\Driver\\secret.png" },
      large: { ...png("l", 512), path: `${DIR}\\..\\..\\account\\save.png` },
    };
    expect(carImagePath(outside, "medium", true, DIR)).toBeNull();
    expect(carImagePath(outside, "large", true, DIR)).toBeNull();
  });

  it("gives grouped identical cars one picture, their first car's", () => {
    const stored = SAMPLE_CARS.find((c) => c.location === "warehouse")!;
    const withImage = { ...stored, image: both };
    const groups = groupCars([withImage, { ...withImage, id: "c2" }, { ...withImage, id: "c3" }]);
    expect(groups).toHaveLength(1);
    expect(carImagePath(groups[0]!.car.image, "medium", true, DIR)).toBe(`${DIR}\\m.png`);
  });
});

describe("fitting a picture to its box", () => {
  it("reads CSS aspect ratios", () => {
    expect(parseRatio("16 / 9")).toBeCloseTo(16 / 9);
    expect(parseRatio("72 / 40")).toBeCloseTo(1.8);
    expect(parseRatio("1.5")).toBe(1.5);
    for (const bad of ["", "wide", "1 / 0", "-1 / 2"]) expect(parseRatio(bad)).toBe(1);
  });

  it("fills a 16:9 box exactly with a 16:9 picture", () => {
    expect(coverRect(16 / 9, 16 / 9)).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });

  it("covers a wider box by overflowing top and bottom, a bit more at the top", () => {
    const rect = coverRect(1, 1.8);
    expect(rect.width).toBe(100);
    expect(rect.height).toBeCloseTo(180);
    expect(rect.top).toBeCloseTo(-46.4);
    expect(rect.left).toBe(0);
  });

  it("covers a narrower box by overflowing both sides equally", () => {
    const rect = coverRect(16 / 9, 1);
    expect(rect.height).toBe(100);
    expect(rect.width).toBeCloseTo(177.78, 1);
    expect(rect.left).toBeCloseTo(-38.89, 1);
    expect(rect.top).toBe(0);
  });
});

describe("the image folder", () => {
  it("matches either separator and any case, and only below the folder", () => {
    expect(insideDir(`${DIR}\\a.png`, DIR)).toBe(true);
    expect(insideDir(`${DIR.toUpperCase().replace(/\\/g, "/")}/a.png`, DIR)).toBe(true);
    expect(insideDir(DIR, DIR)).toBe(false);
    expect(insideDir(`${DIR}-other\\a.png`, DIR)).toBe(false);
    expect(insideDir(`${DIR}\\..\\a.png`, DIR)).toBe(false);
    expect(insideDir("a.png", "")).toBe(false);
  });
});

describe("running car-images", () => {
  it("runs when the server can and the profile has no image set", () => {
    const missing = { ...SAMPLE_PROFILE, car_images: null };
    expect(needsCarImages(missing, true)).toBe(true);
    expect(needsCarImages(missing, false)).toBe(false);
    expect(needsCarImages({ ...missing, cars: null }, true)).toBe(false);
    expect(needsCarImages({ ...SAMPLE_PROFILE, car_images: DIR }, true)).toBe(false);
    expect(needsCarImages(null, true)).toBe(false);
  });
});
