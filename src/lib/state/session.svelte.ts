// The window's live state: settings, what the bundled server is, the
// current session status and the session console.

import { api, inTauri, onSessionEvents, statusFromResult, type Unlisten } from "$lib/api/tauri";
import type {
  AppInfo,
  MapFeed,
  OutputLine,
  RemoteServer,
  SessionAction,
  Settings,
  Status,
} from "$lib/api/types";
import { emptySettings } from "$lib/api/types";
import { hasCapability } from "./capabilities";
import { isLive } from "./launchbar";
import { feedSurvives, takeFeed } from "./mapfeed";
import { sampleAppInfo, sampleFeed, sampleMapFeed, sampleMode, sampleStatus } from "./preview";

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
  /** Closing: the launcher's own server is stopping, then the window closes. */
  closing = $state(false);
  /** The window follows a session it did not start, through its API. */
  adopted = $state(false);
  /** Restart with game is stopping the serve session before it starts again. */
  restarting = $state(false);
  /** Closing while the shared server runs: the window asks what to do. */
  closeAsk = $state(false);
  /** Picking another server: this PC's own is being stopped first. */
  switching = $state<string | null>(null);
  /** When this window started its session; `null` for one started elsewhere. */
  startedAt = $state<Date | null>(null);
  /**
   * The newest `map-feed` event of the window's session: where the cars
   * are. `null` without one, after a frame with no world session, and once
   * the session leaves `ready` or ends.
   */
  mapFeed = $state.raw<MapFeed | null>(null);
  /**
   * "Hide my user name": copied paths and summaries show %USERNAME%
   * instead. On by default, for this run of the launcher.
   */
  hideUserName = $state(true);

  /** What copy actions need to hide the user name. */
  get privacy(): { on: boolean; userName: string | null } {
    return { on: this.hideUserName, userName: this.info?.user_name ?? null };
  }

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
        // `?sample`: cars drive around the sample map, for the Map's markers.
        void sampleMapFeed((event) => this.receiveMapFeed(event));
      }
      this.loaded = true;
      return;
    }
    try {
      this.settings = await api.getSettings();
      this.info = await api.appInfo();
      if (this.serverReady) {
        this.setStatus(statusFromResult(await api.sessionStatus()));
        // A session still running (an earlier window closed or crashed):
        // follow it through its API, as any server.
        if (hasCapability(this.info.server, "api") && isLive(this.status?.state)) {
          this.adopted = await api.connectSession();
        } else if (this.hostsOnOpen()) {
          // Your server runs while the launcher is open, reached through its
          // API like any other: World, Profile and Play need it.
          await this.start("serve");
        }
      }
      this.error = null;
    } catch (e) {
      this.error = message(e);
    } finally {
      this.loaded = true;
    }
    this.unlisten ??= await onSessionEvents({
      output: (line) => this.receive(line),
      status: (result) => this.setStatus(statusFromResult(result)),
      mapFeed: (event) => this.receiveMapFeed(event),
      exit: () => {
        this.running = false;
        this.closeBlocked = false;
        this.mapFeed = null;
      },
      closeBlocked: () => {
        this.closeBlocked = true;
      },
      closing: () => {
        this.closing = true;
      },
      closeFailed: (message) => {
        this.closing = false;
        this.error = message;
      },
      closeAsk: () => {
        this.closeAsk = true;
      },
      serverSwitching: (message) => {
        this.switching = message;
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

  /**
   * Use the server on another PC (checked first), or this PC's own again
   * with `null`; then follow the chosen one when a session runs there.
   */
  async useServer(server: RemoteServer | null): Promise<void> {
    this.settings = await api.setServer(server);
    await this.refreshServer();
  }

  /**
   * The server in use changed (the Server screen picked one): read the
   * settings again, follow the new server's session when one runs, and
   * start this PC's own server when it is the one in use and is off.
   */
  async refreshServer(): Promise<void> {
    this.switching = null;
    if (!inTauri) return;
    this.settings = await api.getSettings();
    this.adopted = false;
    this.console = [];
    this.received = 0;
    this.mapFeed = null;
    this.setStatus(statusFromResult(await api.sessionStatus()));
    if (this.info && hasCapability(this.info.server, "api") && isLive(this.status?.state)) {
      this.adopted = await api.connectSession();
    } else if (!this.running && this.hostsOnOpen()) {
      await this.start("serve");
    }
  }

  /** Whether opening the launcher starts this PC's own server. */
  private hostsOnOpen(): boolean {
    const game = this.info?.game_in_launcher_folder ?? this.settings.game_dir;
    return (
      this.settings.first_run_done &&
      Boolean(game) &&
      this.settings.server === null &&
      hasCapability(this.info?.server, "api")
    );
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
    this.mapFeed = null;
    try {
      // The session API, else the event stream: map positions come with either.
      const server = this.info?.server;
      await api.startSession(action, hasCapability(server, "events"), hasCapability(server, "api"));
      this.adopted = false;
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
          this.setStatus(statusFromResult(await api.sessionStatus()));
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

  /** A new session status; the map's markers go when the session leaves `ready`. */
  setStatus(next: Status | null): void {
    if (!feedSurvives(this.status, next)) this.mapFeed = null;
    this.status = next;
  }

  /** A `map-feed` event: the newest frame replaces the markers. */
  receiveMapFeed(event: unknown): void {
    this.mapFeed = takeFeed(this.mapFeed, event, this.status?.state);
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
