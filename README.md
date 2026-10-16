# Afterhours 2015 launcher

The graphical launcher for [Afterhours 2015](https://github.com/afterhours-crew/afterhours-2015),
the community server for Need for Speed (2015). It is a Tauri 2 desktop app
with a Svelte frontend that drives `nfs-afterhours`, the command-line launcher
from the server repository. Nothing about the game, the server or the safety
rules lives here; this app is the Play button in front of them.

**Development build.** Nothing is shipped yet: no installer, no bundled
server, no signing. You build the server repository yourself and point this
app at that build. The Rust launcher's live run on the real installation is
still pending in the server repository, so `start` here carries the same
status.

## Run it

1. Build the server and the command-line launcher in an afterhours-2015
   checkout, following its `docs/LOCAL-LAUNCHER.md`:
   `cargo build --release -p nfs-server -p nfs-afterhours --locked`.
2. Install the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
   for your platform, Rust 1.98.1 (selected by `rust-toolchain.toml`), Node 24
   and pnpm.
3. In this repository:

   ```sh
   pnpm install --frozen-lockfile
   pnpm tauri dev
   ```

   On Windows start it from a plain terminal, not from inside an IDE: the
   session supervisor refuses to run inside an existing process job.

4. The first run asks for the build folder (`target/release` of the checkout),
   the game folder, runs the launcher's read-only check, and asks for a driver
   name. Then the garage opens. Play runs `start` on Windows and `serve`
   elsewhere; Host runs `serve` and shows the server log.

## How it works

```text
window (Svelte)  --invoke-->  src-tauri (Rust)  --spawn-->  nfs-afterhours  --spawn-->  nfs-afterhours supervise
                 <--events--                   <--stdout--                            --> nfs-server, NFS16.exe
```

The Rust side has one job: run the command-line launcher and report what it
says. `check`, `status` and `stop` run with `--json` and their object comes
back to the window. A session is the CLI's own `setup`, `serve` or `start`
command running as a child; its console lines arrive as `session-output`
events, `status --json` is polled into `session-status` events, and its exit
into `session-exit`. The supervisor is a separate process, exactly as it is
for a terminal user, so closing this window never kills a running game.

The frontend's decisions are pure functions in `src/lib/state/` with tests:
what the launch bar says in each session state, why Play is disabled, which
rows the file check shows. Components in `src/lib/components/` follow the
design system in `design/`; tokens are generated into CSS custom properties
and never hand-written.

Why not call the launcher's Rust crates directly? Because the session must
run in its own process on Windows (the job object with kill-on-close protects
a routed game, and a window joining it would kill the game when closed), and
because one implementation of the safety rules is better than two. The JSON
output of the CLI is the contract; a JSON event stream for `supervise` is
tracked in afterhours-2015 issue 86 and will replace the status polling.

## Repository layout

| Path                 | What                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`               | Svelte app: `App.svelte`, `lib/api` (CLI types and Tauri commands), `lib/state` (view models and the session store), `lib/components`, `lib/views` |
| `src-tauri/`         | Rust: `cli.rs` (runs the CLI, streams events), `settings.rs`, `detect.rs`, `tauri.conf.json`, capabilities                                         |
| `design/`            | `tokens.json` from the design system, the design rules, the app icon source                                                                        |
| `scripts/tokens.mjs` | generates `src/lib/styles/tokens.css`                                                                                                              |

## Checks

```sh
pnpm format:check && pnpm check && pnpm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

CI runs these on Linux and Windows and compiles the app without bundling.
See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## License

[MPL-2.0](LICENSE). Fonts: Saira Semi Condensed and JetBrains Mono under the
SIL Open Font License 1.1, vendored through fontsource.
