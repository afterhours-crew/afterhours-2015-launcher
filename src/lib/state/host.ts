// The Host screen's model: the local server on its own, without the game.
// Play in the launch bar runs `start` (server and game) on Windows; Host
// runs `serve`, the server alone, for checking it or for other tools.

import type { Status } from "$lib/api/types";
import { isLive } from "./launchbar";

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

export function hostModel(input: HostInput): HostModel {
  const state = input.status?.state;
  if (isLive(state) && input.status) {
    const ready = state === "ready";
    return {
      state: ready ? "Running · this PC only" : `${state![0]!.toUpperCase()}${state!.slice(1)}…`,
      dot: ready ? "ready" : "info",
      button: { label: "Stop", action: ready ? "stop" : null, disabled: !ready },
      reason: ready ? null : "Wait until the session is ready to stop it.",
    };
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
