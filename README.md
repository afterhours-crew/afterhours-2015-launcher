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
bundled server through its JSON commands; what that server does not report
yet stays in view, marked "Coming in a future update" the same way on every
screen (design/README.md).
The pinned server, afterhours-2015 v0.4.1, reports every capability the
screens use (`profile`, `sessions`, `events`, `play`, `car-images`,
`world-settings`) except `map-images`, which the Map screen needs, and
`map-feed`, the live positions for its markers; the next server release
brings both. Cops and driver edits wait for server work.
Releases are published on this repository's Releases page. See
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
   log that keeps arriving. On the Map, sample cars lap a block of a made-up
   map four times a second; `&nomapfeed` is a server without `map-feed`.

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

   Server runs `serve` for this PC's own server: the server without a game,
   shown as "Hosting · server running". Like every session it needs the game folder (`--game-dir`);
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

### Without installing

Each release also has `Afterhours_<version>_x64-portable.zip`:
`Afterhours Launcher.exe`, the pinned `Afterhours.exe` beside it, the
licences and `portable.txt`. Its marker tells the launcher it was not
installed (`src-tauri/src/updates.rs`). That copy still checks for updates,
but cannot install them: it offers Ask me and Off, and **Download** opens the
new version's release page, after copying the saves when the bundled server
changes. `node scripts/portable-zip.mjs --exe <launcher.exe> --out <folder>`
builds it from a release build, on Windows, after `pnpm sidecar`. The
preview shows that copy with `?sample&noinstall`.

### A copy in the game folder

The launcher executable and its bundled `Afterhours.exe` can also be copied
into the game folder, next to `NFS16.exe`, the way the terminal
`Afterhours.exe` is placed; the no-install ZIP can be unzipped there. That copy uses the game it sits in: the first
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
`session-output` events, its statuses as `session-status` events, and its
exit as `session-exit`. The supervisor is a separate process, exactly as it
is for a terminal user.

**Your server, as any server** (roadmap track 8). When `version --json`
lists `api`, sessions run with `--api`: the supervisor serves the session
over HTTP on `127.0.0.1` (`GET /v1/status`, `/v1/events`, `POST /v1/stop`,
`/v1/play`, `GET`/`PUT /v1/settings`, `GET /v1/profile`), and the window
follows it there, as it would a server on another PC. `connection.rs` reads
the address and token from `api --json`, turns the event stream (statuses,
diagnostics, map frames) into the usual `session-output`, `session-status`
and `map-feed` events, reopens a stream that breaks while the session lives,
and sends Stop and Play to the API. While it follows a session, World reads
and saves traffic and rivals through `/v1/settings` (a save is the
`settings` record's `traffic_percent` and `rival_limit` as JSON; the running
server applies it within about a second), and Profile reads the selected
save through `/v1/profile`; the records are the same as the `settings` and
`profile` commands print. Without a followed session, or when its API cannot
answer (unreachable, or a server from before these routes), they run the
commands as before; another save than the selected one always comes from
`profile`. The
command's own output then holds only its `session` and `final` lines (why it
was refused, if it was), so nothing in the session depends on the window:

- **Closing the launcher stops your server.** The window asks the session to
  stop, shows "Stopping your server before the launcher closes", waits
  until the session is over (at most 90 seconds), then closes. If the server
  does not stop in time, the window stays open and says so.
- **A reopened launcher reconnects.** When a session is still running (an
  earlier window crashed or was killed), the window follows it through its
  API, Stop works, and closing stops it as above.

Talking to its own server on `127.0.0.1` is not a network call: nothing
leaves the PC.

**Only the API.** The window reaches every server, its own included, by
address and token. For this PC it chooses a port and a token once (kept in
its settings as `local_api`), starts its server with `--api --api-port
<port>` and the token in `AFTERHOURS_API_TOKEN`, and from then on asks
that API for everything: status, events, World, Profile and every save,
sessions and their logs, decoding car pictures and the map, and the
pictures themselves, which the app's `afterhours://` protocol fetches from
`GET /v1/content/<file>` with the token (a page cannot send it). It runs
no other command and reads no server file while it has an address and
token; an unreachable server says so. When the launcher opens, it starts
its own server (`serve`) if none runs, so World, Profile and Play work at
once, and Play starts the game in that session. Servers without the API
(the pinned release until the pin moves) keep the earlier command path.

