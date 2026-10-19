// Sample records for the tests and for the browser preview's `?sample`
// mode. Every record here is made up and typed against the generated
// contract types; src/lib/state/sample.test.ts validates them against
// schemas/ so they cannot drift from the server's shapes. The desktop
// window never shows them: it reads the bundled server, and a screen whose
// capability is missing shows "Coming later".

import type {
  Car,
  Preflight,
  Profile,
  ProfileList,
  SessionFileText,
  SessionList,
  VersionReport,
} from "$lib/api/types";

export const SAMPLE_VERSION: VersionReport = {
  version: 1,
  program: "Afterhours",
  program_version: "0.0.0",
  release: "development",
  revision: null,
  launcher_version: "0.0.0",
  os: "windows",
  game_launch: true,
  records: { profile: 1, "profile-list": 1, sessions: 1, status: 1, version: 1 },
  capabilities: ["profile", "sessions", "events"],
};

const ACCOUNT = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
const SAVE_PATH = `C:\\Users\\Driver\\AppData\\Local\\Afterhours2015\\artifacts\\account\\${ACCOUNT}.sqlite`;

/** A car with its localized `name` (null when it did not resolve) and blueprint `label`. */
function car(
  id: string,
  name: string | null,
  label: string | null,
  location: Car["location"],
  slot: number | null,
  installed: number,
  spare: number,
  price: number,
): Car {
  return {
    id,
    definition: id.padStart(32, "a").slice(0, 32),
    name,
    names: name ? { long: name, medium: name, short: name.replace(/ \(\d{4}\)$/, "") } : null,
    vehicle: label
      ? {
          blueprint: `Vehicles/${label.replace(/ /g, "_")}`,
          asset_name: `Car_${label.replace(/ /g, "_")}`,
          label,
        }
      : null,
    location,
    slot,
    installed_parts: installed,
    spare_parts: spare,
    sale_price: price,
    item_records: 1 + installed + spare,
  };
}

export const SAMPLE_CARS: Car[] = [
  car(
    "1000001",
    "NISSAN Skyline GT-R KPGC10 (1971)",
    "Nissan GTRSkylineKPGC10 1971",
    "active",
    0,
    24,
    3,
    38_500,
  ),
  // A name that did not resolve: the screens fall back to the blueprint label.
  car("1000002", null, "Honda CivicTypeR 2000", "garage", 1, 17, 0, 14_000),
  car("1000003", "SAMPLE Muscle GT (2015)", "Sample MuscleGT 2015", "garage", 2, 12, 1, 31_200),
  car("1000011", "SAMPLE Coupe (1989)", "Sample Coupe 1989", "warehouse", null, 9, 0, 62_000),
  car(
    "1000012",
    "SAMPLE Roadster (1994)",
    "Sample Roadster 1994",
    "warehouse",
    null,
    18,
    2,
    11_500,
  ),
  car("1000013", "SAMPLE Hatch (2006)", "Sample Hatch 2006", "warehouse", null, 4, 0, 3_200),
  // A definition the vehicle content does not list: no name, no blueprint.
  car("1000014", null, null, "warehouse", null, 0, 0, 0),
];

