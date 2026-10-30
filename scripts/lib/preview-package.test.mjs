import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256, SIDECAR_TARGET } from "./pin.mjs";
import {
  previewBundleConfig,
  previewPortableLayout,
  validatePreviewServer,
} from "./preview-package.mjs";

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
    expect(config.bundle.externalBin).toEqual(["C:/test package/input/Afterhours2015Server"]);
    expect(config.bundle.resources["binaries/afterhours-server/build-info.json"]).toBeNull();
    expect(config.bundle.resources["C:/test package/input/build-info.json"]).toBe(
      "afterhours-server/build-info.json",
    );
    expect(Object.keys(config)).toEqual(["bundle"]);
  });
  it("ships the candidate in the portable ZIP and rejects replaced candidate bytes", () => {
    const options = {
      root: "/checkout",
      exe: "/built/launcher.exe",
      input: "/candidate/input",
      info: good,
      bytes,
    };
    const layout = previewPortableLayout(options);
    expect(layout.map((file) => file.to)).toEqual([
      "Afterhours2015Launcher.exe",
      "Afterhours2015Server.exe",
      "portable.txt",
      "LICENSE",
      "afterhours-server/LICENSE",
      "afterhours-server/THIRD-PARTY-NOTICES.txt",
      "afterhours-server/build-info.json",
    ]);
    expect(layout[1].from.replaceAll("\\", "/")).toBe(
      "/candidate/input/Afterhours2015Server-x86_64-pc-windows-msvc.exe",
    );
    expect(layout[1].sha256).toBe(good.executable_sha256);
    expect(layout[2].from.replaceAll("\\", "/")).toBe("/checkout/packaging/preview-portable.txt");
    expect(layout[6].from.replaceAll("\\", "/")).toBe("/candidate/input/build-info.json");
    expect(() =>
      previewPortableLayout({ ...options, bytes: Buffer.from("wrong server") }),
    ).toThrow();
  });
  it("gives preview users instructions for their actual update and data settings", () => {
    const root = resolve(import.meta.dirname, "../..");
    const marker = readFileSync(resolve(root, "packaging/preview-portable.txt"), "utf8");
    const config = JSON.parse(readFileSync(resolve(root, "packaging/prologue-preview.json")));
    expect(marker).toContain("Afterhours2015Launcher.exe");
    expect(marker).toContain("Afterhours2015Server.exe");
    expect(marker).toContain(`%LOCALAPPDATA%\\${config.identifier}\\server`);
    expect(marker).toContain("automatic updates disabled");
    expect(config.plugins.updater.endpoints).toEqual([]);
  });
});
