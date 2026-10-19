// Following a live log: the view stays on the newest line until the reader
// scrolls up. Then it holds their place while lines keep arriving, counts
// what they have not seen, and offers "Jump to latest". Scrolling back to
// the bottom, or jumping, follows again. Pure: the panel feeds it scroll
// positions and arrivals, and scrolls to the bottom when it says to follow.

export interface Follow {
  /** Pinned to the newest line. */
  following: boolean;
  /** Lines that arrived while not following. */
  unseen: number;
  /** A smooth scroll to the bottom is under way; it passes through positions above the bottom. */
  jumping: boolean;
}

export const START: Follow = { following: true, unseen: 0, jumping: false };

/** Within this many pixels of the bottom counts as at the bottom. */
export const BOTTOM_SLACK = 24;

export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** Whether the view shows the end of the log; one that does not scroll always does. */
export function atBottom(m: ScrollMetrics, slack = BOTTOM_SLACK): boolean {
  return m.scrollTop + m.clientHeight >= m.scrollHeight - slack;
}

/** The reader (or a jump) moved the view. */
export function scrolled(state: Follow, m: ScrollMetrics): Follow {
  if (atBottom(m)) return START;
  // A jump passes through every position on its way down; it is not the
  // reader scrolling up.
  if (state.jumping) return state;
  return { following: false, unseen: state.unseen, jumping: false };
}

/** `count` new lines arrived. */
export function arrived(state: Follow, count: number): Follow {
  if (state.following || count <= 0) return state;
  return { ...state, unseen: state.unseen + count };
}

/** "Jump to latest": follow again while the view scrolls down. */
export function jump(state: Follow): Follow {
  return { following: true, unseen: 0, jumping: !state.following };
}

/** The reader took over during a jump (wheel, keys): the next scroll decides. */
export function interrupt(state: Follow): Follow {
  return state.jumping ? { following: false, unseen: state.unseen, jumping: false } : state;
}
