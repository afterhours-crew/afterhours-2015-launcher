// How the saved story reads on screen (canvas row K): one stop per intro
// objective, then the terminal `after-intro` stop. Pure: the Story view,
// the Garage's prologue line and the Profile overview draw what this
// returns. Every value comes from the server's `story` record; nothing here
// guesses progress from REP, cars or the time played.

import type { StoryReport } from "$lib/api/types";

/** The terminal checkpoint the server appends after the intro objectives. */
export const AFTER_INTRO = "after-intro";

/**
 * How a stop is drawn. `played`, `set` and `kept` are done: played in the
 * game, set in the launcher, or already complete in an older save without a
 * gameplay receipt. `here` is the saved position; `ahead` is still to come.
 */
export type StopKind = "played" | "set" | "kept" | "here" | "ahead";

export interface Stop {
  id: string;
  label: string;
  index: number;
  kind: StopKind;
  /** Complete in the save. */
  done: boolean;
  /** The saved position (the server's `current_checkpoint`). */
  saved: boolean;
  /** `after-intro`: the prologue as a whole. */
  terminal: boolean;
  /** The status word under the stop. */
  word: string;
}

function doneKind(point: StoryReport["checkpoints"][number]): StopKind {
  if (point.played) return "played";
  if (point.edited) return "set";
  if (point.existing) return "kept";
  return "played";
}

const WORDS: Record<StopKind, string> = {
  played: "Played",
  set: "Set in launcher",
  kept: "From an older save",
  here: "Next",
  ahead: "Ahead",
};

export function storyStops(story: StoryReport): Stop[] {
  return story.checkpoints.map((point, index) => {
    const saved = point.id === story.current_checkpoint;
    const terminal = point.id === AFTER_INTRO;
    const kind: StopKind = point.completed ? doneKind(point) : saved ? "here" : "ahead";
    return {
      id: point.id,
      label: point.label,
      index,
      kind,
      done: point.completed,
      saved,
      terminal,
      word: WORDS[kind],
    };
  });
}

export interface StorySummary {
  /** Intro objectives complete, the terminal stop not counted. */
  done: number;
  total: number;
  complete: boolean;
  started: boolean;
  /** The saved position's label while the prologue is under way. */
  next: string | null;
  /** How the completion came about, once complete. */
  how: StopKind | null;
}

export function storySummary(story: StoryReport): StorySummary {
  const objectives = story.checkpoints.filter((p) => p.id !== AFTER_INTRO);
  const done = objectives.filter((p) => p.completed).length;
  const complete = story.intro_completed;
  const next = complete
    ? null
    : (story.checkpoints.find((p) => p.id === story.current_checkpoint)?.label ?? null);
  const terminal = story.checkpoints.find((p) => p.id === AFTER_INTRO);
  return {
    done,
    total: objectives.length,
    complete,
    started: done > 0 || objectives.some((p) => p.played),
    next,
    how: complete && terminal ? doneKind(terminal) : null,
  };
}

/** What a previewed jump does to one stop. */
export type PreviewMark = "will-complete" | "will-reopen" | null;

/** For each stop, what the server's preview said it changes. */
export function previewMarks(
  stops: readonly Stop[],
  completes: readonly { id: string }[],
  reopens: readonly { id: string }[],
): PreviewMark[] {
  const done = new Set(completes.map((p) => p.id));
  const open = new Set(reopens.map((p) => p.id));
  return stops.map((s) =>
    done.has(s.id) ? "will-complete" : open.has(s.id) ? "will-reopen" : null,
  );
}

/**
 * Stops complete in `next` but not in `previous`, for the same save: what a
 * live read found finished since the last one. A different account or the
 * first read finds nothing, so opening the view never celebrates.
 */
export function newlyDone(previous: StoryReport | null, next: StoryReport): string[] {
  if (!previous || previous.account_id !== next.account_id) return [];
  const before = new Set(previous.checkpoints.filter((p) => p.completed).map((p) => p.id));
  return next.checkpoints.filter((p) => p.completed && !before.has(p.id)).map((p) => p.id);
}

/** Two reads show the same progress: nothing on screen needs to change. */
export function sameProgress(a: StoryReport | null, b: StoryReport): boolean {
  if (!a) return false;
  return (
    a.account_id === b.account_id &&
    a.generation === b.generation &&
    a.current_checkpoint === b.current_checkpoint &&
    a.session_running === b.session_running &&
    a.can_edit === b.can_edit &&
    JSON.stringify(a.checkpoints) === JSON.stringify(b.checkpoints) &&
    JSON.stringify(a.warnings) === JSON.stringify(b.warnings)
  );
}
