// The window's one piece of live state: settings, where the CLI is, the
// current session status and the session console.

import { api, onSessionEvents, statusFromResult, type Unlisten } from "$lib/api/tauri";
import type { CliInfo, OutputLine, SessionAction, Settings, Status } from "$lib/api/types";
import { emptySettings } from "$lib/api/types";

export const MAX_CONSOLE_LINES = 400;

export class Session {
  settings = $state<Settings>(emptySettings());
  cli = $state<CliInfo>({ launcher: null, server: null, version: null });
  status = $state<Status | null>(null);
  running = $state(false);
  console = $state<OutputLine[]>([]);
  error = $state<string | null>(null);
  loaded = $state(false);

  private unlisten: Unlisten | null = null;

  get cliReady(): boolean {
    return this.cli.launcher !== null && this.cli.server !== null;
  }

  async load(): Promise<void> {
    try {
      this.settings = await api.getSettings();
      this.cli = await api.locateCli();
      if (this.cliReady) {
        this.status = statusFromResult(await api.sessionStatus());
      }
      this.error = null;
    } catch (e) {
      this.error = String(e instanceof Error ? e.message : e);
    } finally {
      this.loaded = true;
    }
    this.unlisten ??= await onSessionEvents({
      output: (line) => this.push(line),
      status: (result) => {
        this.status = statusFromResult(result);
      },
      exit: () => {
        this.running = false;
      },
    });
  }

  async save(patch: Partial<Settings>): Promise<void> {
    this.settings = await api.saveSettings({ ...this.settings, ...patch });
    this.cli = await api.locateCli();
  }

  async start(action: SessionAction): Promise<void> {
    this.error = null;
    this.console = [];
    try {
      await api.startSession(action);
      this.running = true;
    } catch (e) {
      this.error = String(e instanceof Error ? e.message : e);
    }
  }

  async stop(): Promise<void> {
    try {
      const result = await api.stopSession();
      if (result.kind === "error") this.error = result.message;
    } catch (e) {
      this.error = String(e instanceof Error ? e.message : e);
    }
  }

  private push(line: OutputLine): void {
    const next = [...this.console, line];
    this.console =
      next.length > MAX_CONSOLE_LINES ? next.slice(next.length - MAX_CONSOLE_LINES) : next;
  }
}

export const session = new Session();
