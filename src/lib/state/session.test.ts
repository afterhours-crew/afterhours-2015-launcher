import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppInfo, Status } from "$lib/api/types";
import { sampleHosting, sampleMapFrame } from "./sample";

const startSession = vi.fn(async () => {});

vi.mock("$lib/api/tauri", () => ({
  inTauri: false,
  api: { startSession: (...args: unknown[]) => startSession(...(args as [])) },
  onSessionEvents: async () => () => {},
  statusFromResult: () => null,
}));

const { Session } = await import("./session.svelte");

function serverWith(capabilities: string[] | null): AppInfo["server"] {
  return {
    repository: "afterhours-crew/afterhours-2015",
    pinned_tag: "v0.4.1",
    pinned_sha256: "0".repeat(64),
    override_allowed: false,
    path: "Afterhours.exe",
    source: "bundled",
    version_line: null,
    matches_pin: true,
    capabilities,
    error: null,
  };
}

function sessionWith(capabilities: string[] | null) {
  const session = new Session();
  session.info = { server: serverWith(capabilities) } as AppInfo;
  // The test has no settings file; the start only records the server tag.
  session.save = async () => {};
  return session;
}

const ready: Status = sampleHosting(true);

describe("starting a session", () => {
  beforeEach(() => startSession.mockClear());

  it("asks for the event stream when the server reports events", async () => {
    await sessionWith(["profile", "events", "map-feed"]).start("start");
    expect(startSession).toHaveBeenCalledWith("start", true);
  });

  it("keeps the human lines for servers without events", async () => {
    await sessionWith(["profile"]).start("serve");
    expect(startSession).toHaveBeenCalledWith("serve", false);
    await sessionWith(null).start("setup");
    expect(startSession).toHaveBeenLastCalledWith("setup", false);
  });

  it("clears the last session's markers", async () => {
    const session = sessionWith(["events", "map-feed"]);
    session.receiveMapFeed(sampleMapFrame(3));
    expect(session.mapFeed?.frame).toBe(3);
    await session.start("start");
    expect(session.mapFeed).toBeNull();
  });
});

describe("the map feed", () => {
  it("keeps the newest frame while the session is ready", () => {
    const session = sessionWith(["events", "map-feed"]);
    session.setStatus(ready);
    session.receiveMapFeed(sampleMapFrame(1));
    session.receiveMapFeed(sampleMapFrame(2));
    session.receiveMapFeed({ event: "map-feed", frame: "three" });
    expect(session.mapFeed?.frame).toBe(2);
    session.setStatus({ ...ready, message: "Still driving." });
    expect(session.mapFeed?.frame).toBe(2);
  });

  it("clears it when the session leaves ready or reports no world", () => {
    const session = sessionWith(["events", "map-feed"]);
    session.setStatus(ready);
    session.receiveMapFeed(sampleMapFrame(1));
    session.setStatus({ ...ready, state: "stopping" });
    expect(session.mapFeed).toBeNull();
    session.receiveMapFeed(sampleMapFrame(2));
    expect(session.mapFeed).toBeNull();

    session.setStatus(ready);
    session.receiveMapFeed(sampleMapFrame(3));
    session.receiveMapFeed({ ...sampleMapFrame(4), worlds: [] });
    expect(session.mapFeed).toBeNull();
  });
});
