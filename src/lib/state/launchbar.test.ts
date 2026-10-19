import { describe, expect, it } from "vitest";
import { detectPlatform, firstRunChecks, initials, launchBarModel } from "./launchbar";
import type { Preflight, Status } from "$lib/api/types";

function status(state: Status["state"], message = "m"): Status {
  return {
    version: 1,
    id: "a".repeat(32),
    utc: "2026-10-16T09:00:00Z",
    state,
    message,
    worker_pid: 1,
    game_pid: null,
    server_pid: 2,
  };
}

const base = {
  platform: "windows" as const,
  serverReady: true,
  updating: false,
  gameChosen: true,
  status: null,
  running: false,
};

describe("launch bar", () => {
  it("offers Play on Windows and Serve elsewhere when idle", () => {
    const win = launchBarModel(base);
    expect(win.play).toMatchObject({ label: "Play", action: "start", disabled: false });
    const mac = launchBarModel({ ...base, platform: "other" });
    expect(mac.play).toMatchObject({ label: "Serve", action: "serve", disabled: false });
    // The bar names the server, never a car.
    for (const model of [win, mac]) {
      expect(model).toMatchObject({
        eyebrow: "Playing on",
        title: "Your server",
        summary: "Offline · this PC only",
      });
    }
  });

  it("says why Play is disabled instead of just disabling it", () => {
    expect(launchBarModel({ ...base, serverReady: false }).play).toMatchObject({
      disabled: true,
      reason: "Server missing · see Settings › About",
    });
    expect(launchBarModel({ ...base, updating: true }).play).toMatchObject({
      disabled: true,
      reason: "Installing an update",
    });
    const noGame = launchBarModel({ ...base, gameChosen: false });
    expect(noGame.play.reason).toBe("Choose the game folder");
    expect(noGame.stateLine).toBe("Choose the game folder");
    expect(noGame.dot).toBe("warn");
  });

  it("follows the session states while live", () => {
    expect(
      launchBarModel({ ...base, running: true, status: status("preparing") }).play,
    ).toMatchObject({
      label: "Preparing",
      busy: true,
      disabled: true,
    });
    const activation = launchBarModel({ ...base, running: true, status: status("activation") });
    expect(activation.play.label).toBe("Sign in");
    expect(activation.dot).toBe("warn");
    const ready = launchBarModel({ ...base, running: true, status: status("ready") });
    expect(ready.play).toMatchObject({
      label: "Stop",
      action: "stop",
      disabled: false,
      busy: false,
    });
    expect(ready.dot).toBe("ready");
    expect(ready.summary).toBe("Running · this PC only");
    expect(launchBarModel({ ...base, status: status("finished") }).summary).toBe(
      "Offline · this PC only",
    );
    expect(ready.stateLine).toContain("Press Space");
  });

  it("reports a failed or interrupted last session and allows a new one", () => {
    const failed = launchBarModel({
      ...base,
      status: status("failed", "Game exited with code 0x00000001."),
    });
    expect(failed.play.disabled).toBe(false);
    expect(failed.stateLine).toContain("Game exited");
    expect(failed.dot).toBe("warn");
    const interrupted = launchBarModel({ ...base, status: status("interrupted") });
    expect(interrupted.stateLine).toContain("interrupted");
  });

  it("detects the platform from the user agent", () => {
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe("other");
  });
});

describe("first run checks", () => {
  const preflight: Preflight = {
    version: 1,
    game_directory: "F:\\EA Games\\Need for Speed",
    data_directory: "C:\\Users\\me\\AppData\\Local\\Afterhours2015",
    server_path: "C:\\b\\nfs-server.exe",
    server_sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    game_sha256: "92aa",
    activation_sha256: "5901",
    registered_client_path: "C:\\EA\\EADesktop.exe",
    compatibility_name: "EADesktopDebug.exe",
    requires_administrator: false,
    machine_changes: [],
    directory_write_access: "checked during setup",
  };

  it("lists the game, server, data folder, registration and machine changes on Windows", () => {
    const rows = firstRunChecks(preflight, "windows");
    expect(rows.map((r) => r.label)).toEqual([
      "Game executable",
      "Server",
      "Data folder",
      "Launcher registration",
      "Machine changes",
    ]);
    expect(rows.every((r) => r.ok)).toBe(true);
    expect(rows[1]!.value).toBe("build 0123456789ab");
  });

  it("omits registration elsewhere", () => {
    const rows = firstRunChecks({ ...preflight, compatibility_name: null }, "other");
    expect(rows.some((r) => r.label === "Launcher registration")).toBe(false);
  });
});

describe("initials", () => {
  it("takes the first letters of up to two words", () => {
    expect(initials("Driver_01")).toBe("D0");
    expect(initials("Nova")).toBe("NO");
    expect(initials("Kaj Lindqvist")).toBe("KL");
    expect(initials("   ")).toBe("?");
  });
});
