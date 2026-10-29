import { describe, expect, it } from "vitest";
import { sha256, SIDECAR_TARGET } from "./pin.mjs";
import { previewBundleConfig, validatePreviewServer } from "./preview-package.mjs";

describe("explicit preview package", () => {
  const bytes = Buffer.from("constructed server package");
  const revision = "1".repeat(40);
  const good = {
    dirty_source: false,
    target: SIDECAR_TARGET,
    revision,
    release: "test-prologue",
    executable_sha256: sha256(bytes),
    source: `https://github.com/afterhours-crew/afterhours-2015/tree/${revision}`,
  };
  it("refuses changed bytes, dirty sources and unrelated provenance", () => {
    expect(() => validatePreviewServer(good, bytes)).not.toThrow();
    expect(() => validatePreviewServer(good, Buffer.from("changed"))).toThrow();
    for (const patch of [
      { dirty_source: true },
      { target: "another-target" },
      { revision: "missing" },
      { release: "development" },
      { source: "https://example.com/unrelated" },
    ]) {
      expect(() => validatePreviewServer({ ...good, ...patch }, bytes)).toThrow();
    }
  });
  it("bundles only the explicit server and its notices without changing the pin", () => {
    const config = previewBundleConfig("C:/test package/input");
    expect(config.bundle.externalBin).toEqual(["C:/test package/input/Afterhours"]);
    expect(config.bundle.resources["binaries/afterhours-server/build-info.json"]).toBeNull();
    expect(config.bundle.resources["C:/test package/input/build-info.json"]).toBe(
      "afterhours-server/build-info.json",
    );
    expect(Object.keys(config)).toEqual(["bundle"]);
  });
});
