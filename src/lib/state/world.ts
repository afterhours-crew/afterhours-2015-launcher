// The World screen's settings (A3). Traffic density, roaming rivals and
// presets are server settings that wait for the `world-settings`
// capability (track 3); no server reports it yet, and there is no command
// to read or change them, so the screens show the options without a
// current value. Cops wait for research and are always "Coming later".

export const TRAFFIC_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "light", label: "Light" },
  { value: "normal", label: "Normal" },
  { value: "busy", label: "Busy" },
] as const;

export const COP_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
] as const;

export const PRESETS = [
  {
    id: "empty",
    name: "Empty city",
    about: "No traffic, no rivals. Learn the roads.",
  },
  { id: "cruise", name: "Cruise", about: "Light traffic, rivals off." },
  {
    id: "night-run",
    name: "Night run",
    about: "Normal traffic, rivals on.",
  },
] as const;

/** What a world control says while it cannot show a value. */
export function worldWaits(capabilityReported: boolean): string {
  return capabilityReported
    ? "Your server reports world settings; the launcher connects to them in a later update."
    : "Your server doesn't offer this yet. It arrives with a server update.";
}
