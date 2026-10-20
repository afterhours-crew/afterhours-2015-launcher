import { describe, expect, it } from "vitest";
import type { SettingsReport, Status } from "$lib/api/types";
import {
  MAX_RIVALS,
  appliesLive,
  applyChoice,
  rivalField,
  rivalHelp,
  rivalsAboveOriginal,
  saveArgs,
  trafficRow,
  worldLock,
  worldTiming,
  worldUpcoming,
} from "./world";

/** A record from a server without live changes or extra rivals (0bad8f6's limits). */
const report = (patch: Partial<SettingsReport> = {}): SettingsReport => ({
  version: 1,
  traffic_percent: 100,
  rival_limit: null,
  max_traffic_percent: 300,
  max_rivals: 128,
  rivals_above_original: false,
  live: false,
  file: "C:\\Users\\Driver\\AppData\\Local\\Afterhours2015\\settings.json",
  saved: false,
  ...patch,
});

/** A record from a server with live changes, 3x traffic and up to 15 rivals (8bf7b23). */
const liveReport = (patch: Partial<SettingsReport> = {}): SettingsReport =>
  report({
    max_traffic_percent: 300,
    max_rivals: 15,
    rivals_above_original: true,
    live: true,
    ...patch,
  });

/** What an older server prints: neither field. */
const older = (): SettingsReport => {
  const { live: _live, rivals_above_original: _above, ...rest } = report();
  return rest as SettingsReport;
};

describe("traffic", () => {
  it("shows Off, Default, 2x and 3x: the server's maximum, with nothing beyond it", () => {
    expect(trafficRow(report())).toEqual({
      options: [
        { value: "0", label: "Off" },
        { value: "100", label: "Default" },
        { value: "200", label: "2x" },
        { value: "300", label: "3x" },
      ],
      selected: "100",
    });
  });

  it("shows more steps only if a server ever allows them", () => {
    expect(trafficRow(report({ max_traffic_percent: 500 })).options.map((o) => o.label)).toEqual([
      "Off",
      "Default",
      "2x",
      "3x",
      "4x",
      "5x",
    ]);
    expect(trafficRow(report({ max_traffic_percent: 200 })).options).toHaveLength(3);
  });

  it("selects a saved step", () => {
    expect(trafficRow(report({ traffic_percent: 0 })).selected).toBe("0");
    expect(trafficRow(report({ traffic_percent: 300 })).selected).toBe("300");
  });

  it("shows an amount off the scale as an extra, selected chip", () => {
    const row = trafficRow(report({ traffic_percent: 150 }));
    expect(row.selected).toBe("custom:150");
    expect(row.options.at(-1)).toEqual({ value: "custom:150", label: "150 %" });
    expect(row.options).toHaveLength(5);
  });
});

describe("rivals", () => {
  it("is a number from 0 to 15, Auto for the game's own number", () => {
    expect(MAX_RIVALS).toBe(15);
    expect(rivalField(report())).toEqual({ value: null, max: 15 });
    expect(rivalField(report({ rival_limit: 0 }))).toEqual({ value: 0, max: 15 });
    expect(rivalField(report({ rival_limit: 7 })).value).toBe(7);
  });

  it("keeps a cap saved above 15 elsewhere, and a smaller server maximum", () => {
    expect(rivalField(report({ rival_limit: 40 }))).toEqual({ value: 40, max: 15 });
    expect(rivalField(report({ max_rivals: 8 })).max).toBe(8);
  });
});

