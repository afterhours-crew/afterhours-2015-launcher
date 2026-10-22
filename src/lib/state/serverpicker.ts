// View models for the Server screen: the list of your servers (this PC's
// own and the ones on other PCs), what each row and card says, the pairing
// code, and what a check means. Pure functions; the store (servers.svelte.ts)
// feeds them the saved list and the latest checks.

import type {
  OutputLine,
  Reach,
  ServerCheck,
  ServerEntry,
  ServerHealth,
  Servers,
  Status,
} from "$lib/api/types";
import { formatSaved, type Clock } from "./format";
import { sessionPhase } from "./launchbar";

export type Dot = "ready" | "warn" | "info" | null;

/** `192.168.1.32:61234` of an entry's URL. */
export function entryAddress(entry: Pick<ServerEntry, "url">): string {
  return entry.url.replace(/^http:\/\//, "");
}

/** The pairing code of a saved server, as it was pasted. */
export function pairingCode(entry: Pick<ServerEntry, "url" | "token">): string {
  return `${entryAddress(entry)}/${entry.token}`;
}

/** The pairing code this PC's shared server shows, or `null` until it has one. */
export function sharedPairingCode(
  share: string | null,
  localApi: { port: number; token: string } | null,
): string | null {
  return share && localApi ? `${share}:${localApi.port}/${localApi.token}` : null;
}

/** A pairing code for reading: the address, then the start of the token. */
export function shortPairingCode(code: string): string {
  const slash = code.indexOf("/");
  if (slash < 0) return code;
  const token = code.slice(slash + 1);
  return token.length > 12 ? `${code.slice(0, slash + 1)}${token.slice(0, 8)}…` : code;
}

export interface Pairing {
  /** `http://<IPv4 address>:<port>`. */
  url: string;
  token: string | null;
}

const ADDRESS = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/;

/**
 * Read a pairing code as the Rust side does (src-tauri/src/servers.rs
 * `parse_pairing`), so the Add screen can say what is wrong before the
 * window is asked: `192.168.1.32:61234/<token>`, with or without
 * `http://`, the token after `/` or a space, or an address alone.
 */
export function parsePairing(
  text: string,
): { ok: true; value: Pairing } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter the server's pairing code, or its address and port." };
  }
  const rest = trimmed.replace(/^http:\/\//, "");
  const match = /^([^\s/]+)(?:[\s/]+(.*))?$/s.exec(rest);
  const address = match?.[1] ?? "";
  const token = match?.[2]?.trim().replace(/\/+$/, "") || null;
  const parts = ADDRESS.exec(address);
  const bad = {
    ok: false as const,
    message:
      "Enter the server's address and port, such as 192.168.1.20:61000, as its Server screen shows them.",
  };
  if (!parts) return bad;
  const octets = parts.slice(1, 5).map(Number);
  const port = Number(parts[5]);
  if (octets.some((o) => o > 255) || port < 1 || port > 65535) return bad;
  if (octets.every((o) => o === 0) || octets.every((o) => o === 255)) return bad;
  if (octets[0]! >= 224 && octets[0]! <= 239) return bad;
  if (token !== null && !/^[0-9a-f]{64}$/.test(token)) {
    return {
      ok: false,
      message:
        "The pairing code's token should be 64 characters, 0-9 and a-f. Copy it again from that server's Server screen.",
    };
  }
  return { ok: true, value: { url: `http://${address}`, token } };
}

/** What a row in the Servers list says about one saved server. */
export interface RowStatus {
  /** The word beside the dot: "In use", "Online", "Not reachable", "New token", "Older"… */
  word: string;
  dot: Dot;
  /** Under the name: the address and what is known. */
  subline: string;
}

/** "Seen 2 days ago", or nothing. */
function seen(entry: ServerEntry, now: Date, clock: Clock): string | null {
  return entry.last_seen_utc ? `seen ${formatSaved(entry.last_seen_utc, now, clock)}` : null;
}

