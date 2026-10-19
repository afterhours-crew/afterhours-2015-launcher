// The Host screen's model: the local server on its own, without the game.
// Play in the launch bar runs `start` (server and game) on Windows; Host
// runs `serve`, the server alone, for checking it or for other tools. A
// game played in that serve session makes it "In game" here too; stopping
// then closes the game, then the server.

import type { Status } from "$lib/api/types";
import { sessionPhase } from "./launchbar";

export interface HostInput {
  serverReady: boolean;
  gameChosen: boolean;
  status: Status | null;
  /** The window started a session that has not exited yet. */
  running: boolean;
}

export interface HostModel {
  state: string;
  dot: "ready" | "warn" | "info" | null;
  button: { label: string; action: "serve" | "stop" | null; disabled: boolean };
  /** Why the button is disabled, in plain words. */
  reason: string | null;
}

const WAIT = "Wait until the session is ready to stop it.";

export function hostModel(input: HostInput): HostModel {
  const busy = (state: string, label = "Stop"): HostModel => ({
    state,
    dot: "info",
    button: { label, action: null, disabled: true },
    reason: WAIT,
  });
  switch (sessionPhase(input.status)) {
    case "hosting":
      return {
        state: "Hosting · server running",
        dot: "ready",
        button: { label: "Stop server", action: "stop", disabled: false },
        reason: null,
      };
    case "in-game":
      return {
        state: "In game",
        dot: "ready",
        button: { label: "Stop", action: "stop", disabled: false },
        reason: null,
      };
    case "preparing":
      return busy("Preparing…");
    case "starting":
      return busy("Starting the game…");
    case "activation":
      return { ...busy("Sign in, in the game…"), dot: "warn" };
    case "stopping":
      return {
        ...busy(input.status?.game_running ? "Closing the game…" : "Stopping…", "Stopping"),
        reason: null,
      };
    case "idle":
      break;
  }
  let reason: string | null = null;
  if (!input.serverReady) reason = "The bundled server is missing. See Settings › About.";
  else if (!input.gameChosen)
    reason = "Choose the game folder first: the server reads its content from it.";
  else if (input.running) reason = "Finishing the last session.";
  return {
    state: "Offline",
    dot: null,
    button: { label: "Serve", action: reason ? null : "serve", disabled: reason !== null },
    reason,
  };
}
