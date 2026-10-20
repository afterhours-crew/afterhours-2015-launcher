import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePin, PIN_FILE } from "./pin.mjs";
import { LAUNCHER_NAME, MARKER_NAME, portableLayout, zipName } from "./portable.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const pin = parsePin(readFileSync(join(root, PIN_FILE), "utf8"));

describe("the no-install ZIP", () => {
  it("is named after the launcher version, beside the installer", () => {
    expect(zipName("0.1.0")).toBe("Afterhours_0.1.0_x64-portable.zip");
    for (const bad of ["v0.1.0", "0.1", "../0.1.0", ""]) expect(() => zipName(bad)).toThrow();
  });

  it("holds the launcher, the pinned server beside it, the marker and the licences", () => {
    const layout = portableLayout({ root, exe: "built.exe", pin });
    expect(layout.map((f) => f.to)).toEqual([
      LAUNCHER_NAME,
      "Afterhours.exe",
      MARKER_NAME,
      "LICENSE",
      "afterhours-server/LICENSE",
      "afterhours-server/THIRD-PARTY-NOTICES.txt",
      "afterhours-server/build-info.json",
    ]);
    expect(layout[0].from).toBe("built.exe");
    // The server is the verified sidecar, checked against the pin.
    expect(layout[1].from).toMatch(/Afterhours-x86_64-pc-windows-msvc\.exe$/);
    expect(layout[1].sha256).toBe(pin.executable_sha256);
  });

  it("uses the marker the app looks for, which tells the user what it is", () => {
    const updates = readFileSync(join(root, "src-tauri", "src", "updates.rs"), "utf8");
    expect(updates).toContain(`PORTABLE_MARKER: &str = "${MARKER_NAME}"`);
    const marker = readFileSync(join(root, "packaging", MARKER_NAME), "utf8");
    expect(marker).toContain(LAUNCHER_NAME);
    expect(marker).toContain("without installing");
  });
});
