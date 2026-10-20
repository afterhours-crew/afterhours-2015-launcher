// Which session the Logs screens show and which of its files the viewer
// has open. Shared by the dashboard (E1) and the viewer (E2) so moving
// between them keeps the place.

import type { SessionFileText, SessionSummary } from "$lib/api/types";
import type { LevelFilter } from "./logs";
import { current, records, type Load } from "./records.svelte";
import { router } from "./router.svelte";

export class LogView {
  /** Index into the server's list, newest first. */
  index = $state(0);
  file = $state<string | null>(null);
  /** The level the viewer opens with, such as warnings from the dashboard. */
  level = $state<LevelFilter>("all");
  text = $state<Load<SessionFileText>>({ kind: "idle" });

  get sessions(): SessionSummary[] {
    return current(records.sessions)?.sessions ?? [];
  }

  get session(): SessionSummary | null {
    const list = this.sessions;
    return list[Math.min(this.index, Math.max(0, list.length - 1))] ?? null;
  }

  step(by: number): void {
    const next = this.index + by;
    if (next < 0 || next >= this.sessions.length) return;
    this.index = next;
    this.file = null;
    this.text = { kind: "idle" };
  }

  /** Open `name` of the shown session in the viewer. */
  async open(name: string, level: LevelFilter = "all"): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.file = name;
    this.level = level;
    router.go("logs", "viewer");
    this.text = { kind: "loading", last: null };
    try {
      this.text = { kind: "ready", value: await records.sessionFile(session.id, name) };
    } catch (e) {
      this.text = {
        kind: "error",
        message: String(e instanceof Error ? e.message : e),
        last: null,
      };
    }
  }
}

export const logView = new LogView();
