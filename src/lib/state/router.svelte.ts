// The current screen, kept in the address hash so links and the browser
// preview open any screen directly (`#/profile/cars`).

import {
  HOME,
  formatRoute,
  parseRoute,
  sectionFor,
  type Route,
  type Section,
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

  go(view: View, section: Section | null = null): void {
    const next: Route = { view, section: sectionFor(view, section), firstRun: false };
    this.route = next;
    if (typeof window !== "undefined") window.location.hash = formatRoute(next);
  }
}

export const router = new Router();
