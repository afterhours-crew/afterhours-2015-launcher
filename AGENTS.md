# Project instructions

This repository is the graphical launcher for Afterhours 2015. The server,
the command-line launcher and every safety rule about the game live in
`afterhours-crew/afterhours-2015`; this app bundles that repository's
`Afterhours.exe` at the exact release pinned in `server-pin.json`, drives its
command line and renders what it reports. Do not reimplement path checks,
digests, process ownership or routing here. Read `docs/ROADMAP.md` for the
plan and the updater rules.

Read README.md first. Commit as `0x20F <0x20fa@gmail.com>`, with no
co-author trailers and no references to AI tools in commits, pull requests or
repository text. Work on a feature branch, push checkpoint commits to it, and
open a pull request when the item is complete, tested and documented.

Dependencies are pinned to exact versions in `package.json` and
`src-tauri/Cargo.toml`, with `pnpm-lock.yaml` and `Cargo.lock` committed.
Add a dependency deliberately, note its license, and keep Tauri plugins to
the ones actually used. No telemetry. The only network call the app makes on
its own is the update check (Settings → Updates; Off stops it); everything
else happens when the user asks. Fonts are vendored; the app renders offline.

The server moves only through `scripts/server-pin.mjs bump` (or the pin-bump
workflow): never edit `server-pin.json` to match a file, and never commit
`src-tauri/binaries/`. Types in `src/lib/api/generated` come from `schemas/`
through `pnpm types`; never edit them. Never generate or commit an updater
private key; RELEASING.md describes the owner's key and secrets.

Design tokens come from `design/tokens.json`; regenerate
`src/lib/styles/tokens.css` with `pnpm tokens` and never hand-edit it.
Follow `design/README.md` for how the screens should look and read.

Before pushing: `pnpm format:check`, `pnpm versions`, `pnpm check`,
`pnpm test`, `pnpm contract`, and in `src-tauri`: `cargo fmt --check`,
`cargo clippy --all-targets -- -D warnings`, `cargo test`. State exactly what
you ran against a real game and server; passing these does not establish
that the game launches or that an update installs.
