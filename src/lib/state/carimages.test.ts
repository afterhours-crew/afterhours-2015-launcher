import { describe, expect, it } from "vitest";
import type { CarImage, CarImages } from "$lib/api/types";
import { carImagePath, insideDir, needsCarImages } from "./carimages";
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
