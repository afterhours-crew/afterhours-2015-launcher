import { describe, expect, it } from "vitest";
import { statusFromResult } from "./tauri";

/** A ready serve session as v0.3.0 writes it: no `action`, no `game_running`. */
const legacy = {
  version: 1,
  id: "0123456789abcdef0123456789abcdef",
  utc: "2026-10-19T12:00:00Z",
  state: "ready",
  message: "m",
  worker_pid: 1,
  game_pid: null,
  server_pid: 2,
};
/** The same session from contract v1, which names its action and whether a game runs. */
const status = { ...legacy, action: "serve", game_running: false };

describe("status --json", () => {
  it("reads v0.3.0's shape", () => {
    expect(statusFromResult({ kind: "ok", value: { state: "none" } })).toBeNull();
    expect(statusFromResult({ kind: "ok", value: legacy })).toEqual({
      ...legacy,
      action: null,
      game_running: false,
    });
  });

  it("reads contract v1's shape", () => {
    expect(statusFromResult({ kind: "ok", value: { version: 1, session: null } })).toBeNull();
    expect(statusFromResult({ kind: "ok", value: { version: 1, session: status } })).toEqual(
      status,
    );
  });

  it("ignores refusals and anything without a session id", () => {
    expect(statusFromResult({ kind: "error", exit: 5, message: "m" })).toBeNull();
    expect(statusFromResult({ kind: "ok", value: null })).toBeNull();
    expect(statusFromResult({ kind: "ok", value: { version: 1, session: {} } })).toBeNull();
  });
});
