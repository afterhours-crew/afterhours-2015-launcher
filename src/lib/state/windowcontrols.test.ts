import { describe, expect, it } from "vitest";
import { windowButtons } from "./windowcontrols";

describe("window controls", () => {
  it("offers Minimize, Maximize and Close in the Windows order", () => {
    expect(windowButtons(false)).toEqual([
      { action: "minimize", label: "Minimize", glyph: "minimize" },
      { action: "toggleMaximize", label: "Maximize", glyph: "maximize" },
      { action: "close", label: "Close", glyph: "close" },
    ]);
  });

  it("turns Maximize into Restore while the window is maximized", () => {
    const buttons = windowButtons(true);
    expect(buttons[1]).toEqual({ action: "toggleMaximize", label: "Restore", glyph: "restore" });
    expect(buttons.map((b) => b.label)).toEqual(["Minimize", "Restore", "Close"]);
  });
});
