import { describe, expect, it } from "vitest";
import type { StoryReport } from "$lib/api/types";
import { newlyDone, previewMarks, sameProgress, storyStops, storySummary } from "./story";

type Flags = Partial<StoryReport["checkpoints"][number]>;
const account = "01".repeat(16);

/** Five objectives plus `after-intro`; `flags[i]` overrides checkpoint i. */
function story(current: string, flags: Record<number, Flags> = {}, done = false): StoryReport {
  return {
    version: 1,
    account_id: account,
    generation: "7",
    current_checkpoint: current,
    intro_completed: done,
    session_running: false,
    can_edit: false,
    warnings: [],
    checkpoints: ["11", "12", "13", "14", "15", "after-intro"].map((id, i) => ({
      id,
      label: `Step ${i + 1}`,
      active: id === current,
      completed: false,
      played: false,
      edited: false,
      existing: false,
      reward_claimed: false,
      selectable: false,
      ...flags[i],
    })),
  };
}
const played: Flags = { completed: true, played: true };

describe("storyStops", () => {
  it("draws a fresh save as the first stop next and the rest ahead", () => {
    const stops = storyStops(story("11"));
    expect(stops.map((s) => s.kind)).toEqual(["here", "ahead", "ahead", "ahead", "ahead", "ahead"]);
    expect(stops[0]!.saved).toBe(true);
    expect(stops.at(-1)!.terminal).toBe(true);
  });

  it("keeps played, set-in-launcher and older-save completions apart", () => {
    const stops = storyStops(
      story("14", {
        0: played,
        1: { completed: true, edited: true },
        2: { completed: true, existing: true },
      }),
    );
    expect(stops.slice(0, 4).map((s) => [s.kind, s.word])).toEqual([
      ["played", "Played"],
      ["set", "Set in launcher"],
      ["kept", "From an older save"],
      ["here", "Next"],
    ]);
  });

  it("marks the completed terminal stop as the saved position", () => {
    const all = { 0: played, 1: played, 2: played, 3: played, 4: played, 5: played };
    const stops = storyStops(story("after-intro", all, true));
    expect(stops.at(-1)).toMatchObject({ kind: "played", saved: true, done: true });
  });
});

describe("storySummary", () => {
  it("counts the five objectives only and names the next one", () => {
    const s = storySummary(story("14", { 0: played, 1: played, 2: played }));
    expect(s).toMatchObject({ done: 3, total: 5, complete: false, started: true, next: "Step 4" });
  });

  it("says nothing has started on a fresh save", () => {
    expect(storySummary(story("11"))).toMatchObject({ done: 0, started: false, next: "Step 1" });
  });

  it("reports how a complete prologue was finished", () => {
    const set = { completed: true, edited: true };
    const all = { 0: set, 1: set, 2: set, 3: set, 4: set, 5: set };
    expect(storySummary(story("after-intro", all, true))).toMatchObject({
      complete: true,
      next: null,
      how: "set",
    });
  });
});

describe("previewMarks", () => {
  it("marks what the server said a jump completes or reopens, nothing else", () => {
    const stops = storyStops(story("13", { 0: played, 1: played }));
    expect(previewMarks(stops, [{ id: "13" }, { id: "14" }], [])).toEqual([
      null,
      null,
      "will-complete",
      "will-complete",
      null,
      null,
    ]);
    expect(previewMarks(stops, [], [{ id: "12" }])[1]).toBe("will-reopen");
  });
});

describe("live reads", () => {
  it("finds the objectives a read completed since the last one", () => {
    const before = story("13", { 0: played, 1: played });
    const after = story("14", { 0: played, 1: played, 2: played });
    expect(newlyDone(before, after)).toEqual(["13"]);
    expect(newlyDone(after, after)).toEqual([]);
  });

  it("never celebrates on the first read or another save", () => {
    const after = story("14", { 0: played });
    expect(newlyDone(null, after)).toEqual([]);
    expect(newlyDone({ ...story("11"), account_id: "02".repeat(16) }, after)).toEqual([]);
  });

  it("treats an identical read as no change and any progress as one", () => {
    const a = story("13", { 0: played });
    expect(sameProgress(a, structuredClone(a))).toBe(true);
    expect(sameProgress(a, { ...a, generation: "8" })).toBe(false);
    expect(sameProgress(a, { ...a, session_running: true })).toBe(false);
    expect(sameProgress(null, a)).toBe(false);
  });
});
