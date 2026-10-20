// Numbers, sizes and times as the screens print them. Only what the server
// defines gets a unit: the bank is dollars, sizes are bytes and times are
// UTC. Save table values are raw stored integers (the game's units for
// distance, time and speed are not confirmed), so they print as plain
// counts and never with a guessed unit.

const COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 13052031 → "13,052,031". */
export function formatCount(n: number): string {
  return COUNT.format(n);
}

/** 250000 → "$250,000"; negatives keep their sign before the dollar. */
export function formatMoney(n: number): string {
  return n < 0 ? `-$${formatCount(-n)}` : `$${formatCount(n)}`;
}

/** 250000 → "$250K", 1000000 → "$1M": for chips and buttons. */
export function formatMoneyShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000 && abs % 100_000 === 0) return `${sign}$${abs / 1_000_000}M`;
  if (abs >= 1_000 && abs % 1_000 === 0 && abs < 1_000_000) return `${sign}$${abs / 1_000}K`;
  return formatMoney(n);
}

/** Bytes in the units Explorer uses: "219 B", "1.5 KB", "444 KB", "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = value < 10 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));
  return `${text} ${units[unit]}`;
}

/** `RepScore` → "Rep score", `NumberOfEventsCompleted` → "Number of events completed". */
export function humanize(column: string): string {
  const words = column
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return column;
  return words
    .map((w, i) => {
      // Keep acronyms and position codes (P1, ID) as written.
      if (/^[A-Z\d]+$/.test(w) && w.length > 1) return w;
      return i === 0 ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase();
    })
    .join(" ");
}

/** A span of milliseconds: "45 s", "7 min", "1 h 12 min". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export interface Clock {
  /** Time zone for display; the window's own when omitted. Tests pass UTC. */
  timeZone?: string;
}

function parts(date: Date, clock: Clock): Record<string, string> {
  const format = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: clock.timeZone,
  });
  return Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
}

/** "Sat 18 Oct · 08:18", or with `end` on the same day "Sat 18 Oct · 08:18–08:25". */
export function formatWhen(start: string, end: string | null, clock: Clock = {}): string {
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return start;
  const a = parts(from, clock);
  const head = `${a.weekday} ${a.day} ${a.month} · ${a.hour}:${a.minute}`;
  if (!end) return head;
  const to = new Date(end);
  if (Number.isNaN(to.getTime())) return head;
  const b = parts(to, clock);
  const sameDay = a.day === b.day && a.month === b.month && a.year === b.year;
  return sameDay
    ? `${head}–${b.hour}:${b.minute}`
    : `${head} – ${b.weekday} ${b.day} ${b.month} · ${b.hour}:${b.minute}`;
}

/** "today 21:40", "yesterday 21:40" or "Sat 18 Oct 21:40", relative to `now`. */
export function formatSaved(utc: string, now: Date, clock: Clock = {}): string {
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return utc;
  const a = parts(date, clock);
  const today = parts(now, clock);
  const yesterday = parts(new Date(now.getTime() - 86_400_000), clock);
  const time = `${a.hour}:${a.minute}`;
  const same = (b: Record<string, string>) =>
    a.day === b.day && a.month === b.month && a.year === b.year;
  if (same(today)) return `today ${time}`;
  if (same(yesterday)) return `yesterday ${time}`;
  return `${a.weekday} ${a.day} ${a.month} ${time}`;
}
