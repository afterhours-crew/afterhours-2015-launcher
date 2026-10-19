// Runs the pinned Afterhours.exe's JSON commands against temporary data
// folders and validates what they print against schemas/.
//
//   node scripts/contract.mjs                the placed sidecar (pnpm sidecar), checked against the pin
//   AFTERHOURS_EXE=<path> node scripts/contract.mjs [--schemas <dir>]
//                                            another build and its schemas, for work on the contract
//
// No game is needed or touched: every case uses a fresh temporary data
// folder, and `check` gets an empty stand-in game folder it must refuse.
// Session records are seeded in the server's documented formats so `status`
// reports real records, including the `interrupted` state it derives.
//
// Cases for `stop`, `version`, `sessions` and `profile --list` run when a
// schema of that name exists, so a pin bump that brings the contract v1
// schemas exercises them without edits here. The `play` and `car-images`
// cases run when the server reports that capability; they use an empty data
// folder, so there is no serve session to start a game in and no prepared
// content to read pictures from. `status` is checked against
// the schema of the contract the server speaks: v1's
// `{"version":1,"session":...}` (status.schema.json) when it answers
// `version --json`, else v0.3.0's `{"state":"none"}` or bare status
// (status-legacy.schema.json).
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import Ajv2019 from "ajv/dist/2019.js";
import Ajv2020 from "ajv/dist/2020.js";
import { PIN_FILE, parsePin, sha256, sidecarPath } from "./lib/pin.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pin = parsePin(readFileSync(join(root, PIN_FILE), "utf8"));
const override = process.env.AFTERHOURS_EXE;
const exe = override || sidecarPath(root, pin);
if (!override && sha256(readFileSync(exe)) !== pin.executable_sha256) {
  console.error(`${exe} does not match ${PIN_FILE}. Run pnpm sidecar.`);
  process.exit(1);
}
const at = process.argv.indexOf("--schemas");
const schemaDir = at >= 0 ? resolve(process.argv[at + 1] ?? "") : join(root, "schemas");

// The integer formats schemars writes for the server's Rust types. JSON
// numbers lose precision above 2^53, which is why the server prints IDs as
// strings; the 64-bit formats only check for a non-negative integer here.
const INTEGER_FORMATS = {
  int32: (n) => Number.isInteger(n) && n >= -(2 ** 31) && n < 2 ** 31,
  uint32: (n) => Number.isInteger(n) && n >= 0 && n < 2 ** 32,
  int64: (n) => Number.isInteger(n),
  uint64: (n) => Number.isInteger(n) && n >= 0,
  uint: (n) => Number.isInteger(n) && n >= 0,
};

function validatorFor(schema) {
  const dialect = String(schema.$schema ?? "");
  const options = { allErrors: true, allowUnionTypes: true, strict: false };
  const Class = dialect.includes("2020-12") ? Ajv2020 : dialect.includes("2019-09") ? Ajv2019 : Ajv;
  const ajv = new Class(options);
  for (const [name, validate] of Object.entries(INTEGER_FORMATS)) {
    ajv.addFormat(name, { type: "number", validate });
  }
  return ajv.compile(schema);
}

const validators = new Map(
  readdirSync(schemaDir)
    .filter((name) => name.endsWith(".schema.json"))
    .map((name) => [
      name.replace(/\.schema\.json$/, ""),
      validatorFor(JSON.parse(readFileSync(join(schemaDir, name), "utf8"))),
    ]),
);

const ID = "0123456789abcdef0123456789abcdef";
const scratch = mkdtempSync(join(tmpdir(), "afterhours-contract-"));

function dataDir(name, seed) {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  if (seed) {
    writeFileSync(join(dir, "current-session.json"), JSON.stringify({ version: 1, id: ID }));
    const session = join(dir, "artifacts", "launcher", ID);
    mkdirSync(session, { recursive: true });
    writeFileSync(
      join(session, "status.json"),
      JSON.stringify({
        version: 1,
        id: ID,
        utc: "2026-10-19T12:00:00Z",
        state: seed.state,
        message: "Seeded by scripts/contract.mjs.",
        worker_pid: 4242,
        game_pid: null,
        server_pid: 4243,
      }),
    );
    if (seed.lockFile) writeFileSync(join(dir, "launcher.lock"), "");
  }
  return dir;
}

