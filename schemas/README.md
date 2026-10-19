# Schemas

JSON Schemas for what the bundled `Afterhours.exe` prints with `--json`.
`pnpm types` turns each `<name>.schema.json` into
`src/lib/api/generated/<name>.ts`, and `pnpm contract` validates the pinned
executable's real output against them.

**These are vendored stand-ins.** No server release publishes schemas
yet. Track 1b (afterhours-2015 branch `feature/launcher-contract`) generates
them from the server's Rust types and attaches `Afterhours-contract.zip`
(`schema/*.schema.json`) to each release. Until a pinned release has it:

| File                        | Describes                                               | Written from (afterhours-2015 v0.3.0)                                      |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `status-legacy.schema.json` | `status --json`: `{"state":"none"}` or a session status | `crates/launcher/src/records.rs`, `crates/launcher/src/commands/status.rs` |
| `check.schema.json`         | `check --json`: the preflight record                    | `crates/launcher/src/records.rs`                                           |

The names follow 1b's (`StatusReport`, `Status`, `State`, `Preflight`), so
the app compiles against either set. Contract v1 changes `status --json` to
`{"version":1,"session":...}`: `status.schema.json` is 1b's v1 schema
(below), and `status-legacy.schema.json` keeps v0.3.0's shape while v0.3.0
is the pin. Both carry the same status record. The app reads either shape
into one `Status` (`src/lib/state/status.ts`), so the launch bar and the
header Play behave the same with both servers; it imports no type generated
from the legacy schema, so a pin bump that drops it still compiles.
`pnpm contract` checks `status` against the schema of the contract the
server speaks: v1 when it answers `version --json`, the legacy one
otherwise. Checked on 2026-10-19 against a local build of that branch:
`AFTERHOURS_EXE=<its Afterhours.exe> node scripts/contract.mjs --schemas <its crates/launcher/schema>`
passed all 11 cases, and the app type-checks against types generated from
those schemas.

The screens are built against five of 1b's contract v1 schemas, copied from
`crates/launcher/schema/` at afterhours-2015 `feature/launcher-car-names`
bec370d (2026-10-19). Prettier reformats their whitespace; the content is
unchanged. bec370d is `feature/launcher-contract` plus the game's localized
car names: each car and garage item has `name` and `names`, the profile has
`localization`, and the blueprint-label `display_name` is gone (the label
stays in `vehicle.label`).

| File                       | Describes                                                                 |
| -------------------------- | ------------------------------------------------------------------------- |
| `version.schema.json`      | `version --json`: release, records and capabilities                       |
| `profile.schema.json`      | `profile --json`: one save, with its named `cars`, `car_summary` and more |
| `profile-list.schema.json` | `profile --list --json`: every save in the data folder                    |
| `sessions.schema.json`     | `sessions --json`: session folders, their files and server logs           |
| `status.schema.json`       | `status --json`: `{"version":1,"session":<status or null>}`               |

The pinned v0.3.0 has none of the first four commands and reports no capabilities,
so with it the app shows Profile, Cars, Save data and Logs as "Coming
later", and `pnpm contract` skips their cases while the schemas are
vendored and the server predates them. Against a local build of bec370d
(`AFTERHOURS_EXE=<its Afterhours.exe> node scripts/contract.mjs`) all 10
cases pass with these schemas, `status` among them (7 against v0.3.0),
and that build's `profile --json` on a real save validates against
`profile.schema.json`.

`server-pin.json` records `"schemas": "vendored"` while that holds. The first
pin bump to a release that attaches schemas (`*.schema.json` assets or an
archive such as `Afterhours-contract.zip`, each listed in its
`SHA256SUMS.txt`) replaces this folder's schemas with the release's and
records `"schemas": "release"`. Do not edit schemas by hand after that; fix
them in the server repository.

The contract check cannot exercise `check.schema.json` on CI: a passing
`check` needs the installed game. It does check that `check` refuses a
folder without the game.
