import { describe, expect, it } from "vitest";
import type { ServerCheck, ServerEntry, ServerHealth, Status } from "$lib/api/types";
import { emptyServers } from "$lib/api/types";
import {
  checkWords,
  entryAddress,
  featureWords,
  inUseName,
  pairingCode,
  parseConnectionLog,
  parsePairing,
  pickNote,
  remoteChip,
  remoteFacts,
  rowStatus,
  sharedPairingCode,
  shortPairingCode,
  thisPcFacts,
  thisPcRow,
} from "./serverpicker";

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-10-22T20:00:00Z");
const UTC = { timeZone: "UTC" };

const entry: ServerEntry = {
  id: "0011223344556677",
  name: "Garage PC",
  url: "http://192.168.1.32:61234",
  token: TOKEN,
  added_utc: "2026-10-20T10:00:00Z",
  last_seen_utc: "2026-10-20T19:00:00Z",
  last_version: "0.4.1",
  last_capabilities: ["api", "play"],
  last_played_utc: "2026-10-21T21:14:00Z",
};

const online: ServerHealth = {
  id: entry.id,
  state: "online",
  version: "0.4.2",
  release: "v0.4.2",
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
  checked_utc: "2026-10-22T20:00:00Z",
};

const serve = (state: Status["state"], game = false): Status => ({
  version: 1,
  id: "0123456789abcdef0123456789abcdef",
  action: "serve",
  game_running: game,
  utc: "2026-10-22T20:00:00Z",
  state,
  message: "",
  worker_pid: 1,
  game_pid: game ? 3 : null,
  server_pid: 2,
});

describe("pairing codes", () => {
  it("are read whole, with http://, with a space, or as an address alone", () => {
    const whole = parsePairing(`192.168.1.32:61234/${TOKEN}`);
    expect(whole).toEqual({ ok: true, value: { url: "http://192.168.1.32:61234", token: TOKEN } });
    expect(parsePairing(`http://192.168.1.32:61234/${TOKEN}`)).toEqual(whole);
    expect(parsePairing(`  192.168.1.32:61234 ${TOKEN}\n`)).toEqual(whole);
    expect(parsePairing(`192.168.1.32:61234/${TOKEN}/`)).toEqual(whole);
    expect(parsePairing("192.168.1.32:61234")).toEqual({
      ok: true,
      value: { url: "http://192.168.1.32:61234", token: null },
    });
  });

  it("say what to fix", () => {
    expect(parsePairing("")).toMatchObject({ ok: false, message: /pairing code/ });
    for (const bad of [
      "garage-pc:61234",
      "0.0.0.0:61234",
      "192.168.1.32",
      "239.1.1.1:5",
      "1.2.3.4:0",
    ]) {
      expect(parsePairing(bad), bad).toMatchObject({ ok: false, message: /address and port/ });
    }
    expect(parsePairing("192.168.1.32:61234/abc")).toMatchObject({
      ok: false,
      message: /64 characters/,
    });
    expect(parsePairing(`192.168.1.32:61234/${TOKEN.toUpperCase()}`)).toMatchObject({
      ok: false,
    });
  });

  it("are written back the same way, and shortened for reading", () => {
    expect(pairingCode(entry)).toBe(`192.168.1.32:61234/${TOKEN}`);
    expect(entryAddress(entry)).toBe("192.168.1.32:61234");
    expect(shortPairingCode(pairingCode(entry))).toBe("192.168.1.32:61234/01234567…");
    expect(shortPairingCode("192.168.1.32:61234")).toBe("192.168.1.32:61234");
    expect(sharedPairingCode("192.168.1.32", { port: 61234, token: TOKEN })).toBe(
      `192.168.1.32:61234/${TOKEN}`,
    );
    expect(sharedPairingCode(null, { port: 61234, token: TOKEN })).toBeNull();
    expect(sharedPairingCode("192.168.1.32", null)).toBeNull();
  });
});

