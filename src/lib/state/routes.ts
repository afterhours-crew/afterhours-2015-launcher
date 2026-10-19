// The window's screens and their addresses. Hash routes (`#/profile/cars`,
// `#/logs/viewer`, `#/settings/about`) keep links working in the desktop window and in the
// browser preview.

export const VIEWS = ["garage", "profile", "world", "map", "host", "logs", "settings"] as const;
export type View = (typeof VIEWS)[number];

/** Views with sub-views; the first one is where the view opens. */
export const SECTIONS = {
  profile: ["overview", "cars", "save-data", "edit-driver"],
  logs: ["sessions", "viewer"],
  settings: ["general", "updates", "about"],
} as const;
export type ProfileSection = (typeof SECTIONS.profile)[number];
export type LogsSection = (typeof SECTIONS.logs)[number];
export type SettingsSection = (typeof SECTIONS.settings)[number];
export type Section = ProfileSection | LogsSection | SettingsSection;
type Sectioned = keyof typeof SECTIONS;

export interface Route {
  view: View;
  /** Profile, Logs and Settings only. */
  section: Section | null;
  /** `#/first-run`: show the first run wizard (browser preview and tests). */
  firstRun: boolean;
}

export interface NavItem {
  id: View;
  label: string;
  /** The screen is coming in a future update: its tab carries the clock mark. */
  upcoming?: boolean;
}

export const NAV: NavItem[] = [
  { id: "garage", label: "Garage" },
  { id: "profile", label: "Profile" },
  { id: "world", label: "World" },
  { id: "map", label: "Map", upcoming: true },
  { id: "host", label: "Host" },
  { id: "logs", label: "Logs" },
  { id: "settings", label: "Settings" },
];

export const SECTION_LABELS: Record<Section, string> = {
  overview: "Overview",
  cars: "Cars",
  "save-data": "Save data",
  "edit-driver": "Edit driver",
  sessions: "Sessions",
  viewer: "Log viewer",
  general: "General",
  updates: "Updates",
  about: "About",
};

export const HOME: Route = { view: "garage", section: null, firstRun: false };

function isView(text: string | undefined): text is View {
  return (VIEWS as readonly string[]).includes(text ?? "");
}

function hasSections(view: View): view is Sectioned {
  return view in SECTIONS;
}

/** The section to show for `view`: `wanted` if it belongs there, else the first. */
export function sectionFor(view: View, wanted: string | null | undefined): Section | null {
  if (!hasSections(view)) return null;
  const sections: readonly Section[] = SECTIONS[view];
  return sections.find((s) => s === wanted) ?? sections[0]!;
}

/** `#/settings/updates` → settings, updates. Anything unknown is the garage. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "first-run") return { ...HOME, firstRun: true };
  if (!isView(parts[0])) return HOME;
  return { view: parts[0], section: sectionFor(parts[0], parts[1]), firstRun: false };
}

export function formatRoute(route: Route): string {
  if (route.firstRun) return "#/first-run";
  const section = sectionFor(route.view, route.section);
  return section ? `#/${route.view}/${section}` : `#/${route.view}`;
}
