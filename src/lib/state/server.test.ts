import { describe, expect, it } from "vitest";
import { emptySettings } from "$lib/api/types";
import { isToken, serverLabel, serverUrl, viaApi } from "./server";

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

describe("reaching the server through its API", () => {
  it("is so for another PC's server and for this PC's once it has an API", () => {
    expect(viaApi(emptySettings())).toBe(false);
    expect(viaApi({ ...emptySettings(), local_api: { port: 61234, token: "a".repeat(64) } })).toBe(
      true,
    );
    expect(
      viaApi({
        ...emptySettings(),
        server: { url: "http://192.168.1.20:61000", token: "a".repeat(64) },
      }),
    ).toBe(true);
  });
});