export const SAMPLE_PROFILE: Profile = {
  version: 1,
  account_id: ACCOUNT,
  active: true,
  identity: { display_name: "Driver", persona_id: "1000000000000000001", account_id: ACCOUNT },
  bank: { balance: 250_000, formatted: "$250,000" },
  reputation: {
    score: { value: 412_350, stored: true },
    stored_level: { value: 18, stored: true },
    categories: {
      speed: { value: 132_400, stored: true },
      style: { value: 96_250, stored: true },
      build: { value: 71_800, stored: true },
      crew: { value: 58_900, stored: true },
      outlaw: { value: 53_000, stored: true },
    },
    level: 18,
    current_threshold: 380_000,
    next_threshold: 450_000,
    maximum_level: 50,
  },
  tables: {
    RepValuesTable: {
      RepScore: { value: 412_350, stored: true },
      RepLevel: { value: 18, stored: true },
      BuildScore: { value: 71_800, stored: true },
      CrewScore: { value: 58_900, stored: true },
      OutlawScore: { value: 53_000, stored: true },
      SpeedScore: { value: 132_400, stored: true },
      StyleScore: { value: 96_250, stored: true },
    },
    PrestigeMedalTable: {
      BuildMedal: { value: 0, stored: true },
      CrewMedal: { value: 0, stored: true },
      OutlawMedal: { value: 0, stored: true },
      SpeedMedal: { value: 1, stored: true },
      StyleMedal: { value: 0, stored: true },
      FinalEventMedal: { value: 0, stored: false },
    },
    GameplayStatsTable: {
      DistanceDriven: { value: 1_284_021, stored: true },
      CashEarned: { value: 1_840_500, stored: true },
      NumberOfEventsCompleted: { value: 64, stored: true },
      LargestFineEscaped: { value: 0, stored: false },
      LargestFineBusted: { value: 0, stored: false },
      TotalTimePlayed: { value: 151_200, stored: true },
      FavoriteVehicleId: { value: 1_000_001, stored: true },
      TopSpeed: { value: 312, stored: true },
      DistanceDrifted: { value: 86_400, stored: true },
    },
    SpeedListStatsTable: {
      Started: { value: 23, stored: true },
      Finished: { value: 21, stored: true },
      P1: { value: 9, stored: true },
      P2: { value: 5, stored: true },
      P3: { value: 3, stored: true },
      P4: { value: 2, stored: true },
      P5: { value: 1, stored: true },
      P6: { value: 1, stored: true },
      P7: { value: 0, stored: true },
      P8: { value: 0, stored: true },
    },
    ProgressionStats: { IntroCompleted: { value: 1, stored: true } },
  },
  garage: {
    slots: [0, 1, 2, 3, 4].map((index) => {
      const owned = SAMPLE_CARS.find((c) => c.slot === index && c.location !== "warehouse");
      return {
        index,
        primary: index === 0,
        item: owned
          ? {
              id: owned.id,
              definition: owned.definition,
              class: "RaceVehicle",
              name: owned.name,
              names: owned.names,
              vehicle: owned.vehicle,
            }
          : null,
      };
    }),
    primary_vehicle: {
      id: SAMPLE_CARS[0]!.id,
      definition: SAMPLE_CARS[0]!.definition,
      class: "RaceVehicle",
      name: SAMPLE_CARS[0]!.name,
      names: SAMPLE_CARS[0]!.names,
      vehicle: SAMPLE_CARS[0]!.vehicle,
    },
  },
  cars: SAMPLE_CARS,
  car_summary: {
    garage_used: 3,
    garage_slots: 5,
    warehouse_used: 4,
    warehouse_limit: 100,
    total_sale_value: SAMPLE_CARS.reduce((sum, c) => sum + c.sale_price, 0),
  },
  counts: {
    items: 533,
    items_by_class: { RaceVehicle: 7, Wrap: 3 },
    unresolved_items: 0,
    livery_records: 3,
    livery_bytes: 421_888,
    collectibles: 37,
    activities: 12,
    points_of_interest: 61,
  },
  save: {
    path: SAVE_PATH,
    schema_version: 5,
    generation: 1284,
    updated_at_ms: 1_792_438_812_000,
    updated_at_utc: "2026-10-19T19:40:12Z",
    file_bytes: 2_516_582,
    domains: {
      identity: { revision: 1, bytes: 412 },
      entitlements: { revision: 3, bytes: 18_204 },
      kickback: { revision: 2, bytes: 96 },
      settings: { revision: 5, bytes: 2_048 },
    },
  },
  content: {
    directory: "C:\\Users\\Driver\\AppData\\Local\\Afterhours2015\\artifacts\\content\\sample",
    chosen_by: "current-session",
  },
  localization: {
    locale: "en_US",
    locale_from: "registry",
    game_directory: "C:\\Games\\Need for Speed",
    game_directory_from: "current-session",
    cars: 150,
  },
  warnings: [],
};

