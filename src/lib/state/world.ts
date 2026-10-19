// The World screen (H5). Traffic density and roaming rivals are server
// settings that wait for the `world-settings` capability (track 3) and a
// command to read and change them; cops wait for research. None of that
// exists yet, so the view hides the controls and gives one note instead
// of showing them disabled.

/** The World view's one note. */
export function worldNote(capabilityReported: boolean): string {
  return capabilityReported
    ? "Your server reports world settings. This launcher connects to them in a later update; cops come after."
    : "Traffic, roaming rivals and cops arrive with a later server update.";
}