describe("list rows", () => {
  it("show a checked server with a dot and a word", () => {
    expect(rowStatus(entry, online, false, NOW, UTC)).toEqual({
      word: "Online",
      dot: "ready",
      subline: "192.168.1.32:61234 · 0.4.2 · hosting",
    });
    expect(rowStatus(entry, online, true, NOW, UTC).word).toBe("In use");
    expect(rowStatus(entry, { ...online, game_running: true }, false, NOW, UTC).subline).toMatch(
      /a game is playing/,
    );
  });

  it("say when a server does not answer, and when it was last seen", () => {
    expect(
      rowStatus(
        entry,
        { ...online, state: "unreachable", message: "m" } as ServerHealth,
        false,
        NOW,
        UTC,
      ),
    ).toEqual({
      word: "Not reachable",
      dot: "warn",
      subline: "192.168.1.32:61234 · seen Tue 20 Oct 19:00",
    });
    expect(
      rowStatus(
        { ...entry, last_seen_utc: null },
        { id: entry.id, state: "unreachable", message: "m", checked_utc: "" },
        false,
        NOW,
        UTC,
      ).subline,
    ).toBe("192.168.1.32:61234 · never seen");
    expect(
      rowStatus(
        entry,
        { id: entry.id, state: "refused", message: "m", checked_utc: "" },
        false,
        NOW,
        UTC,
      ),
    ).toMatchObject({
      word: "New token",
      dot: "warn",
    });
    expect(
      rowStatus(
        entry,
        { id: entry.id, state: "older", message: "m", checked_utc: "" },
        false,
        NOW,
        UTC,
      ),
    ).toMatchObject({
      word: "Older",
      subline: "192.168.1.32:61234 · no session API",
    });
  });

  it("show what is known before the first check", () => {
    expect(rowStatus(entry, null, false, NOW, UTC)).toEqual({
      word: "Checking…",
      dot: "info",
      subline: "192.168.1.32:61234 · 0.4.1",
    });
  });

  it("describe this PC's own server by its session", () => {
    expect(thisPcRow(null, false, true)).toMatchObject({ word: "In use", subline: "Stopped" });
    expect(thisPcRow(null, false, false)).toMatchObject({
      word: "Off",
      subline: "Stopped · starts when you pick it",
    });
    expect(thisPcRow(serve("ready"), true, true)).toEqual({
      word: "In use",
      dot: "ready",
      subline: "Hosting · shared",
    });
    expect(thisPcRow(serve("ready", true), false, false)).toMatchObject({ word: "In game" });
    expect(thisPcRow(serve("preparing"), false, true)).toMatchObject({
      word: "Preparing",
      dot: "info",
    });
  });
});

describe("cards", () => {
  it("chip a remote server by its check", () => {
    expect(remoteChip(online)).toEqual({ word: "Online · 6 ms", dot: "ready" });
    expect(remoteChip({ ...online, game_running: true })).toEqual({
      word: "In game · 6 ms",
      dot: "ready",
    });
    expect(remoteChip(null)).toEqual({ word: "Checking…", dot: "info" });
    expect(remoteChip({ id: "x", state: "refused", message: "", checked_utc: "" })).toEqual({
      word: "Token refused",
      dot: "warn",
    });
  });

  it("list a remote server's facts", () => {
    expect(remoteFacts(entry, online, "12 min", NOW, UTC)).toEqual([
      { label: "Address", value: "192.168.1.32:61234" },
      { label: "Version", value: "0.4.2" },
      { label: "Connected for", value: "12 min" },
      { label: "Drivers", value: "Only you" },
      { label: "Saves", value: "On Garage PC · 1 driver" },
      { label: "Last played here", value: "yesterday 21:14" },
    ]);
    const off = remoteFacts(entry, null, null, NOW, UTC);
    expect(off[1]).toEqual({ label: "Version", value: "0.4.1" });
    expect(off[2]).toEqual({ label: "Last seen", value: "Tue 20 Oct 19:00" });
    expect(off[4]).toEqual({ label: "Saves", value: "On Garage PC" });
    expect(remoteFacts({ ...entry, last_played_utc: null }, null, null, NOW, UTC).at(-1)).toEqual({
      label: "Last played here",
      value: "Never",
    });
  });

  it("list this PC's facts", () => {
    expect(
      thisPcFacts({
        address: "192.168.1.32:61234",
        version: "0.4.1",
        runningFor: "4 min",
        saves: 1,
        lastPlayed: "2026-10-22T17:40:00Z",
        now: NOW,
        clock: UTC,
      }),
    ).toEqual([
      { label: "Address", value: "192.168.1.32:61234" },
      { label: "Version", value: "0.4.1 · bundled" },
      { label: "Running for", value: "4 min" },
      { label: "Drivers", value: "Only you" },
      { label: "Saves", value: "On this PC · 1 driver" },
      { label: "Last played", value: "today 17:40" },
    ]);
    const idle = thisPcFacts({
      address: null,
      version: null,
      runningFor: null,
      saves: null,
      lastPlayed: null,
      now: NOW,
      clock: UTC,
    });
    expect(idle).toEqual([
      { label: "Address", value: "Not started yet" },
      { label: "Version", value: "bundled" },
      { label: "Drivers", value: "Only you" },
      { label: "Saves", value: "On this PC" },
      { label: "Last played", value: "Never" },
    ]);
  });

  it("name features in the screens' words", () => {
    expect(featureWords(online.capabilities)).toEqual([
      "Play",
      "World settings",
      "Profile",
      "Pictures",
      "Map",
      "Logs",
    ]);
    expect(featureWords(["api"])).toEqual([]);
  });
});

