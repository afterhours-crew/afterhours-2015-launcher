// Your servers, as the Server screen shows them: the saved list from the
// Rust side (servers.json), the latest check of each, and the add form.
// Picking a server goes through the Rust side, which stops this PC's own
// server first when it must, then the session store follows the new one.
//
// The browser preview's sample mode keeps a made-up list in memory.

import { api, inTauri } from "$lib/api/tauri";
import type { CloseAction, ServerCheck, ServerHealth, Servers } from "$lib/api/types";
import { emptyServers } from "$lib/api/types";
import { sampleMode } from "./preview";
import { session } from "./session.svelte";

/** How often the Server screen checks every saved server while open. */
export const HEALTH_EVERY_MS = 30_000;

function message(e: unknown): string {
  return String(e instanceof Error ? e.message : e);
}

const TOKEN = "3f9a2c7e91b04d6a5e7f0c3b2a1d9e8f7c6b5a4d3e2f1a0b9c8d7e6f5a4b3c21";

/** `?sample`: two servers on other PCs, one of them off. */
function sampleServers(): Servers {
  return {
    version: 1,
    servers: [
      {
        id: "0011223344556677",
        name: "Garage PC",
        url: "http://192.168.1.32:61234",
        token: `${TOKEN}e`,
        added_utc: "2026-10-20T10:00:00Z",
        last_seen_utc: new Date().toISOString(),
        last_version: "0.4.1",
        last_capabilities: [
          "profile",
          "sessions",
          "play",
          "car-images",
          "map-images",
          "world-settings",
          "map-feed",
          "api",
        ],
        last_played_utc: new Date(Date.now() - 86_400_000).toISOString(),
      },
      {
        id: "8899aabbccddeeff",
        name: "Laptop",
        url: "http://192.168.1.40:61234",
        token: `${TOKEN}f`,
        added_utc: "2026-10-18T10:00:00Z",
        last_seen_utc: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        last_version: "0.4.0",
        last_capabilities: ["profile", "sessions", "play", "api"],
        last_played_utc: null,
      },
    ],
    in_use: null,
    close_action: "ask",
    this_pc: { last_played_utc: new Date(Date.now() - 2 * 3_600_000).toISOString() },
  };
}

function sampleHealth(servers: Servers): ServerHealth[] {
  const checked_utc = new Date().toISOString();
  return servers.servers.map((entry) =>
    entry.name === "Laptop"
      ? { id: entry.id, state: "unreachable", message: "Not reachable.", checked_utc }
      : {
          id: entry.id,
          state: "online",
          version: entry.last_version ?? "0.4.1",
          release: "v0.4.1",
          capabilities: entry.last_capabilities,
          ping_ms: 6,
          session: "ready",
          game_running: false,
          saves: 1,
          checked_utc,
        },
  );
}

export class ServersStore {
  list = $state<Servers>(emptyServers());
  /** The latest check of each saved server, by id. */
  health = $state<Record<string, ServerHealth>>({});
  checkedAt = $state<Date | null>(null);
  checking = $state(false);
  loaded = $state(false);
  /** The Add screen is open. */
  adding = $state(false);
  /** Picking is under way: what is happening, in words. */
  busy = $state<string | null>(null);
  error = $state<string | null>(null);
  /** When the window started following the server in use. */
  connectedAt = $state<Date | null>(null);

  private timer: ReturnType<typeof setInterval> | null = null;

  get inUse(): string | null {
    return this.list.in_use;
  }

  healthOf(id: string): ServerHealth | null {
    return this.health[id] ?? null;
  }

  async load(): Promise<void> {
    try {
      if (!inTauri) {
        if (sampleMode) {
          const list = sampleServers();
          this.list = list;
          this.health = Object.fromEntries(sampleHealth(list).map((h) => [h.id, h]));
          this.checkedAt = new Date();
        }
        return;
      }
      this.list = await api.serversList();
      this.error = null;
    } catch (e) {
      this.error = message(e);
    } finally {
      this.loaded = true;
    }
  }

