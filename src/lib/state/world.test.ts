import { describe, expect, it } from "vitest";
import type { SettingsReport, Status } from "$lib/api/types";
import {
  MAX_RIVALS,
  applyChoice,
  rivalField,
  saveArgs,
  trafficRow,
  trafficUpcoming,
  worldLock,
  worldUpcoming,
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
  it("shows Off to 5x, with the steps above the server's maximum coming later", () => {
    expect(trafficRow(report())).toEqual({
      options: [
        { value: "0", label: "Off" },
        { value: "100", label: "Default" },
        { value: "200", label: "2x" },
        { value: "300", label: "3x" },
        { value: "400", label: "4x", upcoming: true },
        { value: "500", label: "5x", upcoming: true },
      ],
      selected: "100",
    });
    expect(trafficUpcoming(report())).toBe(true);
  });

  it("makes 4x and 5x pickable by themselves when the server allows them", () => {
    const row = trafficRow(report({ max_traffic_percent: 500 }));
    expect(row.options.map((o) => o.label)).toEqual(["Off", "Default", "2x", "3x", "4x", "5x"]);
    expect(row.options.some((o) => o.upcoming)).toBe(false);
    expect(trafficUpcoming(report({ max_traffic_percent: 500 }))).toBe(false);
    const partly = trafficRow(report({ max_traffic_percent: 450 }));
    expect(partly.options.filter((o) => o.upcoming).map((o) => o.label)).toEqual(["5x"]);
  });

  it("selects a saved step", () => {
    expect(trafficRow(report({ traffic_percent: 0 })).selected).toBe("0");
    expect(trafficRow(report({ traffic_percent: 300 })).selected).toBe("300");
  });

  it("shows an amount off the scale as an extra, selected chip", () => {
    const row = trafficRow(report({ traffic_percent: 150 }));
    expect(row.selected).toBe("custom:150");
    expect(row.options.at(-1)).toEqual({ value: "custom:150", label: "150 %" });
    expect(row.options).toHaveLength(7);
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

describe("the World view's coming note", () => {
  it("lists the settings themselves when the server cannot change them yet", () => {
    expect(worldUpcoming(false, null)).toBe("Traffic settings, roaming rival settings and cops.");
  });

  it("lists what the settings cannot do yet", () => {
    expect(worldUpcoming(true, report())).toBe(
      "Traffic up to 5x, more roaming rivals than the game's own and cops.",
    );
    expect(worldUpcoming(true, report({ max_traffic_percent: 500 }))).toBe(
      "More roaming rivals than the game's own and cops.",
    );
  });
});
