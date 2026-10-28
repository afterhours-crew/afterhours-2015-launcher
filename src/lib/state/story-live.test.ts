import { describe, expect, it, vi } from "vitest";
import { StoryFollower, type Timers } from "./story-live";

/** Timers run only when the test says so. */
function manualTimers() {
  const queue = new Map<number, () => void>();
  let next = 1;
  const timers: Timers = {
    set: (run) => {
      const id = next++;
      queue.set(id, run);
      return id;
    },
    clear: (handle) => void queue.delete(handle as number),
  };
  return {
    timers,
    pending: () => queue.size,
    async fire() {
      const [id, run] = [...queue.entries()][0] ?? [];
      if (id === undefined || !run) throw new Error("No timer pending.");
      queue.delete(id);
      run();
      // Let the read and its rescheduling settle.
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe("StoryFollower", () => {
  it("reads only while a game runs and a screen shows the story", async () => {
    const t = manualTimers();
    const read = vi.fn(async () => {});
    const f = new StoryFollower(read, t.timers, 4000);
    f.setLive(true);
    expect(f.following).toBe(false);
    const release = f.retain();
    expect(f.following).toBe(true);
    await t.fire();
    expect(read).toHaveBeenCalledTimes(1);
    expect(t.pending()).toBe(1);
    release();
    expect(t.pending()).toBe(0);
  });

  it("stops when the game closes and reads once more for its last save", async () => {
    const t = manualTimers();
    const read = vi.fn(async () => {});
    const f = new StoryFollower(read, t.timers);
    f.retain();
    f.setLive(true);
    f.setLive(false);
    expect(t.pending()).toBe(0);
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("keeps following after a failed read", async () => {
    const t = manualTimers();
    const read = vi.fn(async () => {
      throw new Error("server busy");
    });
    const f = new StoryFollower(read, t.timers);
    f.retain();
    f.setLive(true);
    await t.fire();
    expect(read).toHaveBeenCalledTimes(1);
    expect(t.pending()).toBe(1);
  });

  it("counts every open screen and ignores a repeated release", () => {
    const t = manualTimers();
    const f = new StoryFollower(async () => {}, t.timers);
    f.setLive(true);
    const a = f.retain();
    const b = f.retain();
    a();
    a();
    expect(f.following).toBe(true);
    b();
    expect(f.following).toBe(false);
  });

  it("does not read without a game, even with screens open", () => {
    const t = manualTimers();
    const read = vi.fn(async () => {});
    const f = new StoryFollower(read, t.timers);
    f.retain();
    f.setLive(false);
    expect(t.pending()).toBe(0);
    expect(read).not.toHaveBeenCalled();
  });
});
