import type { OutputLine } from "$lib/api/types";

/** Presentation hints from the current session's bounded diagnostic feed.
 * Unknown/older server output falls back to the ordinary preparation label.
 * These labels never change readiness, permissions or session state.
 */
export function preparationLine(lines: readonly OutputLine[]): string | null {
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 400); i -= 1) {
    const line = lines[i];
    if (!line || line.kind !== "text" || line.text.length > 4096) continue;
    const text = line.text.replace(/\u001b\[[0-9;]*m/g, "");
    if (text.startsWith("[content] Checking your game files"))
      return "Checking game files for changes";
    if (text.startsWith("[content] Checking previously prepared"))
      return "Checking saved game data";
    if (text.startsWith("[content] Verified content cache reused"))
      return "Game data loaded from cache";
    if (text.startsWith("[content] Reading the installed game archives"))
      return "Preparing game data for this installation";
    if (text.startsWith("[setup] Loaded verified cached"))
      return "Server settings loaded from cache";
    if (text.startsWith("[setup] Local server settings ready")) return "Preparing server content";
    if (!/\bINFO nfs_server::/.test(text)) continue;
    if (text.includes('runtime preparation progress phase="sprints"')) {
      const counts = /\bcompleted=(\d+) total=(\d+)\b/.exec(text);
      if (counts) {
        const completed = Number(counts[1]);
        const total = Number(counts[2]);
        if (total > 0 && total <= 512 && completed > 0 && completed <= total) {
          return `Preparing races · ${completed} of ${total}`;
        }
      }
    }
    if (text.includes('static runtime content ready component="normal-sprints"')) {
      return /\bsource=Hit\b/.test(text)
        ? "Races loaded from cache · preparing prologue"
        : "Races prepared · preparing prologue";
    }
    if (text.includes("compiling complete prologue cache")) return "Preparing prologue";
    if (text.includes("validating complete prologue cache")) return "Checking prepared prologue";
    if (text.includes('static runtime content ready component="complete-prologue"')) {
      return /\bsource=Hit\b/.test(text)
        ? "Prologue loaded from cache · finishing startup"
        : "Prologue prepared · finishing startup";
    }
    if (text.includes('runtime preparation phase complete phase="shared_content"'))
      return "Loading race data";
    if (text.includes('runtime preparation phase complete phase="rival_roads"'))
      return "Preparing shared game content";
  }
  return null;
}
