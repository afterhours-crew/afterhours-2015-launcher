// Following the story while the game runs. The server records each intro
// objective in the save as it is completed, and its session API reads the
// save for `GET /v1/story`; the event stream carries no story events. So
// while a game is running and a screen that shows the story is open, the
// window reads the story again every few seconds. Nothing is read while no
// game runs, nothing shows it, or the story shown is already complete (a
// complete prologue cannot advance while the game runs: changing it needs
// the session stopped). One more read follows a game closing mid-story.

/** How often a running game's story is read again. */
export const LIVE_POLL_MS = 4000;

export interface Timers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class StoryFollower {
  private holders = 0;
  private live = false;
  private complete = false;
  private handle: unknown = null;
  private reading = false;
  private reread = false;

  constructor(
    private read: () => Promise<void>,
    private timers: Timers = browserTimers,
    private every = LIVE_POLL_MS,
  ) {}

  /** A screen shows the story; call the returned function when it closes. */
  retain(): () => void {
    this.holders += 1;
    this.sync();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holders -= 1;
      this.sync();
    };
  }

  /**
   * Whether a game is running in the session the window follows, and
   * whether the story last read is complete.
   */
  setLive(live: boolean, complete = false): void {
    const ended = this.live && !live;
    this.live = live;
    this.complete = complete;
    this.sync();
    // The game closed mid-story: its last objective may have been saved since the last read.
    if (ended && !complete && this.holders > 0) void this.tick();
  }

  /** A read is scheduled. */
  get following(): boolean {
    return this.handle !== null;
  }

  private get wanted(): boolean {
    return this.holders > 0 && this.live && !this.complete;
  }

  private sync(): void {
    if (this.wanted && this.handle === null) this.schedule();
    else if (!this.wanted && this.handle !== null) {
      this.timers.clear(this.handle);
      this.handle = null;
    }
  }

  private schedule(): void {
    this.handle = this.timers.set(() => {
      this.handle = null;
      void this.tick().finally(() => {
        if (this.wanted && this.handle === null) this.schedule();
      });
    }, this.every);
  }

  private async tick(): Promise<void> {
    if (this.reading) {
      this.reread = true;
      return;
    }
    this.reading = true;
    try {
      await this.read();
    } catch {
      // A missed read keeps what is shown; the next one tries again.
    } finally {
      this.reading = false;
      if (this.reread) {
        this.reread = false;
        if (this.holders > 0) void this.tick();
      }
    }
  }
}

/** Terminal status can precede release of the supervisor's lock. Reads remain
 * authoritative; a deadline never turns a still-held or unknown lock into idle. */
export async function refreshStoppedStory(
  read: () => Promise<boolean | null>,
  current: () => boolean,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => number = Date.now,
): Promise<void> {
  const deadline = now() + 6000;
  for (let attempt = 0; attempt < 12 && current(); attempt += 1) {
    const running = await read();
    if (!current() || running === false || now() >= deadline) return;
    if (attempt < 11) await wait(500);
  }
}
