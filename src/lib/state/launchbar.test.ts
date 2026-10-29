import { describe, expect, it } from "vitest";
import {
  RESTART_HINT,
  detectPlatform,
  firstRunChecks,
  initials,
  launchBarModel,
  sessionPhase,
} from "./launchbar";
import type { Preflight, Status } from "$lib/api/types";

const GAME_STATES: readonly Status["state"][] = ["starting", "activation", "ready", "stopping"];

/** A `start` session: its game runs from starting until it stops. */
function status(state: Status["state"], message = "m", extra: Partial<Status> = {}): Status {
  const game = GAME_STATES.includes(state);
  return {
    version: 1,
    id: "a".repeat(32),
    action: "start",
    game_running: game,
    utc: "2026-10-16T09:00:00Z",
    state,
    message,
    worker_pid: 1,
    game_pid: game ? 3 : null,
    server_pid: 2,
    ...extra,
  };
}

/** A `serve` session in `state`, with or without a game started by `play`. */
function serve(state: Status["state"], game: boolean): Status {
  return status(state, "m", { action: "serve", game_running: game, game_pid: game ? 3 : null });
}

const base = {
  platform: "windows" as const,
  serverReady: true,
  updating: false,
  gameChosen: true,
  status: null,
  running: false,
  canPlay: false,
};

it("uses local preparation hints only while preparing and leaves Play gated", () => {
  const input = {
    ...base,
    running: true,
    preparation: "Races loaded from cache · preparing prologue",
    status: status("preparing"),
  };
  const model = launchBarModel(input);
  expect(model.stateLine).toBe(input.preparation);
  expect(model.play.disabled).toBe(true);
  expect(launchBarModel({ ...input, status: status("starting") }).stateLine).not.toBe(
    input.preparation,
  );
  expect(
    launchBarModel({ ...input, server: { name: "Friend", address: "192.0.2.1" } }).stateLine,
  ).toBe("Checking game files and your account");
});

/** Every string the bar and the pill show. */
function shown(model: ReturnType<typeof launchBarModel>): string[] {
  return [
    model.summary,
    model.stateLine,
    model.play.label,
    model.play.hint ?? "",
    model.pill.label,
    model.pill.title,
    model.pill.caption ?? "",
  ];
}

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

  it("names the server picked on another PC and where it is", () => {
    const remote = { name: "Garage PC", address: "192.168.1.32:61234" };
    expect(launchBarModel({ ...base, server: remote })).toMatchObject({
      title: "Garage PC",
      summary: "Offline · 192.168.1.32:61234",
    });
    expect(
      launchBarModel({ ...base, server: remote, running: true, status: status("ready") }).summary,
    ).toBe("Running · 192.168.1.32:61234");
    expect(launchBarModel({ ...base, server: null }).title).toBe("Your server");
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

  it("gives the header pill the launch bar's action in every state", () => {
    const cases = [
      base,
      { ...base, platform: "other" as const },
      { ...base, serverReady: false },
      { ...base, gameChosen: false },
      { ...base, running: true },
      { ...base, status: status("failed") },
      ...(["preparing", "starting", "activation", "ready", "stopping"] as const).flatMap((s) => [
        { ...base, running: true, status: status(s) },
        { ...base, running: true, status: serve(s, false) },
        { ...base, running: true, status: serve(s, true) },
        { ...base, running: true, canPlay: true, status: serve(s, false) },
      ]),
    ];
    for (const input of cases) {
      const model = launchBarModel(input);
      expect(model.pill.action).toBe(model.play.action);
      expect(model.pill.disabled).toBe(model.play.disabled);
      expect(model.pill.dot).toBe(model.dot);
    }
  });

  it("shows a blue Play pill when it can start, saying what it does", () => {
    expect(launchBarModel(base).pill).toEqual({
      kind: "play",
      label: "Play",
      action: "start",
      disabled: false,
      title: "Play: start your server and the game",
      dot: null,
      caption: null,
    });
    expect(launchBarModel({ ...base, platform: "other" }).pill).toMatchObject({
      kind: "play",
      label: "Serve",
      title: "Serve: start your server",
    });
  });

  it("names the reason on a disabled pill, as tooltip and caption", () => {
    expect(launchBarModel({ ...base, gameChosen: false }).pill).toMatchObject({
      kind: "blocked",
      label: "Play",
      disabled: true,
      title: "Choose the game folder",
      caption: "Choose the game folder",
    });
    expect(launchBarModel({ ...base, running: true }).pill).toMatchObject({
      kind: "blocked",
      title: "Finishing up",
    });
    const failed = launchBarModel({ ...base, status: status("failed", "Game exited.") }).pill;
    expect(failed).toMatchObject({ kind: "play", disabled: false });
    expect(failed.caption).toBe("Last session failed · Game exited.");
  });

  it("names the session state while live and stops when ready", () => {
    const ready = launchBarModel({ ...base, running: true, status: status("ready") }).pill;
    expect(ready).toMatchObject({ kind: "live", label: "In game", action: "stop", dot: "ready" });
    expect(ready.title).toBe("In game · Press Space in the game · Stop");
    const serving = launchBarModel({
      ...base,
      platform: "other",
      running: true,
      status: serve("ready", false),
    }).pill;
    expect(serving.label).toBe("Running");
    const starting = launchBarModel({ ...base, running: true, status: status("starting") }).pill;
    expect(starting).toMatchObject({
      kind: "live",
      label: "Starting",
      action: null,
      disabled: true,
    });
    expect(starting.caption).toContain("wait for ready");
  });

  it("detects the platform from the user agent", () => {
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe("other");
  });
});

