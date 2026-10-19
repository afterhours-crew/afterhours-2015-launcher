import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkBuildInfo,
  formatPin,
  isReleaseTag,
  parsePin,
  parseSums,
  schemaAssets,
  sha256,
  sidecarPath,
} from "./pin.mjs";

const PIN = {
  repository: "afterhours-crew/afterhours-2015",
  tag: "v0.3.0",
  asset: "Afterhours-windows-x64.zip",
  asset_sha256: "714d8a8ce85189d121ade4ade35f9d6cdc4a8f35cdd8d19e2484332e5322572e",
  executable: "Afterhours.exe",
  executable_sha256: "e5ac1e6f28619595b657573a02ac92b04e77279e817bdfc1fc3432f894811efe",
  schemas: "vendored",
};

describe("the pin", () => {
  it("parses the committed file and writes it back byte for byte", () => {
    const text = readFileSync(new URL("../../server-pin.json", import.meta.url), "utf8");
    const pin = parsePin(text);
    expect(formatPin(pin)).toBe(text.replace(/\r\n/g, "\n"));
  });

  it("refuses anything but exact, valid fields", () => {
    expect(parsePin(JSON.stringify(PIN))).toEqual(PIN);
    const bad = [
      { ...PIN, tag: "0.3.0" },
      { ...PIN, tag: "v0.3" },
      { ...PIN, asset_sha256: PIN.asset_sha256.toUpperCase() },
      { ...PIN, executable: "../Afterhours.exe" },
      { ...PIN, executable: "Afterhours" },
      { ...PIN, repository: "afterhours-2015" },
      { ...PIN, schemas: "guessed" },
      { ...PIN, extra: 1 },
    ];
    for (const pin of bad) expect(() => parsePin(JSON.stringify(pin))).toThrow();
    const { tag: _, ...missing } = PIN;
    expect(() => parsePin(JSON.stringify(missing))).toThrow();
    expect(() => parsePin("[]")).toThrow();
    expect(() => parsePin("{")).toThrow();
  });

  it("agrees with the Rust side on tags", () => {
    for (const good of ["v0.3.0", "v1.0.0-rc.1"]) expect(isReleaseTag(good)).toBe(true);
    for (const bad of ["v01.2.3", "v1.2", "1.2.3", "v1.2.3-"])
      expect(isReleaseTag(bad)).toBe(false);
  });

  it("names the sidecar the way Tauri's externalBin expects", () => {
    expect(sidecarPath("/r", PIN).replace(/\\/g, "/")).toBe(
      "/r/src-tauri/binaries/Afterhours-x86_64-pc-windows-msvc.exe",
    );
  });
});

describe("release checksums", () => {
  it("parses SHA256SUMS.txt in both sha256sum styles", () => {
    const sums = parseSums(
      `${PIN.asset_sha256}  Afterhours-windows-x64.zip\r\n${"A".repeat(64)} *status.schema.json\n\n`,
    );
    expect(sums.get("Afterhours-windows-x64.zip")).toBe(PIN.asset_sha256);
    expect(sums.get("status.schema.json")).toBe("a".repeat(64));
    expect(() => parseSums("not a line")).toThrow();
    expect(() => parseSums(`${"a".repeat(64)}  x\n${"b".repeat(64)}  x`)).toThrow();
  });

  it("hashes bytes", () => {
    expect(sha256(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("only takes schema assets the checksums list", () => {
    const sums = new Map([
      ["status.schema.json", "a".repeat(64)],
      ["launcher-schemas.zip", "b".repeat(64)],
    ]);
    const assets = [
      { name: "status.schema.json", browser_download_url: "u1" },
      { name: "launcher-schemas.zip", browser_download_url: "u2" },
      { name: "Afterhours-windows-x64.zip", browser_download_url: "u3" },
    ];
    expect(schemaAssets(assets, sums).map((a) => [a.name, a.archive])).toEqual([
      ["launcher-schemas.zip", true],
      ["status.schema.json", false],
    ]);
    expect(() =>
      schemaAssets([{ name: "check.schema.json", browser_download_url: "u" }], sums),
    ).toThrow(/not listed/);
  });

  it("checks build-info.json against the pin", () => {
    const info = {
      release: "v0.3.0",
      executable_sha256: PIN.executable_sha256,
      dirty_source: false,
    };
    expect(() => checkBuildInfo(info, PIN)).not.toThrow();
    expect(() => checkBuildInfo({ ...info, release: "v0.2.0" }, PIN)).toThrow();
    expect(() => checkBuildInfo({ ...info, executable_sha256: "0".repeat(64) }, PIN)).toThrow();
    expect(() => checkBuildInfo({ ...info, dirty_source: true }, PIN)).toThrow();
  });
});
