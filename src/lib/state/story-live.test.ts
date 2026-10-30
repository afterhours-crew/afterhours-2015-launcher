import { describe, expect, it, vi } from "vitest";
import { refreshStoppedStory, StoryFollower, type Timers } from "./story-live";

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

  it("reads the final save after an in-flight live read completes", async () => {
    const t = manualTimers();
    let finish!: () => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    read.mockResolvedValue(undefined);
    const f = new StoryFollower(read, t.timers);
    f.retain();
    f.setLive(true);
    await t.fire();
    f.setLive(false);
    expect(read).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(2);
    expect(t.pending()).toBe(0);
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

  it("does not read a complete story, even while the game runs", () => {
    const t = manualTimers();
    const read = vi.fn(async () => {});
    const f = new StoryFollower(read, t.timers);
    f.retain();
    f.setLive(true, true);
    expect(t.pending()).toBe(0);
    f.setLive(false, true);
    expect(read).not.toHaveBeenCalled();
  });

  it("stops at once when a read finds the story complete", async () => {
    const t = manualTimers();
    const read = vi.fn(async () => {});
    const f = new StoryFollower(read, t.timers);
    f.retain();
    f.setLive(true);
    await t.fire();
    expect(t.pending()).toBe(1);
    // The read brought intro_completed: the next setLive comes from the new record.
    f.setLive(true, true);
    expect(t.pending()).toBe(0);
    await t.fire().catch(() => {});
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("follows again when a replayed prologue is under way in the next game", () => {
    const t = manualTimers();
    const f = new StoryFollower(async () => {}, t.timers);
    f.retain();
    f.setLive(false, true);
    f.setLive(true, false);
    expect(f.following).toBe(true);
  });
});

describe("refreshing a stopped session's story", () => {
  it("waits through terminal status and API shutdown until the actual lease is released", async () => {
    const states = [true, null, true, false];
    const read = vi.fn(async () => states.shift()!);
    const wait = vi.fn(async () => {});
    await refreshStoppedStory(read, () => true, wait);
    expect(read).toHaveBeenCalledTimes(4);
    expect(wait).toHaveBeenCalledTimes(3);
  });

  it("bounds retries while another writer keeps its lease", async () => {
    const read = vi.fn(async () => true);
    const wait = vi.fn(async () => {});
    await refreshStoppedStory(read, () => true, wait);
    expect(read).toHaveBeenCalledTimes(12);
    expect(wait).toHaveBeenCalledTimes(11);
  });

  it("stops if the user changes server or starts another session", async () => {
    let current = true;
    const read = vi.fn(async () => true);
    await refreshStoppedStory(
      read,
      () => current,
      async () => void (current = false),
    );
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not start a read for a replaced session, or keep retrying a slow unavailable read", async () => {
    let time = 0;
    const read = vi.fn(async () => {
      time = 30_000;
      return null;
    });
    const wait = vi.fn(async () => {});
    await refreshStoppedStory(
      read,
      () => false,
      wait,
      () => time,
    );
    expect(read).not.toHaveBeenCalled();
    await refreshStoppedStory(
      read,
      () => true,
      wait,
      () => time,
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
