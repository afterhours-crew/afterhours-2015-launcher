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

The story timeline is being developed against the server branch
`codex/prologue-story`: `story.schema.json` and `version.schema.json` come
from that branch's generated schemas, formatted by Prettier. The release pin
stays unchanged until this contract ships. The pinned server has no `story`
capability and displays the usual coming note; a development `AFTERHOURS_EXE`
build exercises the story view. Checkpoint apply remains disabled until the
runtime supports starting from those boundaries. `story-preview.schema.json`,
`story-apply.schema.json` and `version.schema.json` now come unchanged
(formatted by Prettier) from `feature/story-starter` (commits 8c0e737 and
ca6eb2b, stacked on `codex/prologue-story`): the preview's `starters` and
`starter`, the starters' pictures with `car_images`, the applied `starter`
and the `story-starter` capability, for the first-car pick when a skip
passes the car choice.

**Ahead of the next release:** `map-images.schema.json` is new, copied unchanged
from afterhours-2015 `feature/map-images` (pull request #158), which the Map screen
is built against. `event.schema.json` adds the `map-feed` event, copied unchanged
(formatted by Prettier) from afterhours-2015 `feature/map-feed` (pull request #160,
commit ce9a456, stacked on #158), which the Map's markers are built against.
`api.schema.json` and `api-error.schema.json` are new and `version.schema.json`
lists the `map-images`, `map-feed` and `api` capabilities; the first two come
unchanged (formatted by Prettier) from afterhours-2015 `feature/server-api` (pull
request #164, commit 9bfa9d5, stacked on #160), which the session API connection
is built against; its `event.schema.json` is identical to #160's.
`version.schema.json` comes unchanged (formatted by Prettier) from
`feature/api-settings-profile` (pull request #166, commit 5827de8, stacked on
#164), whose `api` capability also names the settings and profile routes; every
other schema there is identical to #164's. `api.schema.json` now comes
unchanged (formatted by Prettier) from `feature/listen-address` (pull request
#175, commit 5e3ffe0, stacked on #169 and #166): its `token` is kept across
sessions. The pin bump to
the release that carries them replaces them with the released files, which must
be identical. Until then the pinned v0.4.1 reports none of `map-images`,
`map-feed` and `api`, so the Map screen shows its note, sessions use `--events`,
and the contract check skips the `map-images`, `serve --api` and `api` cases.

Before v0.4.0 this folder held hand-made stand-ins for the server branches
that introduced the JSON contract, plus `status-legacy.schema.json` for
v0.3.0's older `status --json` shape. The app still reads that shape
(`src/lib/state/status.ts`) but no longer generates a type for it, and the
contract test for it skips without the schema.

The contract check cannot exercise `check.schema.json` on CI: a passing
`check` needs the installed game. It does check that `check` refuses a
folder without the game. `profile`, `recover` and `session-status` need a
save or a session and are not exercised either.
