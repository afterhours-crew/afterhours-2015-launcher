// The window's live state: settings, what the bundled server is, the
// current session status and the session console.

import { api, inTauri, onSessionEvents, statusFromResult, type Unlisten } from "$lib/api/tauri";
import type { AppInfo, OutputLine, SessionAction, Settings, Status } from "$lib/api/types";
import { emptySettings } from "$lib/api/types";
import { sampleAppInfo, sampleMode } from "./preview";

export const MAX_CONSOLE_LINES = 400;

function message(e: unknown): string {
  return String(e instanceof Error ? e.message : e);
}

export class Session {
  settings = $state<Settings>(emptySettings());
  info = $state<AppInfo | null>(null);
  status = $state<Status | null>(null);
  running = $state(false);
  console = $state<OutputLine[]>([]);
  error = $state<string | null>(null);
  loaded = $state(false);
  /** The window refused to close because its session still runs. */
  closeBlocked = $state(false);

  private unlisten: Unlisten | null = null;

  /** The bundled (or, in development, overridden) server was found. */
  get serverReady(): boolean {
    return this.info?.server.path != null;
  }

  /** Tag of the server this launcher bundles, from server-pin.json. */
  get serverTag(): string | null {
    return this.info?.server.pinned_tag ?? null;
  }

  async load(): Promise<void> {
    if (!inTauri) {
      if (sampleMode) {
        this.info = await sampleAppInfo();
        // As the desktop window reports it: the launcher's folder is the game folder.
        const inFolder = this.info.game_in_launcher_folder;
        if (inFolder) this.settings = { ...this.settings, game_dir: inFolder };
      }
      this.loaded = true;
      return;
    }
    try {
      this.settings = await api.getSettings();
      this.info = await api.appInfo();
      if (this.serverReady) {
        this.status = statusFromResult(await api.sessionStatus());
      }
      this.error = null;
    } catch (e) {
      this.error = message(e);
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
        this.closeBlocked = false;
      },
      closeBlocked: () => {
        this.closeBlocked = true;
      },
    });
  }

  async refreshInfo(): Promise<void> {
    try {
      this.info = await api.appInfo();
    } catch (e) {
      this.error = message(e);
    }
  }

  async save(patch: Partial<Settings>): Promise<void> {
    if (!inTauri) {
      // The browser preview keeps settings for this page only.
      this.settings = { ...this.settings, ...patch };
      return;
    }
    this.settings = await api.saveSettings({ ...this.settings, ...patch });
  }

  async start(action: SessionAction): Promise<void> {
    this.error = null;
    this.console = [];
    try {
      await api.startSession(action);
      this.running = true;
      // The notice about a changed server ends with the first start on it.
      const tag = this.serverTag;
      if (tag && this.settings.last_server_tag !== tag) await this.save({ last_server_tag: tag });
    } catch (e) {
      this.error = message(e);
    }
  }

  async stop(): Promise<void> {
    try {
      const result = await api.stopSession();
      if (result.kind === "error") this.error = result.message;
    } catch (e) {
      this.error = message(e);
    }
  }

  private push(line: OutputLine): void {
    const next = [...this.console, line];
    this.console =
      next.length > MAX_CONSOLE_LINES ? next.slice(next.length - MAX_CONSOLE_LINES) : next;
  }
}

export const session = new Session();
