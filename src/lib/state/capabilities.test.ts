import { describe, expect, it } from "vitest";
import { hasCapability } from "./capabilities";

describe("capabilities", () => {
  it("are only what the server reports", () => {
    const v1 = { capabilities: ["profile", "sessions", "events"] };
    expect(hasCapability(v1, "profile")).toBe(true);
    expect(hasCapability(v1, "map")).toBe(false);
    expect(hasCapability({ capabilities: ["map"] }, "map")).toBe(true);
  });

  it("are none for a server without version --json, or no server", () => {
    expect(hasCapability({ capabilities: null }, "map")).toBe(false);
    expect(hasCapability(null, "profile")).toBe(false);
    expect(hasCapability(undefined, "profile")).toBe(false);
  });
});
