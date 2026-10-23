import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppInfo, CliResult, Status } from "$lib/api/types";
import { emptySettings } from "$lib/api/types";
import { sampleHosting } from "./sample";

// The session store as the desktop window runs it: Tauri is there, and the
// Rust side answers through these stand-ins.
const mocks = vi.hoisted(() => ({
  status: null as unknown,
  capabilities: [] as string[] | null,
  connectSession: vi.fn(async () => true),
  handlers: null as null | Record<string, (...args: unknown[]) => void>,
}));

vi.mock("$lib/api/tauri", () => ({
  inTauri: true,
  api: {
    getSettings: async () => emptySettings(),
    appInfo: async () =>
      ({
        server: { path: "Afterhours.exe", capabilities: mocks.capabilities },
      }) as unknown as AppInfo,
    sessionStatus: async (): Promise<CliResult> => ({ kind: "ok", value: mocks.status }),
    connectSession: () => mocks.connectSession(),
  },
  onSessionEvents: async (handlers: Record<string, (...args: unknown[]) => void>) => {
    mocks.handlers = handlers;
    return () => {};
  },
  statusFromResult: (result: CliResult) =>
    result.kind === "ok" ? ((result.value as { session: Status | null }).session ?? null) : null,
}));

const { Session } = await import("./session.svelte");

beforeEach(() => {
  mocks.connectSession.mockClear();
  mocks.handlers = null;
});

describe("opening the window", () => {
  it("follows a session still running through its API", async () => {
    mocks.capabilities = ["events", "api"];
    mocks.status = { version: 1, session: sampleHosting(false) };
    const session = new Session();
    await session.load();
    expect(mocks.connectSession).toHaveBeenCalledTimes(1);
    expect(session.adopted).toBe(true);
    expect(session.status?.state).toBe("ready");
  });

  it("connects to nothing when no session runs or the server has no API", async () => {
    mocks.capabilities = ["events", "api"];
    mocks.status = { version: 1, session: { ...sampleHosting(false), state: "finished" } };
    await new Session().load();
    mocks.capabilities = ["events"];
    mocks.status = { version: 1, session: sampleHosting(false) };
    await new Session().load();
    expect(mocks.connectSession).not.toHaveBeenCalled();
  });
});

describe("closing the window", () => {
  it("says the server is stopping, and why the window stayed open if it did not", async () => {
    mocks.capabilities = ["api"];
    mocks.status = { version: 1, session: null };
    const session = new Session();
    await session.load();
    expect(session.closing).toBe(false);
    mocks.handlers!.closing!();
    expect(session.closing).toBe(true);
    mocks.handlers!.closeFailed!("Your server did not stop in time.");
    expect(session.closing).toBe(false);
    expect(session.error).toBe("Your server did not stop in time.");
  });
});
