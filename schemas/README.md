# Schemas

JSON Schemas for what the bundled `Afterhours.exe` prints with `--json`.
`pnpm types` turns each `<name>.schema.json` into
`src/lib/api/generated/<name>.ts`, and `pnpm contract` validates the pinned
executable's real output against them.

**These two are vendored stand-ins.** No server release publishes schemas
yet. Track 1b (afterhours-2015 branch `feature/launcher-contract`) generates
them from the server's Rust types and attaches `Afterhours-contract.zip`
(`schema/*.schema.json`) to each release. Until a pinned release has it:

| File                 | Describes                                               | Written from (afterhours-2015 v0.3.0)                                      |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `status.schema.json` | `status --json`: `{"state":"none"}` or a session status | `crates/launcher/src/records.rs`, `crates/launcher/src/commands/status.rs` |
| `check.schema.json`  | `check --json`: the preflight record                    | `crates/launcher/src/records.rs`                                           |

The names follow 1b's (`StatusReport`, `Status`, `State`, `Preflight`), so
the app compiles against either set. Contract v1 changes `status --json` to
`{"version":1,"session":...}`; the app and `pnpm contract` read both shapes.
Checked on 2026-10-19 against a local build of that branch:
`AFTERHOURS_EXE=<its Afterhours.exe> node scripts/contract.mjs --schemas <its crates/launcher/schema>`
passed all 11 cases, and the app type-checks against types generated from
those schemas.

`server-pin.json` records `"schemas": "vendored"` while that holds. The first
pin bump to a release that attaches schemas (`*.schema.json` assets or an
archive such as `Afterhours-contract.zip`, each listed in its
`SHA256SUMS.txt`) replaces this folder's schemas with the release's and
records `"schemas": "release"`. Do not edit schemas by hand after that; fix
them in the server repository.

The contract check cannot exercise `check.schema.json` on CI: a passing
`check` needs the installed game. It does check that `check` refuses a
folder without the game.
