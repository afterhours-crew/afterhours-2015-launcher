import { describe, expect, it } from "vitest";
import { navItems } from "./routes";
import { UPCOMING, listSentence, listText } from "./upcoming";
import { stepValue, typedValue } from "./stepper";

describe("coming in a future update", () => {
  it("uses one label everywhere", () => {
    expect(UPCOMING).toBe("Coming in a future update");
  });

  it("lists what is coming as plain English", () => {
    expect(listText([])).toBe("");
    expect(listText(["cops"])).toBe("cops");
    expect(listText(["traffic up to 5x", "cops"])).toBe("traffic up to 5x and cops");
    expect(listText(["a", "b", "c"])).toBe("a, b and c");
    expect(listSentence(["traffic up to 5x", "cops"])).toBe("Traffic up to 5x and cops.");
    expect(listSentence([])).toBe("");
  });

  it("marks the Map tab, and only it, as coming until the server can draw the map", () => {
    const coming = (ready: boolean) =>
      navItems(() => ready)
        .filter((item) => item.upcoming)
        .map((item) => item.id);
    expect(coming(false)).toEqual(["map"]);
    expect(coming(true)).toEqual([]);
  });
});

describe("the number stepper", () => {
  it("reads whole numbers only", () => {
    expect(typedValue("7")).toBe(7);
    expect(typedValue("07")).toBe(7);
    for (const bad of ["", "-1", "1.5", "x", " 3"]) expect(typedValue(bad)).toBeNull();
  });

  it("steps within its bounds", () => {
    expect(stepValue(3, 1, 0, 15)).toBe(4);
    expect(stepValue(3, -1, 0, 15)).toBe(2);
    expect(stepValue(15, 1, 0, 15)).toBe(15);
    expect(stepValue(0, -1, 0, 15)).toBe(0);
  });

  it("starts from Auto at 0 going down and 1 going up", () => {
    expect(stepValue(null, -1, 0, 15)).toBe(0);
    expect(stepValue(null, 1, 0, 15)).toBe(1);
  });

  it("brings a value saved above the maximum down to it", () => {
    expect(stepValue(40, -1, 0, 15)).toBe(15);
  });
});
