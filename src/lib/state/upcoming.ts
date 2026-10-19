// How the launcher shows what is planned but not usable yet. Everywhere it
// uses the same words, the same violet and the same clock icon: the
// Upcoming pill where the feature will be, a clock on a step or tab that
// cannot be picked yet, and one "coming" note on a view whose main content
// is not here yet or that has several such items. Things with no plan are
// not shown at all.

/** The words for anything planned but not usable yet. */
export const UPCOMING = "Coming in a future update";

/** "a", "a and b", "a, b and c". */
export function listText(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** A list as a sentence: capital first letter and a full stop. */
export function listSentence(items: readonly string[]): string {
  const text = listText(items);
  return text ? `${text[0]!.toUpperCase()}${text.slice(1)}.` : "";
}
