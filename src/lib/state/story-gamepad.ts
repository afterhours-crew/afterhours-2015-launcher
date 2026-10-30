export type StoryPadAction = "previous" | "next" | "up" | "down" | "activate" | "cancel";
type Pad = Pick<Gamepad, "index" | "id" | "mapping" | "buttons" | "axes">;

// Edge-triggered buttons: connecting, refocusing or holding A never applies a preview.
export class StoryPad {
  private identity: string | null = null;
  private held = new Set<StoryPadAction>();

  read(pad: Pad | null, active: boolean): StoryPadAction[] {
    if (!active || !pad || pad.mapping !== "standard") {
      this.identity = null;
      this.held.clear();
      return [];
    }
    const pressed = (index: number) => pad.buttons[index]?.pressed === true;
    const held = new Set<StoryPadAction>();
    if (pressed(14) || (pad.axes[0] ?? 0) < -0.6) held.add("previous");
    if (pressed(15) || (pad.axes[0] ?? 0) > 0.6) held.add("next");
    if (pressed(12) || (pad.axes[1] ?? 0) < -0.6) held.add("up");
    if (pressed(13) || (pad.axes[1] ?? 0) > 0.6) held.add("down");
    if (pressed(0)) held.add("activate");
    if (pressed(1)) held.add("cancel");
    const identity = `${pad.index}:${pad.id}`;
    const actions =
      identity === this.identity ? [...held].filter((key) => !this.held.has(key)) : [];
    this.identity = identity;
    this.held = held;
    // Simultaneous directions/cancel/activate are ambiguous. Never turn them into a write.
    return actions.length === 1 ? actions : [];
  }
}

export function storyGamepad(node: HTMLElement, cancel: () => void) {
  const pad = new StoryPad();
  let frame: number;
  const poll = () => {
    const current =
      [...(navigator.getGamepads?.() ?? [])].find(
        (p) => p?.connected && p.mapping === "standard",
      ) ?? null;
    const active = document.visibilityState === "visible" && document.hasFocus();
    for (const action of pad.read(current, active)) {
      const controls = [
        ...node.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input[type="range"]:not(:disabled), input[type="radio"]:not(:disabled)',
        ),
      ].filter((control) => control.getClientRects().length > 0);
      const focused = document.activeElement;
      if (action === "cancel") {
        cancel();
        continue;
      }
      if (action === "up" || action === "down") {
        const index = controls.indexOf(focused as HTMLElement);
        const next =
          index < 0
            ? 0
            : Math.max(0, Math.min(controls.length - 1, index + (action === "up" ? -1 : 1)));
        controls[next]?.focus();
      } else if (action === "previous" || action === "next") {
        const range = node.querySelector<HTMLInputElement>('input[type="range"]:not(:disabled)');
        if (!range) continue;
        range.focus();
        const before = range.value;
        if (action === "previous") range.stepDown();
        else range.stepUp();
        if (range.value !== before) {
          range.dispatchEvent(new Event("input", { bubbles: true }));
          range.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } else if (
        (focused instanceof HTMLButtonElement ||
          (focused instanceof HTMLInputElement && focused.type === "radio")) &&
        controls.includes(focused)
      ) {
        focused.click();
      }
    }
    frame = requestAnimationFrame(poll);
  };
  frame = requestAnimationFrame(poll);
  return {
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
}
