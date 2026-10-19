# Afterhours 2015 launcher

The graphical launcher for [Afterhours 2015](https://github.com/afterhours-crew/afterhours-2015),
the community server for Need for Speed (2015). It is a Tauri 2 desktop app
with a Svelte frontend. It installs with its own copy of the server, the
single `Afterhours.exe` from an exact afterhours-2015 release, and updates
itself from this repository's GitHub releases. Nothing about the game, the
server or the safety rules lives here; this app is the Play button in front of
them.

**Foundation stage.** The shell, the bundled server, the installer, the
updater and the release workflows are in place; the screens other than
Settings are placeholders until they are built from the designs. No release
has been published yet. See [docs/ROADMAP.md](docs/ROADMAP.md).

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

   `pnpm sidecar` downloads the server release pinned in `server-pin.json`,
   checks its SHA-256 and places `Afterhours.exe` in `src-tauri/binaries/`.
   Windows builds refuse to compile without it. To run another server build
   while developing, set `AFTERHOURS_EXE` to it; release builds ignore that
   variable. On Linux and macOS there is no bundled server, so development
   builds need `AFTERHOURS_EXE` pointing at an `nfs-afterhours` build.

3. The first run asks for the game folder, runs the server's read-only check
   and asks for a driver name. Then the garage opens. Play runs `start` on
   Windows and `serve` elsewhere.

`pnpm bundle` builds the per-user NSIS installer without updater artifacts
(those need the signing key; see [RELEASING.md](RELEASING.md)).

## How it works

```text
window (Svelte)  --invoke-->  src-tauri (Rust)  --spawn-->  Afterhours.exe  --spawn-->  Afterhours.exe supervise
                 <--events--                   <--stdout--  (bundled, pinned)          --> server role, NFS16.exe
```

The Rust side runs the bundled server and reports what it says. `check`,
`status` and `stop` run with `--json` within a deadline and their object
comes back to the window. A session is the server's own `setup`, `serve` or
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

| Path                 | What                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server-pin.json`    | the bundled server: release tag and SHA-256s                                                                                                                            |
| `schemas/`           | JSON Schemas of the server's `--json` output                                                                                                                            |
| `src/`               | Svelte app: `App.svelte`, `lib/api` (Tauri commands, generated types), `lib/state` (routes, update rules, view models, stores), `lib/components`, `lib/views`           |
| `src-tauri/`         | Rust: `pin.rs`, `server.rs` (which executable), `cli.rs` (runs it, streams events), `data.rs` (session records, save backups), `updates.rs`, `settings.rs`, `detect.rs` |
| `scripts/`           | `server-pin.mjs` (fetch, verify, bump), `gen-types.mjs`, `contract.mjs`, `versions.mjs`, `updater-manifest.mjs`, `tokens.mjs`                                           |
| `design/`            | `tokens.json` from the design system, the design rules, the app icon source                                                                                             |
| `.github/workflows/` | `ci.yml`, `pin-bump.yml` (daily server check), `release.yml` (`v*` tags)                                                                                                |

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
third-party notices are installed beside it in `afterhours-server/`. Fonts:
Saira Semi Condensed and JetBrains Mono under the SIL Open Font License 1.1,
vendored through fontsource.
