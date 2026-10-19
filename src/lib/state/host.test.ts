import { describe, expect, it } from "vitest";
import type { Status } from "$lib/api/types";
import { hostModel } from "./host";

/** A `serve` session in `state`, with or without a game started by `play`. */
const serve = (state: Status["state"], game = false): Status => ({
  version: 1,
  id: "0123456789abcdef0123456789abcdef",
  action: "serve",
  game_running: game,
  utc: "2026-10-19T12:00:00Z",
  state,
  message: "m",
  worker_pid: 1,
  game_pid: game ? 3 : null,
  server_pid: 2,
});
const base = { serverReady: true, gameChosen: true, status: null, running: false };

describe("host", () => {
  it("serves when the server and the game folder are there", () => {
    expect(hostModel(base)).toEqual({
      state: "Offline",
      dot: null,
      button: { label: "Serve", action: "serve", disabled: false },
      reason: null,
    });
  });

  it("says why it cannot serve", () => {
    expect(hostModel({ ...base, serverReady: false }).reason).toMatch(/missing/);
    expect(hostModel({ ...base, gameChosen: false }).reason).toMatch(/game folder/);
    expect(hostModel({ ...base, running: true }).button.disabled).toBe(true);
  });

  it("shows a serve session without a game as hosting, with Stop server", () => {
    expect(hostModel({ ...base, running: true, status: serve("ready") })).toEqual({
      state: "Hosting · server running",
      dot: "ready",
      button: { label: "Stop server", action: "stop", disabled: false },
      reason: null,
    });
  });

  it("shows a game played in the session as in game; Stop closes both", () => {
    expect(hostModel({ ...base, running: true, status: serve("ready", true) })).toMatchObject({
      state: "In game",
      button: { label: "Stop", action: "stop", disabled: false },
    });
    expect(hostModel({ ...base, running: true, status: serve("starting", true) })).toMatchObject({
      state: "Starting the game…",
      button: { action: null, disabled: true },
    });
    expect(hostModel({ ...base, running: true, status: serve("activation", true) }).dot).toBe(
      "warn",
    );
  });

  it("waits for a session that is preparing or stopping", () => {
    expect(hostModel({ ...base, status: serve("preparing") })).toMatchObject({
      state: "Preparing…",
      button: { action: null, disabled: true },
    });
    expect(hostModel({ ...base, status: serve("stopping") })).toMatchObject({
      state: "Stopping…",
      button: { label: "Stopping", action: null, disabled: true },
      reason: null,
    });
    expect(hostModel({ ...base, status: serve("stopping", true) }).state).toBe("Closing the game…");
  });

  it("reads an older record without action by its game process ID", () => {
    const old = { ...serve("ready"), action: null };
    expect(hostModel({ ...base, status: old }).state).toBe("Hosting · server running");
    expect(hostModel({ ...base, status: { ...old, game_pid: 3, game_running: true } }).state).toBe(
      "In game",
    );
  });

  it("is offline again after a finished or failed session", () => {
    for (const state of ["finished", "failed", "interrupted"] as const) {
      expect(hostModel({ ...base, status: serve(state) }).button.action).toBe("serve");
    }
  });
});
