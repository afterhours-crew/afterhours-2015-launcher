import { describe, expect, it } from "vitest";
import { worldNote } from "./world";

describe("the World note", () => {
  it("names what waits for a server update", () => {
    expect(worldNote(false)).toBe(
      "Traffic, roaming rivals and cops arrive with a later server update.",
    );
  });

  it("says the launcher is behind once the server reports world settings", () => {
    expect(worldNote(true)).toMatch(/^Your server reports world settings\./);
  });
});
