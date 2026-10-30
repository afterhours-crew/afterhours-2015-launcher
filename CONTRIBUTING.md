# Contributing

The launcher is a Tauri 2 desktop app: Rust in `src-tauri/`, Svelte 5 with
Vite and TypeScript in `src/`. It runs sessions through the `Afterhours.exe`
published by the [afterhours-2015](https://github.com/afterhours-crew/afterhours-2015)
repository, bundled at the release pinned in `server-pin.json`, and never
touches the game or server itself.

## Setup

Install Rust (the version in `rust-toolchain.toml`), Node 24 and pnpm, plus
the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your
platform. Then:

```sh
pnpm install --frozen-lockfile
pnpm sidecar
pnpm tauri dev
```

`AFTERHOURS_EXE=<path>` makes a development build run another server build.
It must be an `Afterhours` bundle (`cargo build -p nfs-afterhours-bundle` in
afterhours-2015), not a standalone `nfs-afterhours`, which fails the first
run's file check because it looks for `nfs-server` next to itself.

## Checks

```sh
pnpm format:check
pnpm versions
pnpm check
pnpm test
pnpm contract
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

CI runs the same on Linux and Windows, compiles the app and builds the
unsigned Windows installer.

## Where things go

| Path                        | Owns                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| `server-pin.json`           | the one server release the launcher bundles                           |
| `src-tauri/src/pin.rs`      | reading the pin and hashing; also compiled into `build.rs`            |
| `src-tauri/src/server.rs`   | which `Afterhours.exe` runs (bundled, or `AFTERHOURS_EXE` in dev)     |
| `src-tauri/src/cli.rs`      | running it within deadlines, event streaming                          |
| `src-tauri/src/data.rs`     | reading the data folder's session records, copying saves aside        |
| `src-tauri/src/updates.rs`  | what the updater asks of the Rust side                                |
| `src-tauri/src/settings.rs` | the settings file                                                     |
| `src-tauri/src/detect.rs`   | guessing the game directory                                           |
| `schemas/`                  | JSON Schemas of the server's output; `pnpm types` generates from them |
| `src/lib/api/`              | Tauri command wrappers, `generated/` types (never edit those)         |
| `src/lib/state/`            | routes, update rules and view models as pure functions, plus stores   |
| `src/lib/components/`       | design-system components                                              |
| `src/lib/views/`            | the screens                                                           |
| `design/`                   | tokens and the design rules                                           |
| `scripts/`                  | pin, types, contract, version, release-manifest and release tooling   |

## Licenses

MPL-2.0 for this repository. Dependencies: Tauri and its plugins (dialog,
opener, process, updater, window-state; MIT or Apache-2.0), `sha2` (MIT or Apache-2.0),
Svelte and Vite (MIT), `@tabler/icons-svelte` (MIT), the DM Sans font through
fontsource (SIL OFL 1.1), and for tooling only `json-schema-to-typescript`,
`ajv` and `fflate` (MIT). The bundled server is MPL-2.0 and ships with
its own `LICENSE` and `THIRD-PARTY-NOTICES.txt`. Review a new dependency's
license before adding it.

Discord presence uses `discord-presence` 3.2.0 and Tokio 1.53.3 (MIT).
The added dependency graph includes `tokio-macros`, `cfg_aliases`, `nix`, and
`quork-proc` (MIT), plus `num-derive`, `paste`, `proc-macro-error2`,
`proc-macro-error-attr2`, `quork`, and `windows-sys` (MIT or Apache-2.0).
Their versions are recorded in `Cargo.lock`; no Discord SDK binary is bundled.
