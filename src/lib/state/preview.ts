// The browser preview's sample mode. `pnpm dev` opened with `?sample` in
// the address reads the made-up records in ./sample, so the screens can be
// looked at without a server; a banner says so. Development builds only:
// `import.meta.env.DEV` is false in production builds, so this code and
// ./sample are left out of them.

import { inTauri } from "$lib/api/tauri";
import type { AppInfo, CliResult, OutputLine, Status } from "$lib/api/types";

/** The sample records, in development builds only; `null` in production. */
export const loadSample = import.meta.env.DEV ? () => import("./sample") : null;

export const sampleMode =
  loadSample !== null &&
  !inTauri &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("sample");

/** What the window would know about a contract v1 server. */
export async function sampleAppInfo(): Promise<AppInfo> {
  if (!loadSample) throw new Error("Sample records exist in development builds only.");
  const { SAMPLE_VERSION } = await loadSample();
  const query = new URLSearchParams(window.location.search);
  // `&noplay`: a server from before `play`, which can only restart with the game.
  const capabilities = SAMPLE_VERSION.capabilities.filter(
    (name) => name !== "play" || !query.has("noplay"),
  );
  return {
    launcher_version: "0.1.0",
    server: {
      repository: "afterhours-crew/afterhours-2015",
      pinned_tag: "sample",
      pinned_sha256: "0".repeat(64),
      override_allowed: true,
      path: "Afterhours.exe",
      source: "override",
      version_line: "Afterhours 0.0.0 (sample)",
      matches_pin: null,
      capabilities,
      error: null,
    },
    data_dir: "C:\\Users\\Driver\\AppData\\Local\\Afterhours2015",
    // `?sample&portable`: a launcher copied into the game folder.
    game_in_launcher_folder: new URLSearchParams(window.location.search).has("portable")
      ? "C:\\Games\\Need for Speed"
      : null,
    updater: { endpoint: null, configured: false },
    debug_build: true,
  };
}

/**
 * `?sample&hosting`: a `serve` session hosting without a game, for the
 * launch bar, the header pill and Host; `&hosting=game` has a game playing
 * in it. `null` (no session) without `hosting`.
 */
export async function sampleStatus(): Promise<Status | null> {
  if (!loadSample) throw new Error("Sample records exist in development builds only.");
  const hosting = new URLSearchParams(window.location.search).get("hosting");
  if (hosting === null) return null;
  const { sampleHosting } = await loadSample();
  return sampleHosting(hosting === "game");
}

/**
 * `?sample`: a made-up picture for a sample car's image path, drawn as an
 * SVG (a coloured floor and a plain car shape, labelled "Sample"), so the
 * Cars and Profile pictures can be looked at without game files. A path
 * ending in `-broken.png` returns a URL that fails to load, to show the
 * placeholder. Development builds only.
 */
export const sampleImageSrc = import.meta.env.DEV
  ? (path: string): string => {
      if (path.endsWith("-broken.png")) return "data:image/png;base64,broken";
      const hues = [205, 330, 45, 150, 265, 20];
      let hash = 0;
      for (const c of path) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
      const hue = hues[hash % hues.length];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 35% 22%)"/><stop offset="1" stop-color="hsl(${hue} 25% 10%)"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><path d="M86 300 L130 238 Q150 212 190 210 L318 210 Q352 212 376 236 L426 290 L426 330 L86 330 Z" fill="hsl(${hue} 70% 58%)"/><circle cx="160" cy="332" r="34" fill="#151518"/><circle cx="356" cy="332" r="34" fill="#151518"/><text x="256" y="420" font-family="sans-serif" font-size="40" text-anchor="middle" fill="rgba(255,255,255,0.55)">Sample</text></svg>`;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
  : null;

/** A passing check, so the preview's first run reaches its last step. */
export async function sampleCheck(): Promise<CliResult> {
  if (!loadSample) throw new Error("Sample records exist in development builds only.");
  const { SAMPLE_PREFLIGHT } = await loadSample();
  return { kind: "ok", value: SAMPLE_PREFLIGHT };
}

/**
 * `?sample&feed`: feed the sample server log into the session console, one
 * line every 300 ms, round and round, so the live log panels can be watched
 * following and pausing. Nothing happens without `feed`.
 */
export async function sampleFeed(receive: (line: OutputLine) => void): Promise<void> {
  if (!loadSample || !new URLSearchParams(window.location.search).has("feed")) return;
  const { SAMPLE_SESSIONS, sampleFile } = await loadSample();
  const text = sampleFile(SAMPLE_SESSIONS.sessions[0]!.id, "server.stderr.log")?.text ?? "";
  const lines = text.split("\n").filter(Boolean);
  let i = 0;
  setInterval(() => {
    receive({ kind: "text", text: lines[i % lines.length]! });
    i += 1;
  }, 300);
}
