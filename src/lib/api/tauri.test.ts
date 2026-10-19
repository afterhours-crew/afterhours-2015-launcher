import { describe, expect, it } from "vitest";
import { statusFromResult } from "./tauri";

const status = {
  version: 1,
  id: "0123456789abcdef0123456789abcdef",
  utc: "2026-10-19T12:00:00Z",
  state: "ready",
  message: "m",
  worker_pid: 1,
  game_pid: null,
  server_pid: 2,
};

describe("status --json", () => {
  it("reads v0.3.0's shape", () => {
    expect(statusFromResult({ kind: "ok", value: { state: "none" } })).toBeNull();
    expect(statusFromResult({ kind: "ok", value: status })).toEqual(status);
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