describe("the check before saving", () => {
  const found: ServerCheck = {
    ...online,
    url: entry.url,
    address: "192.168.1.32:61234",
    own: false,
    known_as: null,
  };

  it("says what answered and what works here", () => {
    expect(checkWords(found, "Garage PC", true)).toEqual({
      dot: "ready",
      title: "Garage PC answers · Afterhours 0.4.2",
      features: ["Play", "World settings", "Profile", "Pictures", "Map", "Logs"],
      line: "1 driver saved there · Online, nobody playing · This PC's server will stop when you use it",
      ok: true,
    });
    expect(checkWords(found, "", false).title).toBe(
      "192.168.1.32:61234 answers · Afterhours 0.4.2",
    );
    expect(checkWords({ ...found, known_as: "Old name" }, "x", false).line).toMatch(
      /Already saved as Old name/,
    );
    expect(checkWords({ ...found, game_running: true, saves: null }, "x", false).line).toBe(
      "A game is playing on it",
    );
  });

  it("says why a server cannot be saved", () => {
    expect(checkWords({ ...found, own: true }, "x", false)).toMatchObject({
      dot: "warn",
      title: "That is this PC's own server",
      ok: false,
    });
    const refused: ServerCheck = {
      state: "refused",
      message: "That server refused the token.",
      url: entry.url,
      address: "192.168.1.32:61234",
      own: false,
      known_as: null,
    };
    expect(checkWords(refused, "Laptop", false)).toEqual({
      dot: "warn",
      title: "Laptop did not answer",
      features: [],
      line: "That server refused the token.",
      ok: false,
    });
  });
});

describe("the connection log", () => {
  it("becomes launcher rows, newest last, and keeps odd lines as text", () => {
    const text =
      "2026-10-22T20:00:00Z\tPicked Garage PC\t192.168.1.32:61234\n2026-10-22T20:00:01Z\tConnected to Garage PC\t\nnot a log line\n";
    expect(parseConnectionLog(text)).toEqual([
      {
        kind: "launcher",
        time: "20:00:00",
        message: "Picked Garage PC",
        detail: "192.168.1.32:61234",
      },
      { kind: "launcher", time: "20:00:01", message: "Connected to Garage PC", detail: "" },
      { kind: "text", text: "not a log line" },
    ]);
    expect(parseConnectionLog("")).toEqual([]);
  });
});

describe("the list's note and the name in use", () => {
  it("say what picking does", () => {
    expect(pickNote(true, false, true)).toMatch(/stops this PC's/);
    expect(pickNote(true, true, true)).toMatch(/keeps running/);
    expect(pickNote(true, false, false)).toMatch(/Play, World, Profile and Map/);
    expect(pickNote(false, false, false)).toMatch(/saves stay/);
  });

  it("name the server in use, or nothing for this PC", () => {
    const servers = { ...emptyServers(), servers: [entry], in_use: entry.id };
    expect(inUseName(servers)).toBe("Garage PC");
    expect(inUseName({ ...servers, in_use: null })).toBeNull();
    expect(inUseName({ ...servers, in_use: "missing" })).toBeNull();
  });
});
