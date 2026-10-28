// Following the story while the game runs. The server records each intro
// objective in the save as it is completed, and its session API reads the
// save for `GET /v1/story`; the event stream carries no story events. So
// while a game is running and a screen that shows the story is open, the
// window reads the story again every few seconds. Nothing is read while no
// game runs or nothing shows it, and one more read follows the game closing.

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
  private handle: unknown = null;
  private reading = false;

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

  /** Whether a game is running in the session the window follows. */
  setLive(live: boolean): void {
    const ended = this.live && !live;
    this.live = live;
    this.sync();
    // The game closed: its last objective may have been saved since the last read.
    if (ended && this.holders > 0) void this.tick();
  }

  /** A read is scheduled. */
  get following(): boolean {
    return this.handle !== null;
  }

  private get wanted(): boolean {
    return this.holders > 0 && this.live;
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
    if (this.reading) return;
    this.reading = true;
    try {
      await this.read();
    } catch {
      // A missed read keeps what is shown; the next one tries again.
    } finally {
      this.reading = false;
    }
  }
}
