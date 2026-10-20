// Generated from schemas/version.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * Optional features a build provides. Screens whose capability is absent
 * should say the feature is not available yet rather than fail.
 */
export type Capability =
  "profile" | "sessions" | "events" | "play" | "car-images" | "map-images" | "world-settings";

/**
 * `version --json`.
 */
export interface VersionReport {
  /**
   * Optional features this build provides.
   */
  capabilities: Capability[];
  /**
   * Whether `start` can launch and route the game on this platform.
   */
  game_launch: boolean;
  /**
   * Version of the launcher library (`nfs-afterhours`) inside it.
   */
  launcher_version: string;
  /**
   * Operating system: `windows`, `linux` or `macos`.
   */
  os: string;
  /**
   * `Afterhours` for the single-executable bundle, `nfs-afterhours` for
   * the standalone launcher.
   */
  program: string;
  /**
   * The program's package version, such as `0.3.0`. For `Afterhours`
   * this is the bundle version that release tags name.
   */
  program_version: string;
  /**
   * Current version of every record, by schema name.
   */
  records: {
    [k: string]: number | undefined;
  };
  /**
   * The release tag the program was built for, or `development`.
   */
  release: string;
  /**
   * The source commit the program was built from; `null` for builds
   * that did not record one.
   */
  revision: string | null;
  version: 1;
}
