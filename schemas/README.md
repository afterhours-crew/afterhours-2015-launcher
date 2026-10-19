# Schemas

JSON Schemas for what the bundled `Afterhours.exe` prints with `--json`.
`pnpm types` turns each `<name>.schema.json` into
`src/lib/api/generated/<name>.ts`, and `pnpm contract` validates the pinned
executable's real output against them.

**These two are vendored stand-ins.** The server repository does not publish
schemas yet; generating them from its Rust types is track 1b (afterhours-2015
branch `feature/launcher-contract`). Until then:

| File                 | Describes                                               | Written from (afterhours-2015 v0.3.0)                                      |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `status.schema.json` | `status --json`: `{"state":"none"}` or a session status | `crates/launcher/src/records.rs`, `crates/launcher/src/commands/status.rs` |
| `check.schema.json`  | `check --json`: the preflight record                    | `crates/launcher/src/records.rs`                                           |

`server-pin.json` records `"schemas": "vendored"` while that holds. The first
pin bump to a release that attaches `*.schema.json` assets (each listed in its
`SHA256SUMS.txt`, or inside a `*schemas*.zip` that is) replaces this folder's
schemas with the release's and records `"schemas": "release"`. Do not edit
schemas by hand after that; fix them in the server repository.

The contract check cannot exercise `check.schema.json` on CI: a passing
`check` needs the installed game. It does check that `check` refuses a
folder without the game.
