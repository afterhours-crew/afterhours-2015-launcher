import { describe, expect, it } from "vitest";
import { BOTTOM_SLACK, START, arrived, atBottom, interrupt, jump, scrolled } from "./follow";

/** A 400px view over 2000px of log, scrolled to `top`. */
const at = (top: number) => ({ scrollTop: top, clientHeight: 400, scrollHeight: 2000 });
const bottom = at(1600);
const up = at(900);

describe("at the bottom", () => {
  it("counts a small gap above the end as the bottom", () => {
    expect(atBottom(bottom)).toBe(true);
    expect(atBottom(at(1600 - BOTTOM_SLACK))).toBe(true);
    expect(atBottom(at(1600 - BOTTOM_SLACK - 1))).toBe(false);
    expect(atBottom(up)).toBe(false);
  });

  it("is always true for a log that does not scroll", () => {
    expect(atBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 120 })).toBe(true);
    expect(atBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 400 })).toBe(true);
  });
});

describe("following a live log", () => {
  it("starts following and keeps following at the bottom", () => {
    expect(START.following).toBe(true);
    expect(scrolled(START, bottom)).toEqual(START);
    expect(arrived(START, 5)).toEqual(START);
  });

  it("pauses when the reader scrolls up, and holds there", () => {
    const paused = scrolled(START, up);
    expect(paused).toEqual({ following: false, unseen: 0, jumping: false });
    expect(scrolled(paused, at(700))).toEqual(paused);
  });

  it("counts new lines while paused", () => {
    let state = scrolled(START, up);
    state = arrived(state, 3);
    state = arrived(state, 1);
    expect(state).toEqual({ following: false, unseen: 4, jumping: false });
    expect(arrived(state, 0)).toEqual(state);
  });

  it("resumes, with nothing unseen, back at the bottom", () => {
    const paused = arrived(scrolled(START, up), 7);
    expect(scrolled(paused, bottom)).toEqual(START);
  });
});

describe("jump to latest", () => {
  it("follows at once and is not paused by the smooth scroll on its way down", () => {
    const paused = arrived(scrolled(START, up), 12);
    const jumping = jump(paused);
    expect(jumping).toEqual({ following: true, unseen: 0, jumping: true });
    expect(scrolled(jumping, at(1200))).toEqual(jumping);
    expect(arrived(jumping, 2)).toEqual(jumping);
    expect(scrolled(jumping, bottom)).toEqual(START);
  });

  it("lets the reader take over during a jump", () => {
    const jumping = jump(scrolled(START, up));
    const taken = interrupt(jumping);
    expect(taken).toEqual({ following: false, unseen: 0, jumping: false });
    expect(scrolled(taken, at(800)).following).toBe(false);
    expect(interrupt(START)).toEqual(START);
  });

  it("is a no-op when already following", () => {
    expect(jump(START)).toEqual(START);
  });
});