describe("hosting and playing", () => {
  // The session's action and whether its game runs give the phase; the
  // phase and the server's `play` capability give what Play does.
  const live = { ...base, running: true };
  const withPlay = { ...live, canPlay: true };

  it("derives the phase from the action and whether the game runs", () => {
    expect(sessionPhase(null)).toBe("idle");
    for (const ended of ["finished", "failed", "interrupted"] as const) {
      expect(sessionPhase(status(ended))).toBe("idle");
      expect(sessionPhase(serve(ended, false))).toBe("idle");
    }
    expect(sessionPhase(serve("preparing", false))).toBe("preparing");
    expect(sessionPhase(serve("ready", false))).toBe("hosting");
    expect(sessionPhase(serve("starting", true))).toBe("starting");
    expect(sessionPhase(serve("activation", true))).toBe("activation");
    expect(sessionPhase(serve("ready", true))).toBe("in-game");
    expect(sessionPhase(serve("stopping", false))).toBe("stopping");
    expect(sessionPhase(serve("stopping", true))).toBe("stopping");
    expect(sessionPhase(status("ready"))).toBe("in-game");
    // A `start` session is always playing once ready, even if its record says no game.
    expect(sessionPhase(status("ready", "m", { game_running: false }))).toBe("in-game");
  });

  it("with no session, Play starts the server and the game, whatever the server can do", () => {
    for (const input of [base, { ...base, canPlay: true }]) {
      expect(launchBarModel(input).play).toEqual({
        label: "Play",
        action: "start",
        disabled: false,
        reason: null,
        hint: null,
        busy: false,
      });
    }
  });

  it("shows a serve session without a game as hosting, never in game", () => {
    for (const input of [live, withPlay]) {
      const model = launchBarModel({ ...input, status: serve("ready", false) });
      expect(model.stateLine).toBe("Hosting · server running");
      expect(model.summary).toBe("Running · this PC only");
      expect(model.dot).toBe("ready");
      expect(model.pill).toMatchObject({ kind: "play", disabled: false });
      expect(model.pill.label).toBe(model.play.label);
      expect(model.pill.caption).toBe("Hosting · server running");
      for (const text of shown(model)) expect(text).not.toMatch(/in game/i);
    }
  });

  it("while hosting, Play starts the game in the session when the server can", () => {
    const model = launchBarModel({ ...withPlay, status: serve("ready", false) });
    expect(model.play).toEqual({
      label: "Play",
      action: "play",
      disabled: false,
      reason: null,
      hint: null,
      busy: false,
    });
    expect(model.pill).toMatchObject({
      label: "Play",
      action: "play",
      title: "Play: start the game on your running server",
    });
  });

  it("while hosting on an older server, Play restarts it with the game and says so", () => {
    const model = launchBarModel({ ...live, status: serve("ready", false) });
    expect(model.play).toEqual({
      label: "Restart with game",
      action: "restart",
      disabled: false,
      reason: null,
      hint: RESTART_HINT,
      busy: false,
    });
    expect(model.pill).toMatchObject({ label: "Restart with game", action: "restart" });
    expect(model.pill.title).toContain(RESTART_HINT);
    expect(RESTART_HINT).toMatch(/restart/i);
  });

  it("follows a game started in the session through starting to in game", () => {
    for (const input of [live, withPlay]) {
      const starting = launchBarModel({ ...input, status: serve("starting", true) });
      expect(starting.play).toMatchObject({ label: "Starting", action: null, busy: true });
      expect(starting.pill).toMatchObject({ kind: "live", label: "Starting", disabled: true });
      const activation = launchBarModel({ ...input, status: serve("activation", true) });
      expect(activation.play.label).toBe("Sign in");
      const playing = launchBarModel({ ...input, status: serve("ready", true) });
      expect(playing.play).toMatchObject({ label: "Stop", action: "stop", disabled: false });
      expect(playing.pill).toMatchObject({ kind: "live", label: "In game", action: "stop" });
      expect(playing.stateLine).toBe("In game · Press Space in the game");
    }
  });

  it("is hosting again once the game closes", () => {
    const after = launchBarModel({ ...withPlay, status: serve("ready", false) });
    expect(after.play.action).toBe("play");
    expect(after.stateLine).toBe("Hosting · server running");
  });

  it("says what stopping closes", () => {
    for (const input of [live, withPlay]) {
      const server = launchBarModel({ ...input, status: serve("stopping", false) });
      expect(server.play).toMatchObject({ label: "Stopping", action: null, busy: true });
      expect(server.stateLine).toBe("Stopping the server");
      const game = launchBarModel({ ...input, status: serve("stopping", true) });
      expect(game.stateLine).toBe("Closing the game, then the server");
      expect(launchBarModel({ ...input, status: status("stopping") }).stateLine).toBe(
        "Closing the game, then the server",
      );
    }
  });

  it("stops a hosting server elsewhere than Windows, where no game can join", () => {
    for (const input of [live, withPlay]) {
      const model = launchBarModel({ ...input, platform: "other", status: serve("ready", false) });
      expect(model.play).toMatchObject({ label: "Stop", action: "stop" });
      expect(model.pill.label).toBe("Running");
      for (const text of shown(model)) expect(text).not.toMatch(/in game/i);
    }
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
