import { describe, expect, it } from "vitest";
import type { Activity } from "$lib/api/types";
import {
  backgroundChecks,
  backupPlan,
  candidateServer,
  evaluateCandidate,
  installGate,
  nextStep,
  serverChangeNotice,
  type Candidate,
  type Offer,
} from "./updates";

const SHA = "e5ac1e6f28619595b657573a02ac92b04e77279e817bdfc1fc3432f894811efe";

function candidate(version: string, serverTag: string | null): Candidate {
  return {
    version,
    notes: "Notes",
    date: "2026-11-01T00:00:00Z",
    server: serverTag ? { tag: serverTag, executable_sha256: SHA } : null,
  };
}

function evaluate(c: Candidate, skipped: string | null = null): Offer {
  return evaluateCandidate({
    currentVersion: "0.1.0",
    currentServerTag: "v0.3.0",
    candidate: c,
    skippedVersion: skipped,
  });
}

function activity(partial: Partial<Activity>): Activity {
  return {
    cli: { kind: "ok", state: "none" },
    recorded: { kind: "none" },
    window_session: false,
    ...partial,
  };
}

describe("the server a candidate bundles", () => {
  it("comes from the manifest's server field and nothing else", () => {
    expect(
      candidateServer({ version: "0.2.0", server: { tag: "v0.4.0", executable_sha256: SHA } }),
    ).toEqual({ tag: "v0.4.0", executable_sha256: SHA });
    expect(candidateServer({ server: { tag: "v0.4.0" } })).toEqual({
      tag: "v0.4.0",
      executable_sha256: null,
    });
    for (const bad of [
      null,
      "x",
      {},
      { server: null },
      { server: { tag: "0.4.0" } },
      { server: { tag: "v0.4.0/../../x" } },
      { server: { tag: 4 } },
    ]) {
      expect(candidateServer(bad)).toBeNull();
    }
  });
});

describe("offers", () => {
  it("offers a newer launcher with the same or a newer server", () => {
    expect(evaluate(candidate("0.2.0", "v0.3.0"))).toEqual({
      kind: "offer",
      serverChanges: false,
      skipped: false,
    });
    expect(evaluate(candidate("0.2.0", "v0.4.0"))).toEqual({
      kind: "offer",
      serverChanges: true,
      skipped: false,
    });
  });

  it("never offers an older or equal launcher", () => {
    expect(evaluate(candidate("0.1.0", "v0.4.0"))).toEqual({ kind: "none" });
    expect(evaluate(candidate("0.0.9", "v0.4.0"))).toEqual({ kind: "none" });
    expect(evaluate(candidate("not-a-version", "v0.4.0"))).toEqual({ kind: "none" });
  });

  it("refuses a launcher that would downgrade the server", () => {
    const offer = evaluate(candidate("0.2.0", "v0.2.9"));
    expect(offer).toMatchObject({ kind: "refused", reason: "server-downgrade" });
    expect(offer.kind === "refused" && offer.message).toContain("v0.2.9");
    expect(evaluate(candidate("0.2.0", "v0.3.0-rc.1"))).toMatchObject({
      reason: "server-downgrade",
    });
  });

  it("refuses a launcher that does not say which server it bundles", () => {
    expect(evaluate(candidate("0.2.0", null))).toMatchObject({
      kind: "refused",
      reason: "server-unknown",
    });
  });

  it("marks a version the user skipped", () => {
    expect(evaluate(candidate("0.2.0", "v0.3.0"), "0.2.0")).toMatchObject({ skipped: true });
    expect(evaluate(candidate("0.2.1", "v0.3.0"), "0.2.0")).toMatchObject({ skipped: false });
  });
});