export function rowStatus(
  entry: ServerEntry,
  health: ServerHealth | null,
  inUse: boolean,
  now: Date,
  clock: Clock = {},
): RowStatus {
  const address = entryAddress(entry);
  const version = health?.state === "online" ? health.version : entry.last_version;
  const facts = [address, version].filter((f): f is string => Boolean(f));
  if (!health) {
    return {
      word: inUse ? "In use" : "Checking…",
      dot: inUse ? "ready" : "info",
      subline: facts.join(" · "),
    };
  }
  switch (health.state) {
    case "online": {
      const doing = health.game_running
        ? "a game is playing"
        : health.session === "ready"
          ? "hosting"
          : health.session
            ? health.session
            : null;
      return {
        word: inUse ? "In use" : "Online",
        dot: "ready",
        subline: [...facts, doing].filter(Boolean).join(" · "),
      };
    }
    case "unreachable":
      return {
        word: "Not reachable",
        dot: "warn",
        subline: [address, seen(entry, now, clock) ?? "never seen"].join(" · "),
      };
    case "refused":
      return { word: "New token", dot: "warn", subline: `${address} · token refused` };
    case "older":
      return { word: "Older", dot: "warn", subline: `${address} · no session API` };
  }
}

/** What the row of this PC's own server says. */
export function thisPcRow(status: Status | null, shared: boolean, inUse: boolean): RowStatus {
  const phase = sessionPhase(status);
  const sharedWord = shared ? " · shared" : "";
  switch (phase) {
    case "idle":
      return {
        word: inUse ? "In use" : "Off",
        dot: inUse ? null : null,
        subline: inUse ? `Stopped${sharedWord}` : "Stopped · starts when you pick it",
      };
    case "hosting":
      return { word: inUse ? "In use" : "Hosting", dot: "ready", subline: `Hosting${sharedWord}` };
    case "in-game":
      return { word: inUse ? "In use" : "In game", dot: "ready", subline: `In game${sharedWord}` };
    case "activation":
      return { word: "Sign in", dot: "warn", subline: "EA activation dialog open" };
    default:
      return {
        word: phase.charAt(0).toUpperCase() + phase.slice(1),
        dot: "info",
        subline: `${phase.charAt(0).toUpperCase()}${phase.slice(1)}…${sharedWord}`,
      };
  }
}

/** The chip on a remote server's card: "Online · 6 ms", "Not reachable"… */
export function remoteChip(health: ServerHealth | null): { word: string; dot: Dot } {
  if (!health) return { word: "Checking…", dot: "info" };
  switch (health.state) {
    case "online":
      return {
        word: health.game_running
          ? `In game · ${health.ping_ms} ms`
          : `Online · ${health.ping_ms} ms`,
        dot: "ready",
      };
    case "unreachable":
      return { word: "Not reachable", dot: "warn" };
    case "refused":
      return { word: "Token refused", dot: "warn" };
    case "older":
      return { word: "Older server", dot: "warn" };
  }
}

/** The features of a server in words, in the order the screens use them. */
const FEATURE_WORDS: readonly [string, string][] = [
  ["play", "Play"],
  ["world-settings", "World settings"],
  ["profile", "Profile"],
  ["car-images", "Pictures"],
  ["map-images", "Map"],
  ["map-feed", "Live map"],
  ["sessions", "Logs"],
];

export function featureWords(capabilities: readonly string[]): string[] {
  return FEATURE_WORDS.filter(([name]) => capabilities.includes(name)).map(([, word]) => word);
}

/** One line of facts on a card. */
export interface Fact {
  label: string;
  value: string;
}

/** The facts of a remote server's card. */
export function remoteFacts(
  entry: ServerEntry,
  health: ServerHealth | null,
  connectedFor: string | null,
  now: Date,
  clock: Clock = {},
): Fact[] {
  const online = health?.state === "online" ? health : null;
  const version = online?.version ?? entry.last_version ?? "unknown";
  const saves = online?.saves;
  const facts: Fact[] = [
    { label: "Address", value: entryAddress(entry) },
    { label: "Version", value: version },
  ];
  if (connectedFor) facts.push({ label: "Connected for", value: connectedFor });
  else if (entry.last_seen_utc)
    facts.push({ label: "Last seen", value: formatSaved(entry.last_seen_utc, now, clock) });
  facts.push({ label: "Drivers", value: online?.game_running ? "Someone is playing" : "Only you" });
  facts.push({
    label: "Saves",
    value:
      saves == null
        ? `On ${entry.name}`
        : `On ${entry.name} · ${saves} ${saves === 1 ? "driver" : "drivers"}`,
  });
  facts.push({
    label: "Last played here",
    value: entry.last_played_utc ? formatSaved(entry.last_played_utc, now, clock) : "Never",
  });
  return facts;
}

