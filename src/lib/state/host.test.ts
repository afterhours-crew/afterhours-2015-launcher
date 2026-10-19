import { describe, expect, it } from "vitest";
import type { Status } from "$lib/api/types";
import { hostModel } from "./host";

const status = (state: Status["state"]): Status => ({
  version: 1,
  id: "0123456789abcdef0123456789abcdef",
  utc: "2026-10-19T12:00:00Z",
  state,
  message: "m",
  worker_pid: 1,
  game_pid: null,
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

  it("stops a ready session and waits for one that is starting", () => {
    expect(hostModel({ ...base, status: status("ready") })).toMatchObject({
      state: "Running · this PC only",
      dot: "ready",
      button: { label: "Stop", action: "stop", disabled: false },
    });
    expect(hostModel({ ...base, status: status("preparing") })).toMatchObject({
      state: "Preparing…",
      button: { action: null, disabled: true },
    });
  });

  it("is offline again after a finished or failed session", () => {
    for (const state of ["finished", "failed", "interrupted"] as const) {
      expect(hostModel({ ...base, status: status(state) }).button.action).toBe("serve");
    }
  });
});
