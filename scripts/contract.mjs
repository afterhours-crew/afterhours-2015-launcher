// Runs the pinned Afterhours.exe's JSON commands against temporary data
// folders and validates what they print against schemas/.
//
//   node scripts/contract.mjs            the placed sidecar (pnpm sidecar), checked against the pin
//   AFTERHOURS_EXE=<path> node scripts/contract.mjs
//                                         another build, for working on the contract itself
//
// No game is needed or touched: every case uses a fresh temporary data
// folder, and `check` gets an empty stand-in game folder it must refuse.
// Session records are seeded in the server's documented formats so `status`
// reports real records, including the `interrupted` state it derives.
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

function validatorFor(schema) {
  const dialect = String(schema.$schema ?? "");
  const options = { allErrors: true, allowUnionTypes: true, strict: false };
  const Class = dialect.includes("2020-12") ? Ajv2020 : dialect.includes("2019-09") ? Ajv2019 : Ajv;
  return new Class(options).compile(schema);
}

const schemaDir = join(root, "schemas");
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

function parse(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`stdout is not one JSON object: ${stdout.slice(0, 200)}`);
  }
}

function validate(schema, value) {
  const check = validators.get(schema);
  if (!check) throw new Error(`schemas/${schema}.schema.json is missing.`);
  if (!check(value)) throw new Error(`${schema} schema: ${JSON.stringify(check.errors)}`);
}

const fakeGame = join(scratch, "not-a-game");
mkdirSync(fakeGame, { recursive: true });

const cases = [
  {
    name: "--version names the pinned release",
    run: () => {
      const out = run(["--version"]);
      if (out.code !== 0) throw new Error(`exit ${out.code}: ${out.stderr}`);
      const match = /^Afterhours \S+ \((\S+) \/ ([0-9a-f]{40})\)$/.exec(out.stdout);
      if (!match) throw new Error(`unexpected version line: ${out.stdout}`);
      if (!override && match[1] !== pin.tag)
        throw new Error(`reports ${match[1]}, pinned ${pin.tag}`);
      return out.stdout;
    },
  },
  {
    name: "status --json before any session",
    schema: "status",
    run: () => {
      const out = run(["status", "--json", "--data-dir", dataDir("empty")]);
      if (out.code !== 0) throw new Error(`exit ${out.code}: ${out.stderr}`);
      const value = parse(out.stdout);
      validate("status", value);
      if (value.state !== "none") throw new Error(`state ${value.state}, expected none`);
      return out.stdout;
    },
  },
  {
    name: "status --json of a finished session",
    schema: "status",
    run: () => {
      const dir = dataDir("finished", { state: "finished" });
      const out = run(["--json", "--data-dir", dir, "status"]);
      if (out.code !== 0) throw new Error(`exit ${out.code}: ${out.stderr}`);
      const value = parse(out.stdout);
      validate("status", value);
      if (value.state !== "finished" || value.id !== ID) throw new Error(out.stdout);
      return `state ${value.state}`;
    },
  },
  {
    name: "status --json derives interrupted when the lock is missing",
    schema: "status",
    run: () => {
      const out = run(["status", "--json", "--data-dir", dataDir("no-lock", { state: "ready" })]);
      if (out.code !== 0) throw new Error(`exit ${out.code}: ${out.stderr}`);
      const value = parse(out.stdout);
      validate("status", value);
      if (value.state !== "interrupted") throw new Error(`state ${value.state}`);
      return `state ${value.state}`;
    },
  },
  {
    name: "status --json derives interrupted when nobody holds the lock",
    schema: "status",
    run: () => {
      const dir = dataDir("free-lock", { state: "starting", lockFile: true });
      const out = run(["status", "--json", "--data-dir", dir]);
      if (out.code !== 0) throw new Error(`exit ${out.code}: ${out.stderr}`);
      const value = parse(out.stdout);
      validate("status", value);
      if (value.state !== "interrupted") throw new Error(`state ${value.state}`);
      return `state ${value.state}`;
    },
  },
  {
    name: "stop --json with nothing to stop exits 4",
    run: () => {
      const out = run(["stop", "--json", "--data-dir", dataDir("stop-empty")]);
      if (out.code !== 4) throw new Error(`exit ${out.code}, expected 4: ${out.stderr}`);
      if (out.stdout) throw new Error(`printed ${out.stdout} on refusal`);
      return out.stderr.split(/\r?\n/).pop();
    },
  },
  {
    name: "check --json refuses a folder without the game",
    run: () => {
      const dir = dataDir("check");
      const out = run(["check", "--json", "--data-dir", dir, "--game-dir", fakeGame]);
      if (out.code !== 1) throw new Error(`exit ${out.code}, expected 1: ${out.stderr}`);
      if (out.stdout) throw new Error(`printed ${out.stdout} on refusal`);
      if (!out.stderr) throw new Error("refused without a message");
      if (readdirSync(dir).length !== 0) throw new Error("check wrote into the data folder");
      return out.stderr.split(/\r?\n/).pop();
    },
  },
];

let failed = 0;
console.log(`Contract check: ${exe}${override ? " (AFTERHOURS_EXE)" : ` (${pin.tag})`}`);
for (const testCase of cases) {
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
    console.log(
      `  note  schemas/${schema}.schema.json is not exercised: its output needs the game.`,
    );
  }
}
rmSync(scratch, { recursive: true, force: true });
if (failed > 0) {
  console.log(`${failed} of ${cases.length} cases failed.`);
  process.exit(1);
}
console.log(`All ${cases.length} cases passed.`);
