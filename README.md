# Afterhours 2015 launcher

The graphical launcher for [Afterhours 2015](https://github.com/afterhours-crew/afterhours-2015),
the community server for Need for Speed (2015). It is a Tauri 2 desktop app
with a Svelte frontend. It installs with its own copy of the server, the
single `Afterhours.exe` from an exact afterhours-2015 release, and updates
itself from this repository's GitHub releases. Nothing about the game, the
server or the safety rules lives here; this app is the Play button in front of
them.

**Preview stage.** The shell, the bundled server, the installer, the updater,
the release workflows and the screens are in place. Each screen reads the
bundled server through its JSON commands and shows "Coming later" for what
that server does not report: with v0.3.0, which reports no capabilities,
that is Profile, Cars, Save data and the Logs dashboard; World settings, Cops
and the Map wait for server work. No release has been published yet. See
[docs/ROADMAP.md](docs/ROADMAP.md).

## Run it

1. Install the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
   for your platform, Rust 1.98.1 (selected by `rust-toolchain.toml`), Node 24
   and pnpm.
2. In this repository:

   ```sh
   pnpm install --frozen-lockfile
   pnpm sidecar
   pnpm tauri dev
   ```

   `pnpm dev` alone opens the window in a browser for styling work. Nothing
   runs there; add `?sample` to the address (`http://localhost:1420/?sample`)
   to look at the screens with the made-up records in
   `src/lib/state/sample.ts`. A banner says so, and production builds leave
   that code out. `&hosting` adds a `serve` session without a game
   (`&hosting=game` with one playing in it), `&noplay` a server without
   `play`, `&portable` a launcher in the game folder and `&feed` a server
   log that keeps arriving.

   `pnpm sidecar` downloads the server release pinned in `server-pin.json`,
   checks its SHA-256 and places `Afterhours.exe` in `src-tauri/binaries/`.
   Windows builds refuse to compile without it. To run another server build
   while developing, set `AFTERHOURS_EXE` to it; release builds ignore that
   variable. On Linux and macOS there is no bundled server, so development
   builds always need `AFTERHOURS_EXE`.

   `AFTERHOURS_EXE` must name a single-executable `Afterhours` build: in an
   afterhours-2015 checkout, `cargo build -p nfs-afterhours-bundle` writes it
   to `target/debug/Afterhours.exe`. A standalone `nfs-afterhours` does not
   work here: without `--server`, which the launcher never passes, it looks
   for `nfs-server` next to itself, so the first run's file check fails with
   "No nfs-server executable next to this launcher".

3. The first run asks for the game folder, runs the server's read-only check
   and asks for a driver name. Then the garage opens. Play runs `start` on
   Windows and `serve` elsewhere.

   Host runs `serve`: the server without a game, shown as "Hosting · server
   running". Like every session it needs the game folder (`--game-dir`);
   on Windows the server also runs `start`'s game checks for `serve`, so
   a game can join later, and the launcher never passes `--server-only`. Play then starts the game in that session with `play` when
   `version --json` lists capability `play`; the session goes Starting →
   In game and back to hosting when the game closes. A server without
   `play` (v0.3.0) offers "Restart with game" instead, which stops the
   serve session and runs `start`. Stop while in game closes the game, then
   the server. The phase comes from the session's `action` and
   `game_running` (from its game process ID in older records):
   `sessionPhase` in `src/lib/state/launchbar.ts`.

`pnpm bundle` builds the per-user NSIS installer without updater artifacts
(those need the signing key; see [RELEASING.md](RELEASING.md)).

### A copy in the game folder

The launcher executable and its bundled `Afterhours.exe` can also be copied
into the game folder, next to `NFS16.exe`, the way the terminal
`Afterhours.exe` is placed. That copy uses the game it sits in: the first
run skips "Find your game" and goes straight to the file check, and
Settings shows the folder without offering another one (run the launcher
from somewhere else to pick a different install). Its own folder is tried
first, then the usual install places. The launcher only reads the game
folder: its settings, the data folder and logs stay where they always are.
An installed launcher (per user, under `%LOCALAPPDATA%`) never sits next to
the game and keeps the usual first run. The decision is
`src-tauri/src/detect.rs` (`game_folder`).

## How it works

```text
window (Svelte)  --invoke-->  src-tauri (Rust)  --spawn-->  Afterhours.exe  --spawn-->  Afterhours.exe supervise
                 <--events--                   <--stdout--  (bundled, pinned)          --> server role, NFS16.exe
```

The Rust side runs the bundled server and reports what it says. `check`,
`status`, `stop` and `play` run with `--json` within a deadline and their object
comes back to the window, and so do the read-only `profile`,
`profile --list` and `sessions` behind Profile and Logs, asked for only when
`version --json` lists their capability. The log viewer reads one named file
of one session folder (`reads.rs`), bounded at the server's 4 MB log limit
and without following links. A session is the server's own `setup`, `serve` or
`start` command running as a windowless child; its console lines arrive as
`session-output` events, `status --json` is polled into `session-status`
events, and its exit into `session-exit`. The supervisor is a separate
process, exactly as it is for a terminal user. Because the session writes to
pipes the window owns, the window will not close while its session runs.

The updater (`tauri-plugin-updater`) checks this repository's
`releases/latest/download/latest.json`. Its decisions are pure functions in
`src/lib/state/updates.ts`: never install while any session runs, copy the
saves before an update that changes the bundled server, never offer a
downgrade, and stay quiet offline. The rules are in
[docs/ROADMAP.md](docs/ROADMAP.md#updater-rules).

The types for the server's JSON are generated from the JSON Schemas in
`schemas/` (`pnpm types`), and CI runs the pinned executable's JSON commands
against those schemas (`pnpm contract`).

## Repository layout

| Path                 | What                                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server-pin.json`    | the bundled server: release tag and SHA-256s                                                                                                                                                                           |
| `schemas/`           | JSON Schemas of the server's `--json` output                                                                                                                                                                           |
| `src/`               | Svelte app: `App.svelte`, `lib/api` (Tauri commands, generated types), `lib/state` (routes, update rules, view models, stores), `lib/components`, `lib/views`                                                          |
| `src-tauri/`         | Rust: `pin.rs`, `server.rs` (which executable), `cli.rs` (runs it, streams events), `data.rs` (session records, save backups), `reads.rs` (profile, sessions, session files), `updates.rs`, `settings.rs`, `detect.rs` |
| `scripts/`           | `server-pin.mjs` (fetch, verify, bump), `gen-types.mjs`, `contract.mjs`, `versions.mjs`, `updater-manifest.mjs`, `tokens.mjs`                                                                                          |
| `design/`            | `tokens.json` from the design system, the design rules, the app icon source                                                                                                                                            |
| `.github/workflows/` | `ci.yml`, `pin-bump.yml` (daily server check), `release.yml` (`v*` tags)                                                                                                                                               |

## Checks

```sh
pnpm format:check && pnpm versions && pnpm check && pnpm test
pnpm sidecar && pnpm contract
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

CI runs these on Linux and Windows, compiles the app, runs the contract check
and builds the Windows installer as an unsigned artifact. See
[CONTRIBUTING.md](CONTRIBUTING.md), [RELEASING.md](RELEASING.md) and
[AGENTS.md](AGENTS.md).

## License

[MPL-2.0](LICENSE). The bundled server is MPL-2.0 too; its license and
third-party notices are installed beside it in `afterhours-server/`. Font:
DM Sans (`@fontsource/dm-sans` 5.3.0) under the SIL Open Font License 1.1,
vendored through fontsource. Icons: [Tabler Icons](https://tabler.io/icons)
(`@tabler/icons-svelte` 3.49.0, MIT), compiled into the app, so they work
offline.
