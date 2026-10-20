// The window's own buttons, in the Windows order: Minimize, Maximize (or
// Restore while maximized), Close. The window has no native frame, so these
// sit in the header, apart from the driver's profile.

export type WindowAction = "minimize" | "toggleMaximize" | "close";
export type WindowGlyph = "minimize" | "maximize" | "restore" | "close";

export interface WindowButton {
  action: WindowAction;
  /** The accessible name and the tooltip. */
  label: "Minimize" | "Maximize" | "Restore" | "Close";
  glyph: WindowGlyph;
}

export function windowButtons(maximized: boolean): WindowButton[] {
  return [
    { action: "minimize", label: "Minimize", glyph: "minimize" },
    maximized
      ? { action: "toggleMaximize", label: "Restore", glyph: "restore" }
      : { action: "toggleMaximize", label: "Maximize", glyph: "maximize" },
    { action: "close", label: "Close", glyph: "close" },
  ];
}
