import { describe, expect, it } from "vitest";
import { emptySettings } from "$lib/api/types";
import { isToken, pairing, serverLabel, serverUrl, viaApi } from "./server";

describe("a server on another PC", () => {
  it("is one IPv4 address with a port, with or without http://", () => {
    expect(serverUrl("192.168.1.20:61000")).toBe("http://192.168.1.20:61000");
    expect(serverUrl(" http://192.168.1.20:61000/ ")).toBe("http://192.168.1.20:61000");
    expect(serverUrl("10.0.0.5:1")).toBe("http://10.0.0.5:1");
    expect(serverUrl("127.0.0.1:53111")).toBe("http://127.0.0.1:53111");
  });

  it("refuses names, other schemes and addresses the game cannot be given", () => {
    for (const bad of [
      "",
      "192.168.1.20",
      "192.168.1.20:0",
      "192.168.1.20:65536",
      "192.168.1.256:61000",
      "0.0.0.0:61000",
      "255.255.255.255:61000",
      "224.0.0.1:61000",
      "https://192.168.1.20:61000",
      "my-pc:61000",
      "[::1]:61000",
      "192.168.1.20:61000/v1",
    ]) {
      expect(serverUrl(bad), bad).toBeNull();
    }
  });

  it("takes the token as its api --json prints it", () => {
    expect(isToken("a".repeat(64))).toBe(true);
    expect(isToken(` ${"0123456789abcdef".repeat(4)}\n`)).toBe(true);
    expect(isToken("A".repeat(64))).toBe(false);
    expect(isToken("a".repeat(63))).toBe(false);
    expect(isToken("")).toBe(false);
  });

  it("is named by its address; otherwise the server is this PC's", () => {
    expect(serverLabel(emptySettings())).toBe("This PC");
    expect(
      serverLabel({
        ...emptySettings(),
        server: { url: "http://192.168.1.20:61000", token: "a".repeat(64) },
      }),
    ).toBe("192.168.1.20:61000");
  });
});

describe("reading pictures through the server API", () => {
  it("uses remote APIs but keeps local pictures readable after a local server stops", () => {
    expect(viaApi(emptySettings())).toBe(false);
    expect(viaApi({ ...emptySettings(), local_api: { port: 61234, token: "a".repeat(64) } })).toBe(
      false,
    );
    expect(
      viaApi({
        ...emptySettings(),
        server: { url: "http://192.168.1.20:61000", token: "a".repeat(64) },
      }),
    ).toBe(true);
  });
});

describe("sharing this PC's server", () => {
  it("gives the address and token another PC enters, once both exist", () => {
    const local_api = { port: 61234, token: "a".repeat(64) };
    expect(pairing(emptySettings())).toBeNull();
    expect(pairing({ ...emptySettings(), share_address: "192.168.1.20" })).toBeNull();
    expect(pairing({ ...emptySettings(), local_api })).toBeNull();
    expect(pairing({ ...emptySettings(), local_api, share_address: "192.168.1.20" })).toEqual({
      address: "192.168.1.20:61234",
      token: "a".repeat(64),
    });
  });
});
