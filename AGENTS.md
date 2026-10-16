# Project instructions

This repository is the graphical launcher for Afterhours 2015. The server,
the command-line launcher (`nfs-afterhours`) and every safety rule about the
game live in `afterhours-crew/afterhours-2015`; this app only drives that
command line and renders what it reports. Do not reimplement path checks,
digests, process ownership or routing here.

Read README.md first. Commit as `0x20F <0x20fa@gmail.com>`, with no
co-author trailers and no references to AI tools in commits, pull requests or
repository text. Work on a feature branch, push checkpoint commits to it, and
open a pull request when the item is complete, tested and documented.

Dependencies are pinned to exact versions in `package.json` and
`src-tauri/Cargo.toml`, with `pnpm-lock.yaml` and `Cargo.lock` committed.
Add a dependency deliberately, note its license, and keep Tauri plugins to
the ones actually used. No telemetry, no network calls at run time other than
the ones the user asks for. Fonts are vendored; the app renders offline.

Design tokens come from `design/tokens.json`; regenerate
`src/lib/styles/tokens.css` with `pnpm tokens` and never hand-edit it.
Follow `design/README.md` for how the screens should look and read.

Before pushing: `pnpm format:check`, `pnpm check`, `pnpm test`, and in
`src-tauri`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
`cargo test`. State exactly what you ran against a real game and server;
passing these does not establish that the game launches.