/** The facts of this PC's card. */
export function thisPcFacts(input: {
  address: string | null;
  version: string | null;
  runningFor: string | null;
  saves: number | null;
  lastPlayed: string | null;
  now: Date;
  clock?: Clock;
}): Fact[] {
  const facts: Fact[] = [
    { label: "Address", value: input.address ?? "Not started yet" },
    { label: "Version", value: input.version ? `${input.version} · bundled` : "bundled" },
  ];
  if (input.runningFor) facts.push({ label: "Running for", value: input.runningFor });
  facts.push({ label: "Drivers", value: "Only you" });
  facts.push({
    label: "Saves",
    value:
      input.saves == null
        ? "On this PC"
        : `On this PC · ${input.saves} ${input.saves === 1 ? "driver" : "drivers"}`,
  });
  facts.push({
    label: "Last played",
    value: input.lastPlayed ? formatSaved(input.lastPlayed, input.now, input.clock ?? {}) : "Never",
  });
  return facts;
}

/** What the Add screen shows after a check. */
export interface CheckWords {
  dot: Dot;
  title: string;
  /** Feature words, when it answered. */
  features: string[];
  /** The line under the features, or the refusal. */
  line: string;
  /** It can be saved. */
  ok: boolean;
}

export function checkWords(check: ServerCheck, name: string, thisPcRuns: boolean): CheckWords {
  if (check.own) {
    return {
      dot: "warn",
      title: "That is this PC's own server",
      features: [],
      line: "It is already in the list.",
      ok: false,
    };
  }
  const who = name.trim() || check.address;
  if (check.state !== "online") {
    return {
      dot: "warn",
      title: `${who} did not answer`,
      features: [],
      line: check.message,
      ok: false,
    };
  }
  const parts: string[] = [];
  if (check.saves != null)
    parts.push(`${check.saves} ${check.saves === 1 ? "driver" : "drivers"} saved there`);
  parts.push(
    check.game_running
      ? "A game is playing on it"
      : check.session === "ready"
        ? "Online, nobody playing"
        : "Online",
  );
  if (thisPcRuns) parts.push("This PC's server will stop when you use it");
  if (check.known_as) parts.push(`Already saved as ${check.known_as}; saving replaces it`);
  return {
    dot: "ready",
    title: `${who} answers · Afterhours ${check.version}`,
    features: featureWords(check.capabilities),
    line: parts.join(" · "),
    ok: true,
  };
}

/** The note under the list: what picking does right now. */
export function pickNote(inUseIsThisPc: boolean, shared: boolean, thisPcRuns: boolean): string {
  if (!inUseIsThisPc) return "Your saves stay on the server you play on.";
  if (shared && thisPcRuns)
    return "This PC's server is shared, so it keeps running when you pick another.";
  if (thisPcRuns) return "Picking another server stops this PC's, unless it is shared.";
  return "Play, World, Profile and Map use the server you pick here.";
}

/** The name of the server in use, for the launch bar and the Garage. */
export function inUseName(servers: Servers): string | null {
  const entry = servers.servers.find((s) => s.id === servers.in_use);
  return entry ? entry.name : null;
}

/** The entry in use, if it is one on another PC. */
export function inUseEntry(servers: Servers): ServerEntry | null {
  return servers.servers.find((s) => s.id === servers.in_use) ?? null;
}

/** `Reach` as one word for tests and logs. */
export function reachWord(reach: Reach): string {
  return reach.state;
}

/**
 * The launcher's connection log of one server (src-tauri/src/connlog.rs),
 * `<utc>\t<message>\t<detail>` per line, as console lines for the log
 * panel; a line that is not in that shape is shown as it is.
 */
export function parseConnectionLog(text: string): OutputLine[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const [utc = "", message = "", detail = ""] = line.split("\t");
      if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(utc)) return { kind: "text", text: line };
      return { kind: "launcher", time: utc.slice(11, 19), message, detail };
    });
}
