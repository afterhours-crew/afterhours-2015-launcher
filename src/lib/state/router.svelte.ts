// The current screen, kept in the address hash so links and the browser
// preview open any screen directly (`#/settings/about`).

import {
  HOME,
  formatRoute,
  parseRoute,
  type Route,
  type SettingsSection,
  type View,
} from "./routes";

export class Router {
  route = $state<Route>(HOME);

  constructor() {
    if (typeof window === "undefined") return;
    this.route = parseRoute(window.location.hash);
    window.addEventListener("hashchange", () => {
      this.route = parseRoute(window.location.hash);
    });
  }

  go(view: View, section: SettingsSection | null = null): void {
    const next: Route = {
      view,
      section: view === "settings" ? (section ?? "general") : null,
      firstRun: false,
    };
    this.route = next;
    if (typeof window !== "undefined") window.location.hash = formatRoute(next);
  }
}

export const router = new Router();