export const SAMPLE_PROFILE_LIST: ProfileList = {
  version: 1,
  accounts: [
    {
      account_id: ACCOUNT,
      active: true,
      display_name: "Driver",
      level: 18,
      stored_level: 18,
      score: 412_350,
      bank: { balance: 250_000, formatted: "$250,000" },
      updated_at_ms: 1_792_438_812_000,
      updated_at_utc: "2026-10-19T19:40:12Z",
      error: null,
    },
    {
      account_id: "1e2d3c4b5a69788796a5b4c3d2e1f00f",
      active: false,
      display_name: "Tester 2",
      level: 3,
      stored_level: 3,
      score: 12_400,
      bank: { balance: 12_500, formatted: "$12,500" },
      updated_at_ms: 1_792_100_000_000,
      updated_at_utc: "2026-10-15T21:46:40Z",
      error: null,
    },
    {
      account_id: "2d3c4b5a69788796a5b4c3d2e1f00f1e",
      active: false,
      display_name: null,
      level: null,
      stored_level: null,
      score: null,
      bank: null,
      updated_at_ms: null,
      updated_at_utc: null,
      error: "The save's schema is newer than this server reads.",
    },
  ],
  truncated: false,
  content: SAMPLE_PROFILE.content,
  warnings: [],
};

const DATA = "C:\\Users\\Driver\\AppData\\Local\\Afterhours2015";
const SESSION_A = "5ed19fb4c0a14d2e9b7f3a6c8d1e2f30";
const SESSION_B = "7a2b9c1d0e3f4a5b6c7d8e9f0a1b2c3d";

const SERVER_LOG = [
  "2026-10-18T08:18:59.657Z  INFO nfs_server::startup: road network read from the installation segments=8652",
  "2026-10-18T08:19:01.002Z  INFO nfs_server: listening address=127.0.0.1",
  "2026-10-18T08:19:03.361Z  INFO nfs_server::lsx: handshake accepted connection=1",
  '2026-10-18T08:19:40.999Z  WARN nfs_server::diagnostics: unsupported operation received service="lsx" connection=1 correlation=Some(16) route=Some("GetBlockList") route_overflow=false seen=1 suppressed=0',
  '2026-10-18T08:19:41.015Z  WARN nfs_server::diagnostics: unsupported operation received service="lsx" connection=1 correlation=Some(17) route=Some("QueryFriends") route_overflow=false seen=1 suppressed=0',
  '2026-10-18T08:19:41.875Z  WARN nfs_server::diagnostics: unsupported operation received service="lsx" connection=1 correlation=Some(18) route=Some("QueryImage") route_overflow=false seen=1 suppressed=0',
  "2026-10-18T08:19:49.316Z  INFO nfs_server::world: owned replication queued objects=12",
  "2026-10-18T08:19:49.402Z  INFO nfs_server::world: owned replication queued objects=9",
  "2026-10-18T08:19:49.511Z  INFO nfs_server::world: owned replication queued objects=14",
  "2026-10-18T08:20:12.402Z  INFO nfs_server::scoring: scoring flag rule=7 on=true",
  "2026-10-18T08:20:12.950Z  INFO nfs_server::scoring: scoring flag rule=7 on=false",
  '2026-10-18T08:21:37.880Z  INFO nfs_server::items: owned items reply committed request="purchase" items=1',
  "2026-10-18T08:22:05.114Z ERROR nfs_server::players: customization timer missed deadline=Some(250) late_ms=12",
  "2026-10-18T08:25:30.000Z  INFO nfs_server: stopped",
].join("\n");