describe("saving", () => {
  it("passes the change to settings", () => {
    expect(saveArgs("traffic", "0")).toEqual(["--traffic", "0"]);
    expect(saveArgs("traffic", "200")).toEqual(["--traffic", "200"]);
    expect(saveArgs("rivals", "0")).toEqual(["--rivals", "0"]);
    expect(saveArgs("rivals", "15")).toEqual(["--rivals", "15"]);
    expect(saveArgs("rivals", "07")).toEqual(["--rivals", "7"]);
    expect(saveArgs("rivals", "original")).toEqual(["--rivals", "original"]);
  });

  it("saves nothing for the extra chip, above 15 or anything unexpected", () => {
    expect(saveArgs("traffic", "custom:150")).toBeNull();
    expect(saveArgs("traffic", "original")).toBeNull();
    expect(saveArgs("rivals", "16")).toBeNull();
    expect(saveArgs("rivals", "-1")).toBeNull();
    expect(saveArgs("rivals", "lots")).toBeNull();
    expect(saveArgs("rivals", "")).toBeNull();
  });

  it("shows the change at once, as the record will read after saving", () => {
    expect(applyChoice(report(), "traffic", "300").traffic_percent).toBe(300);
    expect(applyChoice(report(), "rivals", "0").rival_limit).toBe(0);
    expect(applyChoice(report(), "rivals", "12").rival_limit).toBe(12);
    expect(applyChoice(report({ rival_limit: 0 }), "rivals", "original").rival_limit).toBeNull();
    expect(applyChoice(report({ traffic_percent: 150 }), "traffic", "custom:150")).toEqual(
      report({ traffic_percent: 150 }),
    );
    expect(applyChoice(report(), "rivals", "99")).toEqual(report());
  });
});

describe("while a session runs", () => {
  const status = (state: Status["state"]) => ({ state }) as Status;
  const running = ["preparing", "starting", "activation", "ready", "stopping"] as const;

  it("locks both controls on a server whose sessions keep their starting values", () => {
    for (const state of running) {
      for (const record of [report(), older(), null]) {
        expect(worldLock(status(state), record)).toBe(
          "Applies the next time you start. Stop the server to change it.",
        );
      }
    }
  });

  it("never locks on a live server: a save reaches the running session", () => {
    for (const state of running) expect(worldLock(status(state), liveReport())).toBeNull();
  });

  it("unlocks when nothing runs", () => {
    expect(worldLock(null, report())).toBeNull();
    expect(worldLock(status("finished"), report())).toBeNull();
    expect(worldLock(status("failed"), report())).toBeNull();
  });
});

describe("what this server can do", () => {
  it("treats fields an older server does not print as false", () => {
    expect(appliesLive(older())).toBe(false);
    expect(rivalsAboveOriginal(older())).toBe(false);
    expect(appliesLive(null)).toBe(false);
    expect(appliesLive(liveReport())).toBe(true);
    expect(rivalsAboveOriginal(liveReport())).toBe(true);
  });

  it("says when changes apply", () => {
    expect(worldTiming(liveReport())).toBe(
      "Your server's city. Changes apply within a few seconds, even while you play.",
    );
    expect(worldTiming(report())).toBe(
      "Your server's city. Changes apply the next time you start.",
    );
    expect(worldTiming(null)).toBe("Your server's city. Changes apply the next time you start.");
  });

  it("explains the rival number for what the server does with it", () => {
    expect(rivalHelp(liveReport())).toContain("other rivals from the game join near you");
    expect(rivalHelp(report())).toContain("coming in a future update");
  });

  it("offers 3x and up to 15 rivals on the live server", () => {
    expect(trafficRow(liveReport()).options.map((o) => o.label)).toEqual([
      "Off",
      "Default",
      "2x",
      "3x",
    ]);
    expect(rivalField(liveReport())).toEqual({ value: null, max: 15 });
  });
});

describe("the World view's coming note", () => {
  it("lists the settings themselves when the server cannot change them yet", () => {
    expect(worldUpcoming(false, null)).toBe("Traffic settings, roaming rival settings and cops.");
  });

  it("lists what the settings cannot do yet, and never traffic above 3x", () => {
    expect(worldUpcoming(true, report())).toBe("More roaming rivals than the game's own and cops.");
    expect(worldUpcoming(true, null)).toBe("More roaming rivals than the game's own and cops.");
  });

  it("gives no note when only Cops is coming: its row already says so", () => {
    expect(worldUpcoming(true, liveReport())).toBeNull();
  });
});
