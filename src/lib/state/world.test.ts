import { describe, expect, it } from "vitest";
import type { SettingsReport, Status } from "$lib/api/types";
import {
  RIVAL_MULTIPLIERS,
  applyChoice,
  rivalRow,
  saveArgs,
  trafficRow,
  worldLock,
  worldNote,
} from "./world";

const report = (patch: Partial<SettingsReport> = {}): SettingsReport => ({
  version: 1,
  traffic_percent: 100,
  rival_limit: null,
  max_traffic_percent: 300,
  max_rivals: 128,
  file: "C:\\Users\\Driver\\AppData\\Local\\Afterhours2015\\settings.json",
  saved: false,
  ...patch,
});

describe("traffic", () => {
  it("offers Off to the server's maximum, 3x today", () => {
    expect(trafficRow(report())).toEqual({
      options: [
        { value: "0", label: "Off" },
        { value: "100", label: "1x" },
        { value: "200", label: "2x" },
        { value: "300", label: "3x" },
      ],
      selected: "100",
    });
  });

  it("shows 4x and 5x by themselves when the server allows them", () => {
    expect(trafficRow(report({ max_traffic_percent: 500 })).options.map((o) => o.label)).toEqual([
      "Off",
      "1x",
      "2x",
      "3x",
      "4x",
      "5x",
    ]);
    expect(trafficRow(report({ max_traffic_percent: 450 })).options).toHaveLength(5);
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
  it("offers Off and 1x only: the server can cap rivals but not add more", () => {
    expect(RIVAL_MULTIPLIERS).toEqual([0, 1]);
    expect(rivalRow(report())).toEqual({
      options: [
        { value: "0", label: "Off" },
        { value: "original", label: "1x" },
      ],
      selected: "original",
    });
    expect(rivalRow(report({ rival_limit: 0 })).selected).toBe("0");
  });

  it("shows another saved cap as an extra, selected chip", () => {
    const row = rivalRow(report({ rival_limit: 2 }));
    expect(row.selected).toBe("custom:2");
    expect(row.options.at(-1)).toEqual({ value: "custom:2", label: "At most 2" });
  });
});

describe("saving", () => {
  it("passes the picked step to settings", () => {
    expect(saveArgs("traffic", "0")).toEqual(["--traffic", "0"]);
    expect(saveArgs("traffic", "200")).toEqual(["--traffic", "200"]);
    expect(saveArgs("rivals", "0")).toEqual(["--rivals", "0"]);
    expect(saveArgs("rivals", "original")).toEqual(["--rivals", "original"]);
  });

  it("saves nothing for the extra chip or anything unexpected", () => {
    expect(saveArgs("traffic", "custom:150")).toBeNull();
    expect(saveArgs("rivals", "custom:2")).toBeNull();
    expect(saveArgs("traffic", "original")).toBeNull();
    expect(saveArgs("rivals", "lots")).toBeNull();
  });

  it("shows the pick at once, as the record will read after saving", () => {
    expect(applyChoice(report(), "traffic", "300").traffic_percent).toBe(300);
    expect(applyChoice(report(), "rivals", "0").rival_limit).toBe(0);
    expect(applyChoice(report({ rival_limit: 0 }), "rivals", "original").rival_limit).toBeNull();
    expect(applyChoice(report({ traffic_percent: 150 }), "traffic", "custom:150")).toEqual(
      report({ traffic_percent: 150 }),
    );
  });
});

describe("while a session runs", () => {
  const status = (state: Status["state"]) => ({ state }) as Status;

  it("locks both controls: a session keeps the values it started with", () => {
    for (const state of ["preparing", "starting", "activation", "ready", "stopping"] as const) {
      expect(worldLock(status(state))).toBe(
        "Applies the next time you start. Stop the server to change it.",
      );
    }
  });

  it("unlocks when nothing runs", () => {
    expect(worldLock(null)).toBeNull();
    expect(worldLock(status("finished"))).toBeNull();
    expect(worldLock(status("failed"))).toBeNull();
  });
});

describe("the World note", () => {
  it("names what waits for a server update", () => {
    expect(worldNote(false)).toBe(
      "Traffic, roaming rivals and cops arrive with a later server update.",
    );
    expect(worldNote(true)).toBe("Cops arrive with a later server update.");
  });
});