export const SAMPLE_SESSIONS: SessionList = {
  version: 1,
  data_directory: DATA,
  current: SESSION_A,
  sessions: [
    {
      id: SESSION_A,
      current: true,
      directory: `${DATA}\\artifacts\\launcher\\${SESSION_A}`,
      action: "start",
      started_utc: "2026-10-18T08:18:41Z",
      updated_utc: "2026-10-18T08:25:31Z",
      ended_utc: "2026-10-18T08:25:31Z",
      state: "finished",
      message: "Game and server stopped; account data is preserved.",
      files: [
        { name: "game.stderr.log", bytes: 0, lines: 0, truncated: false },
        { name: "game.stdout.log", bytes: 68, lines: 2, truncated: false },
        { name: "prepare.stdout.json", bytes: 2_458, lines: 1, truncated: false },
        { name: "request.json", bytes: 312, lines: 1, truncated: false },
        { name: "server.stderr.log", bytes: SERVER_LOG.length + 1, lines: 14, truncated: false },
        { name: "server.stdout.jsonl", bytes: 1_536, lines: 3, truncated: false },
        { name: "status.json", bytes: 219, lines: 1, truncated: false },
      ],
      files_truncated: false,
      server_log: {
        lines: 14,
        partial_last_line: false,
        levels: { error: 1, warn: 3, info: 10, debug: 0, trace: 0, other: 0 },
        unsupported_total: 3,
        unsupported: [
          { service: "lsx", route: "GetBlockList", warnings: 1 },
          { service: "lsx", route: "QueryFriends", warnings: 1 },
          { service: "lsx", route: "QueryImage", warnings: 1 },
        ],
        unsupported_truncated: false,
      },
      runs_directory: `${DATA}\\artifacts\\runs\\${SESSION_A}`,
      runs_directory_exists: false,
      crash_dumps: [],
      warnings: [],
    },
    {
      id: SESSION_B,
      current: false,
      directory: `${DATA}\\artifacts\\launcher\\${SESSION_B}`,
      action: "serve",
      started_utc: "2026-10-17T20:02:10Z",
      updated_utc: "2026-10-17T20:03:02Z",
      ended_utc: "2026-10-17T20:03:02Z",
      state: "failed",
      message: "The server exited before it was ready.",
      files: [
        { name: "prepare.stdout.json", bytes: 2_301, lines: 1, truncated: false },
        { name: "request.json", bytes: 298, lines: 1, truncated: false },
        { name: "server.stderr.log", bytes: 0, lines: 0, truncated: false },
        { name: "status.json", bytes: 231, lines: 1, truncated: false },
      ],
      files_truncated: false,
      server_log: {
        lines: 0,
        partial_last_line: false,
        levels: { error: 0, warn: 0, info: 0, debug: 0, trace: 0, other: 0 },
        unsupported_total: 0,
        unsupported: [],
        unsupported_truncated: false,
      },
      runs_directory: `${DATA}\\artifacts\\runs\\${SESSION_B}`,
      runs_directory_exists: false,
      crash_dumps: [],
      warnings: [],
    },
  ],
  truncated: false,
  crash_dump_directory: {
    path: "C:\\Users\\Driver\\Documents\\Need For Speed\\Temp",
    exists: true,
  },
  ea_desktop_logs: {
    path: "C:\\Users\\Driver\\AppData\\Local\\Electronic Arts\\EA Desktop\\Logs",
    exists: true,
  },
  warnings: [],
};

/** File contents for the preview's log viewer, by session ID and name. */
export function sampleFile(id: string, name: string): SessionFileText | null {
  if (id !== SESSION_A) return null;
  const texts: Record<string, string> = {
    "server.stderr.log": `${SERVER_LOG}\n`,
    "game.stdout.log": "Qt: Untested Windows version 10.0 detected!\n",
    "status.json": JSON.stringify({
      version: 1,
      id: SESSION_A,
      utc: "2026-10-18T08:25:31Z",
      state: "finished",
      message: "Game and server stopped; account data is preserved.",
      worker_pid: 4242,
      game_pid: null,
      server_pid: null,
    }),
  };
  const text = texts[name];
  if (text === undefined) return null;
  return { name, bytes: text.length, text, truncated: false };
}

/** A passing `check --json`, for the first run in the preview. */
export const SAMPLE_PREFLIGHT: Preflight = {
  version: 1,
  game_directory: "C:\Games\Need for Speed",
  data_directory: DATA,
  server_path: "C:\Users\Driver\AppData\Local\Programs\Afterhours\Afterhours.exe",
  server_sha256: "0".repeat(64),
  game_sha256: "1".repeat(64),
  activation_sha256: null,
  registered_client_path: null,
  compatibility_name: "Sample",
  requires_administrator: false,
  machine_changes: [],
  directory_write_access: "writable",
};
