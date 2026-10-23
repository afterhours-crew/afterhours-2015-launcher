// Supporting the project: the Patreon link (Settings › Support the
// project, canvas J1) and the Garage's occasional line (J2), which shows
// on some launcher opens, never all of them. Pure: the session store feeds
// it the saved counters and records what it decides. More places to chip
// in are added here as entries; a placeholder `url` hides a row everywhere.

export const SUPPORT_LINKS = {
  patreon: {
    label: "Join on Patreon",
    short: "Join on Patreon",
    about: "Monthly, cancel any time",
    url: "https://www.patreon.com/cw/AfterhoursCrew",
  },
} as const;

export type SupportKey = keyof typeof SUPPORT_LINKS;

/** A page name has been filled in: the link can be shown. */
export function supportReady(key: SupportKey): boolean {
  return !/REPLACE_WITH_YOUR_PAGE/.test(SUPPORT_LINKS[key].url);
}

/** The links with a page name, in order. */
export function supportLinks(): {
  key: SupportKey;
  label: string;
  short: string;
  about: string;
  url: string;
}[] {
  return (Object.keys(SUPPORT_LINKS) as SupportKey[])
    .filter(supportReady)
    .map((key) => ({ key, ...SUPPORT_LINKS[key] }));
}

/** The line's address, shown under the label: "ko-fi.com/name". */
export function supportHost(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
}

/** Opens the Garage line needs before it first shows. */
export const NUDGE_AFTER_OPENS = 3;
/** Days between two showings. */
export const NUDGE_EVERY_DAYS = 14;

/**
 * Whether this open shows the Garage's support line: not in the first few
 * opens (the launcher has to prove itself first), then at most once every
 * [`NUDGE_EVERY_DAYS`], counted from the last showing. Never without a
 * link to show.
 */
export function shouldNudge(
  launches: number,
  lastShownUtc: string | null,
  now: Date,
  linksReady = supportLinks().length > 0,
): boolean {
  if (!linksReady || launches < NUDGE_AFTER_OPENS) return false;
  if (!lastShownUtc) return true;
  const last = new Date(lastShownUtc).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= NUDGE_EVERY_DAYS * 86_400_000;
}