describe("the install gate", () => {
  it("allows installing when the server reports no live session", () => {
    for (const state of ["none", "finished", "failed", "interrupted"]) {
      expect(installGate(activity({ cli: { kind: "ok", state } }))).toEqual({ allowed: true });
    }
  });

  it("waits while the server reports a live session, even one this window did not start", () => {
    for (const state of ["preparing", "starting", "activation", "ready", "stopping"]) {
      const gate = installGate(activity({ cli: { kind: "ok", state } }));
      expect(gate).toMatchObject({ allowed: false, reason: "live-session" });
      expect(!gate.allowed && gate.message).toContain(state);
    }
  });

  it("waits while this window's own session runs", () => {
    expect(installGate(activity({ window_session: true }))).toMatchObject({
      allowed: false,
      reason: "window-session",
    });
  });

  it("falls back to the records, failing closed, when the server cannot answer", () => {
    const cli = { kind: "error" as const, message: "The server did not answer within 10 seconds." };
    const live = (lock_held: boolean | null) =>
      activity({
        cli,
        recorded: {
          kind: "session",
          id: "a".repeat(32),
          state: "ready",
          message: "m",
          utc: "2026-10-19T12:00:00Z",
          lock_held,
        },
      });
    expect(installGate(live(true))).toMatchObject({ allowed: false, reason: "unverified-session" });
    expect(installGate(live(null))).toMatchObject({ allowed: false, reason: "unverified-session" });
    // Nobody holds the lock: the supervisor is gone, as `status` would say.
    expect(installGate(live(false))).toEqual({ allowed: true });
    expect(installGate(activity({ cli, recorded: { kind: "none" } }))).toEqual({ allowed: true });
    expect(
      installGate(
        activity({
          cli,
          recorded: {
            kind: "session",
            id: "a".repeat(32),
            state: "finished",
            message: "m",
            utc: "u",
            lock_held: null,
          },
        }),
      ),
    ).toEqual({ allowed: true });
  });
});

describe("backups", () => {
  it("copies saves before any change of the bundled server and not otherwise", () => {
    expect(backupPlan("v0.3.0", { tag: "v0.4.0", executable_sha256: SHA })).toEqual({
      required: true,
      from: "v0.3.0",
      to: "v0.4.0",
    });
    expect(backupPlan("v0.3.0", { tag: "v0.3.0", executable_sha256: SHA }).required).toBe(false);
    expect(backupPlan("v0.3.0", { tag: "v0.3.1-rc.1", executable_sha256: null }).required).toBe(
      true,
    );
  });
});

describe("what happens next", () => {
  const offer: Offer = { kind: "offer", serverChanges: true, skipped: false };
  const open = { allowed: true } as const;
  const shut = { allowed: false, reason: "live-session", message: "m" } as const;
  const step = (input: Partial<Parameters<typeof nextStep>[0]>) =>
    nextStep({ mode: "ask", offer, gate: open, dismissed: false, manual: false, ...input });

  it("asks in Ask mode unless dismissed or skipped", () => {
    expect(step({})).toBe("banner");
    expect(step({ dismissed: true })).toBe("nothing");
    expect(step({ offer: { ...offer, skipped: true } })).toBe("nothing");
    // A check the user asked for shows even a skipped version.
    expect(step({ offer: { ...offer, skipped: true }, manual: true })).toBe("banner");
  });

  it("installs in Auto mode only when the gate is open", () => {
    expect(step({ mode: "auto" })).toBe("install");
    expect(step({ mode: "auto", gate: shut })).toBe("wait");
    expect(step({ mode: "auto", gate: null })).toBe("wait");
  });

  it("does nothing in Off mode unless asked", () => {
    expect(step({ mode: "off" })).toBe("nothing");
    expect(step({ mode: "off", manual: true })).toBe("banner");
    expect(backgroundChecks("off")).toBe(false);
    expect(backgroundChecks("ask")).toBe(true);
    expect(backgroundChecks("auto")).toBe(true);
  });

  it("does nothing without an offer", () => {
    expect(step({ offer: { kind: "none" }, manual: true })).toBe("nothing");
    expect(
      step({ offer: { kind: "refused", reason: "server-downgrade", message: "m" }, mode: "auto" }),
    ).toBe("nothing");
  });
});

describe("after an update", () => {
  it("warns once that the content cache may be rebuilt", () => {
    expect(serverChangeNotice(null, "v0.3.0")).toBeNull();
    expect(serverChangeNotice("v0.3.0", "v0.3.0")).toBeNull();
    expect(serverChangeNotice("v0.3.0", "v0.4.0")).toContain("rebuild");
  });
});