function run(args) {
  const result = spawnSync(exe, args, {
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: "1" },
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return { code: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

/** Run a `--json` command that must succeed, and validate its object. */
function runJson(args, schema) {
  const out = run(args);
  if (out.code !== 0) throw new Error(`exit ${out.code}: ${out.stderr.split(/\r?\n/).pop()}`);
  let value;
  try {
    value = JSON.parse(out.stdout);
  } catch {
    throw new Error(`stdout is not one JSON object: ${out.stdout.slice(0, 200)}`);
  }
  const check = validators.get(schema);
  if (!check) throw new Error(`${schemaDir}/${schema}.schema.json is missing.`);
  if (!check(value)) throw new Error(`${schema} schema: ${JSON.stringify(check.errors)}`);
  return value;
}

/** The session in `status --json`, in either shape; `null` for none. */
function sessionOf(value) {
  if ("session" in value) return value.session;
  return value.state === "none" ? null : value;
}

function refusal(args, expectedCode) {
  const out = run(args);
  if (out.code !== expectedCode) {
    throw new Error(`exit ${out.code}, expected ${expectedCode}: ${out.stderr}`);
  }
  if (out.stdout) throw new Error(`printed ${out.stdout} on refusal`);
  if (!out.stderr) throw new Error("refused without a message");
  return out.stderr.split(/\r?\n/).pop();
}

// The server's contract decides which status schema applies. A contract v1
// server answers `version --json` and prints {"version":1,"session":...};
// v0.3.0 has no `version` command and prints {"state":"none"} or the bare
// status, checked against status-legacy.schema.json while that is vendored.
// A pin bump replaces schemas/ with the release's, whose status.schema.json
// is v1's, and drops the legacy one.
const versionOut = run(["version", "--json"]);
const speaksV1 = versionOut.code === 0;
/** What the server reports it can do; nothing before contract v1. */
const capabilities = speaksV1 ? (JSON.parse(versionOut.stdout).capabilities ?? []) : [];
const STATUS = !speaksV1 && validators.has("status-legacy") ? "status-legacy" : "status";

/** `status --json`, validated against the schema of the server's contract and its shape. */
function statusJson(args) {
  const value = runJson(args, STATUS);
  const v1Shape = "session" in value;
  if (v1Shape !== speaksV1) {
    const contract = speaksV1 ? "contract v1" : "v0.3.0";
    throw new Error(
      `a ${contract} server printed the other status shape: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

const fakeGame = join(scratch, "not-a-game");
mkdirSync(fakeGame, { recursive: true });

const cases = [
  {
    name: "--version names the pinned release",
    run: () => {
      const out = run(["--version"]);
      if (out.code !== 0) throw new Error(`exit ${out.code}: ${out.stderr}`);
      const match = /^Afterhours (\S+) \((\S+) \/ (.+)\)$/.exec(out.stdout);
      if (!match) throw new Error(`unexpected version line: ${out.stdout}`);
      if (!override && (match[2] !== pin.tag || !/^[0-9a-f]{40}$/.test(match[3]))) {
        throw new Error(`reports ${match[2]} / ${match[3]}, pinned ${pin.tag}`);
      }
      return out.stdout;
    },
  },
  {
    name: "status --json before any session",
    schema: STATUS,
    run: () => {
      const value = statusJson(["status", "--json", "--data-dir", dataDir("empty")]);
      if (sessionOf(value) !== null) throw new Error(`reports a session: ${JSON.stringify(value)}`);
      return JSON.stringify(value);
    },
  },
  {
    name: "status --json of a finished session",
    schema: STATUS,
    run: () => {
      const dir = dataDir("finished", { state: "finished" });
      const session = sessionOf(statusJson(["--json", "--data-dir", dir, "status"]));
      if (session?.state !== "finished" || session.id !== ID)
        throw new Error(JSON.stringify(session));
      return `state ${session.state}`;
    },
  },
  {
    name: "status --json derives interrupted when the lock is missing",
    schema: STATUS,
    run: () => {
      const dir = dataDir("no-lock", { state: "ready" });
      const session = sessionOf(statusJson(["status", "--json", "--data-dir", dir]));
      if (session?.state !== "interrupted") throw new Error(`state ${session?.state}`);
      return `state ${session.state}`;
    },
  },
  {
    name: "status --json derives interrupted when nobody holds the lock",
    schema: STATUS,
    run: () => {
      const dir = dataDir("free-lock", { state: "starting", lockFile: true });
      const session = sessionOf(statusJson(["status", "--json", "--data-dir", dir]));
      if (session?.state !== "interrupted") throw new Error(`state ${session?.state}`);
      return `state ${session.state}`;
    },
  },
  {
    name: "stop --json with nothing to stop exits 4",
    run: () => refusal(["stop", "--json", "--data-dir", dataDir("stop-empty")], 4),
  },
  {
    name: "stop --json of a finished session",
    schema: "stop",
    optional: true,
    run: () => {
      const dir = dataDir("stop-finished", { state: "finished" });
      const value = runJson(["stop", "--json", "--data-dir", dir], "stop");
      if (value.outcome !== "already-over") throw new Error(`outcome ${value.outcome}`);
      return `outcome ${value.outcome}`;
    },
  },
  {
    name: "play --json with no serve session exits 4",
    capability: "play",
    run: () => refusal(["play", "--json", "--data-dir", dataDir("play-empty")], 4),
  },
  {
    name: "car-images --json without prepared content exits 4 and writes nothing",
    capability: "car-images",
    run: () => {
      const dir = dataDir("car-images-empty");
      const line = refusal(["car-images", "--json", "--data-dir", dir, "--game-dir", fakeGame], 4);
      if (readdirSync(dir).length !== 0) throw new Error("car-images wrote into the data folder");
      return line;
    },
  },
  {
    name: "check --json refuses a folder without the game",
    run: () => {
      const dir = dataDir("check");
      const line = refusal(["check", "--json", "--data-dir", dir, "--game-dir", fakeGame], 1);
      if (readdirSync(dir).length !== 0) throw new Error("check wrote into the data folder");
      return line;
    },
  },
  {
    name: "version --json reports the release",
    schema: "version",
    optional: true,
    run: () => {
      const value = runJson(["version", "--json"], "version");
      if (!override && value.release !== pin.tag) {
        throw new Error(`reports ${value.release}, pinned ${pin.tag}`);
      }
      return `${value.release}, capabilities ${JSON.stringify(value.capabilities)}`;
    },
  },
  {
    name: "sessions --json lists none, then the seeded session",
    schema: "sessions",
    optional: true,
    run: () => {
      const empty = runJson(
        ["sessions", "--json", "--data-dir", dataDir("sessions-empty")],
        "sessions",
      );
      if (empty.sessions.length !== 0) throw new Error("lists sessions in an empty folder");
      const dir = dataDir("sessions-seeded", { state: "finished" });
      writeFileSync(
        join(dir, "artifacts", "launcher", ID, "request.json"),
        JSON.stringify({ version: 1, id: ID, action: "serve" }),
      );
      const seeded = runJson(["sessions", "--json", "--data-dir", dir], "sessions");
      return `${seeded.sessions.length} seeded session(s) listed`;
    },
  },
  {
    name: "profile --list --json in a folder without saves",
    schema: "profile-list",
    optional: true,
    run: () => {
      const value = runJson(
        ["profile", "--list", "--json", "--data-dir", dataDir("profiles")],
        "profile-list",
      );
      if (value.accounts.length !== 0) throw new Error("lists accounts in an empty folder");
      return "no accounts";
    },
  },
];

// Vendored schemas may run ahead of the pinned server: the contract v1
// schemas the screens are built against are vendored before a release
// carries them. Then a server without `version --json` (v0.3.0) skips the
// v1 cases, exactly as the app shows those screens as "Coming later". With
// a release's own schemas, or a build given through AFTERHOURS_EXE, every
// case whose schema exists runs.
const V1_ONLY = new Set(["version", "sessions", "profile-list"]);
const aheadOfServer = pin.schemas === "vendored" && !override && !speaksV1;

let failed = 0;
let ran = 0;
console.log(`Contract check: ${exe}${override ? " (AFTERHOURS_EXE)" : ` (${pin.tag})`}`);
console.log(`Schemas: ${schemaDir}`);
console.log(`Status contract: ${speaksV1 ? "v1" : "v0.3.0"} (${STATUS}.schema.json)`);
for (const testCase of cases) {
  if (testCase.optional && !validators.has(testCase.schema)) {
    console.log(`  skip  ${testCase.name}  (no ${testCase.schema} schema)`);
    continue;
  }
  if (testCase.capability && !capabilities.includes(testCase.capability)) {
    console.log(`  skip  ${testCase.name}  (the server does not report ${testCase.capability})`);
    continue;
  }
  if (testCase.optional && aheadOfServer && V1_ONLY.has(testCase.schema)) {
    console.log(`  skip  ${testCase.name}  (${pin.tag} predates contract v1)`);
    continue;
  }
  ran += 1;
  try {
    const detail = testCase.run();
    console.log(`  pass  ${testCase.name}  ${detail ?? ""}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${testCase.name}  ${error instanceof Error ? error.message : error}`);
  }
}
const exercised = new Set(cases.map((c) => c.schema).filter(Boolean));
for (const schema of validators.keys()) {
  if (!exercised.has(schema)) {
    const why = schema.startsWith("status")
      ? "it is the other status contract"
      : "needs the game or a session";
    console.log(`  note  ${schema}.schema.json is not exercised here (${why}).`);
  }
}
rmSync(scratch, { recursive: true, force: true });
if (failed > 0) {
  console.log(`${failed} of ${ran} cases failed.`);
  process.exit(1);
}
console.log(`All ${ran} cases passed.`);
