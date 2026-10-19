// The window's live state: settings, what the bundled server is, the
// current session status and the session console.

import { api, inTauri, onSessionEvents, statusFromResult, type Unlisten } from "$lib/api/tauri";
import type { AppInfo, OutputLine, SessionAction, Settings, Status } from "$lib/api/types";
import { emptySettings } from "$lib/api/types";
import { isLive } from "./launchbar";
import { sampleAppInfo, sampleFeed, sampleMode, sampleStatus } from "./preview";

export const MAX_CONSOLE_LINES = 400;

/** How long Restart with game waits for the serve session to end. */
export const RESTART_WAIT_MS = 30_000;

function message(e: unknown): string {
  return String(e instanceof Error ? e.message : e);
}

export class Session {
  settings = $state<Settings>(emptySettings());
  info = $state<AppInfo | null>(null);
  status = $state<Status | null>(null);
  running = $state(false);
  /** The newest lines, at most MAX_CONSOLE_LINES. */
  console = $state<OutputLine[]>([]);
  /** Lines received since the console was last cleared, trimmed ones included. */
  received = $state(0);
  error = $state<string | null>(null);
  loaded = $state(false);
  /** The window refused to close because its session still runs. */
  closeBlocked = $state(false);
  /** Restart with game is stopping the serve session before it starts again. */
  restarting = $state(false);
  /** When this window started its session; `null` for one started elsewhere. */
  startedAt = $state<Date | null>(null);

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
        // `?sample&hosting`: a serve session this window started.
        this.status = await sampleStatus();
        this.running = this.status !== null;
        if (this.running) this.startedAt = new Date(Date.now() - 4 * 60_000);
        // `?sample&feed`: server lines keep arriving, for the live log panels.
        void sampleFeed((line) => this.receive(line));
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
      output: (line) => this.receive(line),
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
    this.received = 0;
    try {
      await api.startSession(action);
      this.running = true;
      this.startedAt = new Date();
      // The notice about a changed server ends with the first start on it.
      const tag = this.serverTag;
      if (tag && this.settings.last_server_tag !== tag) await this.save({ last_server_tag: tag });
    } catch (e) {
      this.error = message(e);
    }
  }

  /**
   * Start the game in the running `serve` session (`play`). The session
   * goes on: the game's progress arrives as its output and statuses, and
   * when the game closes the session is hosting again.
   */
  async play(): Promise<void> {
    this.error = null;
    try {
      const result = await api.playGame();
      if (result.kind === "error") this.error = result.message;
    } catch (e) {
      this.error = message(e);
    }
  }

  /**
   * For servers without `play`: stop the serve session, wait until it has
   * ended, then `start` the server with the game.
   */
  async restartWithGame(): Promise<void> {
    if (this.restarting) return;
    this.restarting = true;
    this.error = null;
    try {
      await this.stop();
      if (this.error) return;
      if (!(await this.ended(RESTART_WAIT_MS))) {
        this.error = "The server did not stop in time, so the game was not started.";
        return;
      }
      await this.start("start");
    } finally {
      this.restarting = false;
    }
  }

  /** Wait until no session runs: the window's own has exited and none is live. */
  private async ended(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.running) {
        // The window stopped polling with its session; ask once more.
        try {
          this.status = statusFromResult(await api.sessionStatus());
        } catch (e) {
          this.error = message(e);
          return false;
        }
        if (!isLive(this.status?.state)) return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }

  async stop(): Promise<void> {
    try {
      const result = await api.stopSession();
      if (result.kind === "error") this.error = result.message;
    } catch (e) {
      this.error = message(e);
    }
  }

  /** Add one console line, dropping the oldest past the bound. */
  receive(line: OutputLine): void {
    this.received += 1;
    const next = [...this.console, line];
    this.console =
      next.length > MAX_CONSOLE_LINES ? next.slice(next.length - MAX_CONSOLE_LINES) : next;
  }
}

export const session = new Session();
