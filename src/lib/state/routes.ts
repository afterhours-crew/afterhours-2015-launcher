// The window's screens and their addresses. Hash routes (`#/settings/about`)
// keep links working in the desktop window and in the browser preview.

export const VIEWS = ["garage", "profile", "world", "host", "logs", "settings"] as const;
export type View = (typeof VIEWS)[number];

export const SETTINGS_SECTIONS = ["general", "updates", "about"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export interface Route {
  view: View;
  /** Settings only. */
  section: SettingsSection | null;
  /** `#/first-run`: show the first run wizard (browser preview and tests). */
  firstRun: boolean;
}

export const NAV: { id: View; label: string }[] = [
  { id: "garage", label: "Garage" },
  { id: "profile", label: "Profile" },
  { id: "world", label: "World" },
  { id: "host", label: "Host" },
  { id: "logs", label: "Logs" },
  { id: "settings", label: "Settings" },
];

export const SECTION_LABELS: Record<SettingsSection, string> = {
  general: "General",
  updates: "Updates",
  about: "About",
};

export const HOME: Route = { view: "garage", section: null, firstRun: false };

function isView(text: string | undefined): text is View {
  return (VIEWS as readonly string[]).includes(text ?? "");
}

function isSection(text: string | undefined): text is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(text ?? "");
}

/** `#/settings/updates` → settings, updates. Anything unknown is the garage. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "first-run") return { ...HOME, firstRun: true };
  if (!isView(parts[0])) return HOME;
  if (parts[0] !== "settings") return { view: parts[0], section: null, firstRun: false };
  return { view: "settings", section: isSection(parts[1]) ? parts[1] : "general", firstRun: false };
}

export function formatRoute(route: Route): string {
  if (route.firstRun) return "#/first-run";
  if (route.view === "settings") return `#/settings/${route.section ?? "general"}`;
  return `#/${route.view}`;
}
