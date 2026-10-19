// The browser preview's sample mode. `pnpm dev` opened with `?sample` in
// the address reads the made-up records in ./sample, so the screens can be
// looked at without a server; a banner says so. Development builds only:
// `import.meta.env.DEV` is false in production builds, so this code and
// ./sample are left out of them.

import { inTauri } from "$lib/api/tauri";
import type { AppInfo, CliResult } from "$lib/api/types";

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
      capabilities: [...SAMPLE_VERSION.capabilities],
      error: null,
    },
    data_dir: "C:\Users\Driver\AppData\Local\Afterhours2015",
    updater: { endpoint: null, configured: false },
    debug_build: true,
  };
}

/** A passing check, so the preview's first run reaches its last step. */
export async function sampleCheck(): Promise<CliResult> {
  if (!loadSample) throw new Error("Sample records exist in development builds only.");
  const { SAMPLE_PREFLIGHT } = await loadSample();
  return { kind: "ok", value: SAMPLE_PREFLIGHT };
}
