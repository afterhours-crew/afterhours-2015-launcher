import { describe, expect, it } from "vitest";
import type { Status } from "$lib/api/types";
import { lastSession } from "./garage";
import { SAMPLE_SESSIONS, sampleHosting } from "./sample";

const UTC = { timeZone: "UTC" };
const now = new Date("2026-10-18T12:00:00Z");
const listed = SAMPLE_SESSIONS.sessions;

describe("the Garage's last session", () => {
  it("says nothing when there has been no session", () => {
    expect(lastSession(null, null, now, UTC)).toBeNull();
    expect(lastSession(null, [], now, UTC)).toBeNull();
  });

  it("reads the newest listed session, with its warnings", () => {
    expect(lastSession(null, listed, now, UTC)).toEqual({
      title: "Last session",
      state: "Finished",
      dot: "ready",
      when: "Today 08:25",
      warnings: 3,
      message: "Game and server stopped; account data is preserved.",
    });
  });

  it("prefers the window's status, and calls a running one this session", () => {
    const status: Status = {
      ...sampleHosting(false),
      id: listed[0]!.id,
      utc: "2026-10-18T11:58:00Z",
    };
    expect(lastSession(status, listed, now, UTC)).toMatchObject({
      title: "Session",
      state: "Running",
      when: "Today 11:58",
      warnings: 3,
      message: "Server listening.",
    });
  });

  it("has no warning count for a session the list does not have", () => {
    const status: Status = {
      ...sampleHosting(false),
      state: "finished",
      utc: "2026-10-17T21:00:00Z",
    };
    expect(lastSession(status, listed, now, UTC)).toMatchObject({
      title: "Last session",
      when: "Yesterday 21:00",
      warnings: null,
    });
  });
});
