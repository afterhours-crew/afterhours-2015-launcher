# Schemas

JSON Schemas for what the bundled `Afterhours.exe` prints with `--json`.
`pnpm types` turns each `<name>.schema.json` into
`src/lib/api/generated/<name>.ts`, and `pnpm contract` validates the pinned
executable's real output against them.

**They come from the pinned server release.** `server-pin.json` records
`"schemas": "release"`: the pin bump to afterhours-2015 v0.4.0 (2026-10-20)
took every `schema/*.schema.json` from that release's
`Afterhours-contract.zip`, each checked against its `SHA256SUMS.txt`, and
replaced this folder with them. Each later pin bump does the same
(RELEASING.md). Do not edit these files by hand; fix a schema in the server
repository, where it is generated from the Rust types, and bump the pin.

Before v0.4.0 this folder held hand-made stand-ins for the server branches
that introduced the JSON contract, plus `status-legacy.schema.json` for
v0.3.0's older `status --json` shape. The app still reads that shape
(`src/lib/state/status.ts`) but no longer generates a type for it, and the
contract test for it skips without the schema.

The contract check cannot exercise `check.schema.json` on CI: a passing
`check` needs the installed game. It does check that `check` refuses a
folder without the game. `profile`, `recover` and `session-status` need a
save or a session and are not exercised either.