  /** Check every saved server now. */
  async refreshHealth(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      if (!inTauri) {
        if (sampleMode) {
          this.health = Object.fromEntries(sampleHealth(this.list).map((h) => [h.id, h]));
        }
        return;
      }
      const report = await api.serversHealth();
      const next: Record<string, ServerHealth> = {};
      for (const h of report) next[h.id] = h;
      this.health = next;
      // A check also refreshes what the list remembers (version, last seen).
      this.list = await api.serversList();
      this.error = null;
    } catch (e) {
      this.error = message(e);
    } finally {
      this.checkedAt = new Date();
      this.checking = false;
    }
  }

  /** While the Server screen is open: check now, then every half minute. */
  watch(): () => void {
    void this.refreshHealth();
    this.timer ??= setInterval(() => void this.refreshHealth(), HEALTH_EVERY_MS);
    return () => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    };
  }

  /** Look at a pairing code before saving it. */
  async check(pairing: string): Promise<ServerCheck> {
    if (sampleMode) {
      const parsed =
        pairing
          .trim()
          .replace(/^http:\/\//, "")
          .split(/[\s/]+/)[0] ?? "";
      return {
        state: "online",
        version: "0.4.1",
        release: "v0.4.1",
        capabilities: [
          "profile",
          "sessions",
          "play",
          "car-images",
          "map-images",
          "world-settings",
          "api",
        ],
        ping_ms: 6,
        session: "ready",
        game_running: false,
        saves: 1,
        url: `http://${parsed}`,
        address: parsed,
        own: false,
        known_as: null,
      };
    }
    return api.serverCheck(pairing);
  }

  /** Save a server and, when `useNow`, pick it. */
  async add(name: string, pairing: string, useNow: boolean): Promise<void> {
    this.error = null;
    if (sampleMode) {
      const address =
        pairing
          .trim()
          .replace(/^http:\/\//, "")
          .split(/[\s/]+/)[0] ?? "";
      const id = Math.random().toString(16).slice(2, 18).padEnd(16, "0");
      this.list = {
        ...this.list,
        servers: [
          ...this.list.servers,
          {
            id,
            name: name.trim() || address,
            url: `http://${address}`,
            token: TOKEN,
            added_utc: new Date().toISOString(),
            last_seen_utc: new Date().toISOString(),
            last_version: "0.4.1",
            last_capabilities: ["api", "play"],
            last_played_utc: null,
          },
        ],
        in_use: useNow ? id : this.list.in_use,
      };
      this.adding = false;
      return;
    }
    this.busy = useNow ? "Saving and connecting…" : "Saving…";
    try {
      this.list = await api.serverAdd(name, pairing, useNow);
      this.adding = false;
      if (useNow) await this.afterPick();
    } catch (e) {
      this.error = message(e);
      throw e;
    } finally {
      this.busy = null;
    }
  }

  /** Use a saved server, or this PC's own with `null`. */
  async use(id: string | null): Promise<void> {
    if (id === this.list.in_use) return;
    this.error = null;
    if (sampleMode) {
      this.list = { ...this.list, in_use: id };
      return;
    }
    this.busy = id === null ? "Switching to this PC's server…" : "Connecting…";
    try {
      this.list = await api.serverUse(id);
      await this.afterPick();
    } catch (e) {
      this.error = message(e);
    } finally {
      this.busy = null;
    }
  }

  /** The window follows the new server from now on. */
  private async afterPick(): Promise<void> {
    this.connectedAt = null;
    await session.refreshServer();
    if (session.adopted || session.running) this.connectedAt = new Date();
    void this.refreshHealth();
  }

  async rename(id: string, name: string): Promise<void> {
    this.error = null;
    if (sampleMode) {
      this.list = {
        ...this.list,
        servers: this.list.servers.map((s) =>
          s.id === id ? { ...s, name: name.trim() || s.name } : s,
        ),
      };
      return;
    }
    try {
      this.list = await api.serverRename(id, name);
    } catch (e) {
      this.error = message(e);
    }
  }

  async forget(id: string): Promise<void> {
    this.error = null;
    if (sampleMode) {
      if (this.list.in_use === id) {
        this.error = "That server is in use. Pick another one first.";
        return;
      }
      this.list = { ...this.list, servers: this.list.servers.filter((s) => s.id !== id) };
      return;
    }
    try {
      this.list = await api.serverForget(id);
      const { [id]: _gone, ...rest } = this.health;
      this.health = rest;
    } catch (e) {
      this.error = message(e);
    }
  }

  /** A new pairing code for a saved server. */
  async setToken(id: string, pairing: string): Promise<boolean> {
    this.error = null;
    if (sampleMode) return true;
    try {
      this.list = await api.serverSetToken(id, pairing);
      void this.refreshHealth();
      return true;
    } catch (e) {
      this.error = message(e);
      return false;
    }
  }

  async setCloseAction(action: CloseAction): Promise<void> {
    if (sampleMode) {
      this.list = { ...this.list, close_action: action };
      return;
    }
    try {
      this.list = await api.setCloseAction(action);
    } catch (e) {
      this.error = message(e);
    }
  }

  /** The answer to "Keep your server running?". */
  async closeDecision(keep: boolean, remember: boolean): Promise<void> {
    session.closeAsk = false;
    if (sampleMode) return;
    try {
      await api.closeDecision(keep, remember);
    } catch (e) {
      session.error = message(e);
    }
  }
}

export const servers = new ServersStore();
