import { describe, expect, it } from "vitest";
import { compareVersions, isNewer, parseVersion } from "./version";

describe("versions", () => {
  it("parses releases and pre-releases with or without a v", () => {
    expect(parseVersion("v0.3.0")).toEqual({ major: 0, minor: 3, patch: 0, pre: [] });
    expect(parseVersion("1.2.3-rc.1+build.5")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      pre: ["rc", "1"],
    });
    for (const bad of ["", "v1", "1.2", "01.2.3", "1.2.3-", "v1.2.3 x", "latest"]) {
      expect(parseVersion(bad), bad).toBeNull();
    }
  });

  it("orders the semver way", () => {
    const ordered = [
      "0.2.9",
      "0.3.0-alpha",
      "0.3.0-alpha.1",
      "0.3.0-alpha.beta",
      "0.3.0-beta",
      "0.3.0-beta.2",
      "0.3.0-beta.11",
      "0.3.0-rc.1",
      "0.3.0",
      "0.3.1",
      "0.10.0",
      "1.0.0",
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(compareVersions(ordered[i - 1]!, ordered[i]!), ordered[i]).toBe(-1);
      expect(compareVersions(ordered[i]!, ordered[i - 1]!), ordered[i]).toBe(1);
    }
    expect(compareVersions("v0.3.0", "0.3.0")).toBe(0);
    expect(compareVersions("0.3.0", "nope")).toBeNull();
  });

  it("only calls a valid, strictly greater version newer", () => {
    expect(isNewer("v0.4.0", "v0.3.0")).toBe(true);
    expect(isNewer("v0.3.0", "v0.3.0")).toBe(false);
    expect(isNewer("v0.2.0", "v0.3.0")).toBe(false);
    expect(isNewer("garbage", "v0.3.0")).toBe(false);
  });
});
