# Contributing

The launcher is a Tauri 2 desktop app: Rust in `src-tauri/`, Svelte 5 with
Vite and TypeScript in `src/`. It runs sessions through `nfs-afterhours` from
the [afterhours-2015](https://github.com/afterhours-crew/afterhours-2015)
repository and never touches the game or server itself.

## Setup

Install Rust (the version in `rust-toolchain.toml`), Node 24 and pnpm, plus
the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your
platform. Then:

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

On Windows start `pnpm tauri dev` from a plain terminal, not from inside an
IDE: the session supervisor refuses to run inside an existing process job.

## Checks

```sh
pnpm format:check
pnpm check
pnpm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

CI runs the same on Linux and Windows and compiles the app without bundling.

## Where things go

| Path                        | Owns                                                   |
| --------------------------- | ------------------------------------------------------ |
| `src-tauri/src/cli.rs`      | locating and running `nfs-afterhours`, event streaming |
| `src-tauri/src/settings.rs` | the settings file                                      |
| `src-tauri/src/detect.rs`   | guessing the game directory                            |
| `src/lib/api/`              | types mirroring the CLI's JSON, Tauri command wrappers |
| `src/lib/state/`            | view models: pure functions with tests                 |
| `src/lib/components/`       | design-system components                               |
| `src/lib/views/`            | the screens                                            |
| `design/`                   | tokens and the design rules                            |

## Licenses

MPL-2.0 for this repository. Dependencies: Tauri and its plugins (MIT or
Apache-2.0), Svelte and Vite (MIT), clap-free; fonts Saira Semi Condensed and
JetBrains Mono through fontsource (SIL OFL 1.1). Review a new dependency's
license before adding it.
