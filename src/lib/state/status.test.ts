import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import type { Status } from "$lib/api/types";
import { launchBarModel, sessionPhase } from "./launchbar";
import { SESSION_STATES, readStatus, readStatusReport, statusContract } from "./status";

/** States in which a session's game process can be running. */
const GAME_STATES: readonly Status["state"][] = ["starting", "activation", "ready", "stopping"];

/** A `start` session as contract v1 writes it: its game runs from starting to stopping. */
const status = (state: Status["state"]): Status => {
  const game = GAME_STATES.includes(state);
  return {
    version: 1,
    id: "0123456789abcdef0123456789abcdef",
    action: "start",
    game_running: game,
    utc: "2026-10-19T12:00:00Z",
    state,
    message: "Game and server stopped; account data is preserved.",
    worker_pid: 4242,
    game_pid: game ? 4244 : null,
    server_pid: 4243,
  };
};

/** A ready `serve` session hosting without a game. */
const hosting = (): Status => ({
  ...status("ready"),
  action: "serve",
  game_running: false,
  game_pid: null,
});

/** What v0.3.0 writes: the same record without `action` and `game_running`. */
function legacyRecord(s: Status) {
  const { action: _action, game_running: _game, ...rest } = s;
  return rest;
}

/** What each contract prints for no session, and for one. */
const v1 = {
  none: { version: 1, session: null },
  some: (s: Status) => ({ version: 1, session: s }),
};
const legacy = { none: { state: "none" }, some: legacyRecord };

function validator(name: string) {
  const url = new URL(`../../../schemas/${name}.schema.json`, import.meta.url);
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
  for (const format of ["int32", "uint32", "int64", "uint64", "uint"]) {
    ajv.addFormat(format, { type: "number", validate: (n: number) => Number.isInteger(n) });
  }
  return ajv.compile(JSON.parse(readFileSync(url, "utf8")));
}
const legacySchema = new URL("../../../schemas/status-legacy.schema.json", import.meta.url);

describe("status --json shapes", () => {
  it("match the vendored schemas", () => {
    const check = validator("status");
    for (const value of [v1.none, v1.some(status("ready"))]) {
      expect(check(value), JSON.stringify(check.errors)).toBe(true);
    }
    expect(check(legacy.none)).toBe(false);
  });

  // The v0.3.0 schema is kept while v0.3.0 is the pin; a bump drops it.
  it.skipIf(!existsSync(legacySchema))("match the legacy schema while it is vendored", () => {
    const check = validator("status-legacy");
    for (const value of [legacy.none, legacy.some(status("ready"))]) {
      expect(check(value), JSON.stringify(check.errors)).toBe(true);
    }
  });

  it("are told apart", () => {
    expect(statusContract(v1.none)).toBe("v1");
    expect(statusContract(v1.some(status("ready")))).toBe("v1");
    expect(statusContract(legacy.none)).toBe("legacy");
    expect(statusContract(legacy.some(status("ready")))).toBe("legacy");
    expect(statusContract({ version: 2, session: null })).toBeNull();
    expect(statusContract({ state: "busy" })).toBeNull();
    expect(statusContract(null)).toBeNull();
    expect(statusContract([])).toBeNull();
  });
});

describe("reading the session", () => {
  it("gives the same status from either contract, for every state", () => {
    for (const state of SESSION_STATES) {
      const s = status(state);
      expect(readStatusReport(v1.some(s))).toEqual(s);
      // v0.3.0 names no action; whether its game runs comes from the game process ID.
      expect(readStatusReport(legacy.some(s))).toEqual({ ...s, action: null });
    }
    expect(readStatusReport(legacy.some(hosting()))).toEqual({ ...hosting(), action: null });
    expect(readStatusReport(v1.none)).toBeNull();
    expect(readStatusReport(legacy.none)).toBeNull();
  });

  it("derives game_running for older records from the game process ID and state", () => {
    const old = (state: Status["state"], game_pid: number | null) =>
      readStatus({ ...legacyRecord(status(state)), game_pid })!;
    for (const state of ["starting", "activation", "ready", "stopping"] as const) {
      expect(old(state, 4244).game_running).toBe(true);
      expect(old(state, null).game_running).toBe(false);
    }
    // A session that ended has no game running, whatever ID it last recorded.
    for (const state of ["preparing", "finished", "failed", "interrupted"] as const) {
      expect(old(state, 4244).game_running).toBe(false);
    }
    // A v1 record's own answer wins over its process IDs.
    expect(readStatus({ ...status("ready"), game_running: false })!.game_running).toBe(false);
    expect(readStatus({ ...hosting(), game_pid: 4244, game_running: true })!.game_running).toBe(
      true,
    );
  });

  it("tells hosting from playing in older records by the game process ID", () => {
    expect(sessionPhase(readStatusReport(legacy.some(hosting())))).toBe("hosting");
    expect(sessionPhase(readStatusReport(legacy.some(status("ready"))))).toBe("in-game");
  });

  it("keeps only the contract's fields, in their types", () => {
    const extra = {
      ...status("ready"),
      supervisor: "x",
      game_pid: "12",
      worker_pid: 1.5,
      action: "race",
      game_running: "yes",
    };
    // An unknown action reads as none; a malformed game_running falls back to the IDs.
    expect(readStatus(extra)).toEqual({
      ...status("ready"),
      action: null,
      game_running: false,
      game_pid: null,
      worker_pid: 0,
    });
    expect(readStatus({ id: "a", state: "ready" })).toEqual({
      version: 1,
      id: "a",
      action: null,
      game_running: false,
      utc: "",
      state: "ready",
      message: "",
      worker_pid: 0,
      game_pid: null,
      server_pid: null,
    });
  });

  it("reads nothing it cannot act on", () => {
    expect(readStatusReport({ version: 1, session: {} })).toBeNull();
    expect(
      readStatusReport({ version: 1, session: { ...status("ready"), state: "paused" } }),
    ).toBeNull();
    expect(readStatusReport({ ...status("ready"), id: 7 })).toBeNull();
    expect(readStatusReport("ready")).toBeNull();
    expect(readStatusReport(undefined)).toBeNull();
  });

  it("drives the launch bar and the header pill the same with either server", () => {
    const base = {
      platform: "windows" as const,
      serverReady: true,
      updating: false,
      gameChosen: true,
      running: true,
      canPlay: false,
    };
    for (const s of [...SESSION_STATES.map(status), hosting()]) {
      const fromV1 = launchBarModel({ ...base, status: readStatusReport(v1.some(s)) });
      const fromLegacy = launchBarModel({ ...base, status: readStatusReport(legacy.some(s)) });
      expect(fromV1).toEqual(fromLegacy);
    }
    expect(launchBarModel({ ...base, status: readStatusReport(v1.none) })).toEqual(
      launchBarModel({ ...base, status: readStatusReport(legacy.none) }),
    );
  });
});