**Your servers** (the Server screen; `servers.rs`). The Servers panel lists
this PC's own server and every saved server on another PC; pressing a row
uses that server, and Play, World, Profile, Map and Logs follow it. The
list is `servers.json` beside `settings.json`: each entry's name, address,
token, when it was added, when it last answered, the version and
capabilities it last reported and when a game last played on it, plus which
entry is in use and what closing does. The entry in use is mirrored into
`settings.json` as `server`, which every command reads, so one server is
reached at a time. While the screen is open every saved server is checked
(`GET /v1/info`, two seconds each, all at once, every thirty seconds), and
each row shows a dot and a word: *In use*, *Online*, *Not reachable*, *New
token* (the server refused it), *Older* (no session API). A server that
is off still shows what it was.

**Sharing this PC's server** (Server → This PC → Let your other PCs use
this server). The launcher then starts its server with `--server-only
--listen <this PC's address>` and shows the pairing code
`<address>:<port>/<token>` with a Copy button; the game no longer runs on
this PC. It takes effect from the server's next start, and Windows may ask
to allow it through the firewall.

**Adding a server on another PC** (Server → Add a server). Paste the
pairing code the other PC's Server screen copied (or the address, then the
token) and press Check: the launcher asks that server's API with the token
and says what answered, which features work here, how many drivers are
saved there and whether a game is playing, or why it cannot be used (not
reachable, token refused, an older server without the API, this PC's own
server). Save and use picks it at once; Save for later keeps it in the
list. From then on the window follows that server exactly as it follows
its own: status, console, map markers, World and Profile come from its API
and Stop stops it (asked twice), but closing the launcher leaves it
running. There is no command to fall back to for another PC, so an
unreachable server says so. Starting a server here is refused; Play starts
the game on this PC with `start --remote <address> --token <token>`
(afterhours-2015 #172), which relays it to that server, and the window
follows that local session until the game closes, then Stop stops the
game, not the server. A saved server can be renamed, forgotten (not while
in use) or given a new pairing code when its token changed.

**Picking** (`server_use`). Picking a server on another PC while this PC's
own server runs stops that server first, because a game here can talk to
one server only, unless it is shared, in which case it keeps running for
the other PCs. A game that is playing right now blocks the switch. Picking
This PC again starts this PC's own server when it is off.

**Connection logs** (`connlog.rs`). The launcher keeps its own log per
server under `servers/` in its config directory, at most 1 MiB each (the
oldest lines go): picked, connected and reconnected, stopped answering,
token refused, not reachable, a stop sent, a game started, renamed, a new
pairing code. Each line also goes to the window as a *Launcher* row of the
Server screen's live log, and Logs → Connections shows each server's log.

**Closing while a shared server runs.** A server that is not shared is
stopped when the launcher closes, as before. A shared one may be in use by
your other PCs, so the window asks: *Keep running* closes the launcher and
leaves the server (Server shows it next time), *Stop and close* stops it
first. "Always do this" remembers the answer; Settings → General changes
it.

Without `api`, older servers keep the earlier paths. With `events`, sessions
run with `--events`: the server prints one JSON `event` record per line
(`schemas/event.schema.json`) instead of console text, and `cli.rs` turns
`status`, `diagnostic`, `session` and a failed `final` into the same
`session-output` lines the console text gave and forwards `map-feed`
records as `map-feed` events; `status --json` is polled. A server without
`events` (v0.3.0) keeps the console-text path. Lines are bounded at 2 MiB;
a longer one is left out and noted. These sessions write to pipes the
window owns, so the window will not close while one runs.

The Map draws the game's own world map from `map-images`. With `map-feed`
the newest frame of the session's event stream becomes its markers
(`src/lib/state/mapfeed.ts`): every driver in a local session is you,
then traffic and roaming rivals, keyed by world connection, kind and the
server's id; the spawn ring is a circle at the traffic policy's radii
around each driver, labelled approximate because the policy spawns ahead
of the driver. A frame with no world session, the session leaving `ready`
or its end clears them. The Layers panel switches each kind on or off.

The updater (`tauri-plugin-updater`) checks this repository's
`releases/latest/download/latest.json`. Its decisions are pure functions in
`src/lib/state/updates.ts`: never install while any session runs, copy the
saves before an update that changes the bundled server, never offer a
downgrade, and stay quiet offline. The rules are in
[docs/ROADMAP.md](docs/ROADMAP.md#updater-rules).

World's traffic and rivals are the server's `settings --json`
(`world-settings`): traffic as a multiple of the game's own amount, up to the
server's maximum, and rivals as a number from 0 to 15 or Auto. They are read
when World opens and after a session ends, and saved on change
(`--traffic <percent>`, `--rivals <count>|original`). A server that reports
`live` applies a save to a running session within about a second; on older
servers a running session keeps the values it started with, so the controls
rest while one runs. The scale and what a saved value shows as are
`src/lib/state/world.ts`.

Car pictures come from the server too. When `version --json` lists
`car-images` and the profile reports no picture set (`car_images` is
`null`, after the first run or when the content changed), the window runs
`car-images --json` in the background (`images.rs`) and reads the profile
again; until then, and for any car without a picture, the screens show a
graphite tile with a car icon. Which picture shows is
`src/lib/state/carimages.ts`.

The types for the server's JSON are generated from the JSON Schemas in
`schemas/` (`pnpm types`), and CI runs the pinned executable's JSON commands
against those schemas (`pnpm contract`).

## Security

- **Content Security Policy** (`tauri.conf.json`): scripts, styles and
  fonts come only from the app itself; images from the app, `data:` and the
  asset protocol. The window loads nothing from the network; the updater's
  check runs in Rust.
- **Asset protocol, one folder.** Car pictures are the only files the window
  reads from disk directly, through Tauri's asset protocol
  (`convertFileSrc`). Its static scope is empty. At start-up, after the
  settings change and after `car-images` runs, `images.rs` allows exactly
  `<data folder>/artifacts/content/car-images` of the data folder in use
  (`%LOCALAPPDATA%\Afterhours2015` unless Settings names another), and
  nothing else: saves, logs, the game folder and the rest of the content
  cache stay unreadable through it. The window also refuses a picture path
  the profile names outside its `car_images` folder (`insideDir`, tested).
- **Everything else goes through commands**: the server's JSON commands
  with deadlines and output bounds, and the log viewer's one allow-listed
  file of one session folder (`reads.rs`), bounded and without following
  links.

## Repository layout

| Path                 | What                                                                                                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server-pin.json`    | the bundled server: release tag and SHA-256s                                                                                                                                                                                                                                                                |
| `schemas/`           | JSON Schemas of the server's `--json` output                                                                                                                                                                                                                                                                |
| `src/`               | Svelte app: `App.svelte`, `lib/api` (Tauri commands, generated types), `lib/state` (routes, update rules, view models, stores), `lib/components`, `lib/views`                                                                                                                                               |
| `src-tauri/`         | Rust: `pin.rs`, `server.rs` (which executable), `cli.rs` (runs it, streams events), `connection.rs` (its session API, closing), `data.rs` (session records, save backups), `reads.rs` (profile, sessions, session files), `images.rs` (car pictures, asset scope), `updates.rs`, `settings.rs`, `detect.rs` |
| `scripts/`           | `server-pin.mjs` (fetch, verify, bump), `gen-types.mjs`, `contract.mjs`, `versions.mjs`, `updater-manifest.mjs`, `tokens.mjs`, `release/` (versions, notes and tags of releases)                                                                                                                            |
| `design/`            | `tokens.json` from the design system, the design rules, the app icon source                                                                                                                                                                                                                                 |
| `.github/workflows/` | `ci.yml`, `pin-bump.yml` (hourly server check), `prepare-release.yml`, `release-tag.yml`, `release.yml` (`v*` tags; see RELEASING.md)                                                                                                                                                                       |

## Checks

```sh
pnpm format:check && pnpm versions && pnpm check && pnpm test
pnpm sidecar && pnpm contract
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

CI runs these on Linux and Windows, compiles the app, runs the contract check
and builds the Windows installer as an unsigned artifact. One Rust test is
ignored by default because it needs a running server session: it follows a
real `--api` session and stops it through the API (see
`a_real_session_is_followed_and_stopped_through_its_api` in
`src-tauri/src/connection.rs` for how to run it). See
[CONTRIBUTING.md](CONTRIBUTING.md), [RELEASING.md](RELEASING.md) and
[AGENTS.md](AGENTS.md).

## License

[MPL-2.0](LICENSE). The bundled server is MPL-2.0 too; its license and
third-party notices are installed beside it in `afterhours-server/`. Font:
DM Sans (`@fontsource/dm-sans` 5.3.0) under the SIL Open Font License 1.1,
vendored through fontsource. Icons: [Tabler Icons](https://tabler.io/icons)
(`@tabler/icons-svelte` 3.49.0, MIT), compiled into the app, so they work
offline. Tauri's `protocol-asset` feature adds `http-range` 0.1.6 (MIT) for
range requests on asset URLs. Car pictures are decoded from the player's own
installation into their data folder; none is shipped or committed here.
