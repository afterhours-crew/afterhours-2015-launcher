# Roadmap

The approved plan for the launcher, as of 2026-10-19. The launcher replaces
the terminal `Afterhours.exe` for testers: one installer, a bundled server,
updates that arrive by themselves, and a GUI to set up the local server. The
screens follow the "Afterhours Launcher" design system and the launcher
design canvas.

## Tracks

| Track | What                                                                                                                                                                                            | Where                                | State                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a    | Profile: `profile --json` reads one save without changing it (identity, REP, bank, garage slots, stats)                                                                                         | afterhours-2015                      | Done on a local branch, awaiting validation                                                                                                                            |
| 1b    | CLI contract v1: JSON Schemas generated from the server's Rust types, `version --json` capabilities, `sessions --json`, the supervise event stream (afterhours-2015 #86)                        | afterhours-2015                      | Done on a local branch (`feature/launcher-contract`), awaiting validation                                                                                              |
| 1c    | Launcher foundation: shell and routing, bundled server, NSIS installer, updater, release and pin-bump workflows, generated types, this roadmap                                                  | this repository                      | This branch (`feature/launcher-foundation`)                                                                                                                            |
| 2     | Screens: Garage, Profile (with Cars, every owned car in garage and warehouse, and Save data; Edit driver opens from it), World, Map, Host, Logs and Settings, built from the designs            | this repository                      | Built on `feature/launcher-screens`, awaiting validation                                                                                                               |
| 3     | Traffic and rivals: the server's `settings` command (`world-settings`), then the World screen's controls; settings that apply live need a live control endpoint in the server                   | afterhours-2015, then here           | Server: afterhours-2015 #123; World: traffic Off, Default, 2x and 3x (more crashes the game), rivals 0 to 15 or Auto (#136). Changes apply live, within about a second |
| 4     | Account edits: `account set` for name, bank and REP                                                                                                                                             | afterhours-2015, then Profile        | Planned                                                                                                                                                                |
| 5     | Overlay: the in-game companion window (design C1)                                                                                                                                               | none                                 | Not planned (2026-10-19); nothing is built for it. The live control endpoint it needed is still wanted, for track 3                                                    |
| 6     | v0.1 tester preview: the first published launcher release                                                                                                                                       | this repository                      | Planned; uses the release machinery from 1c                                                                                                                            |
| 7     | Live map: the game's own world map decoded from the tester's installation (`map-images`), then a read-only observer feed from the server (players, traffic and rival motion, spawns and clears) | afterhours-2015, then the Map screen | Map with pan and zoom on `feature/map-screen` (server `map-images`: afterhours-2015 #158); live markers on `feature/map-markers` (server `map-feed`: #160)             |
| 8     | Server connection: the launcher reaches every server, its own included, through the server's HTTP API, as it would a server on another PC; see [Server connection](#server-connection-track-8)  | afterhours-2015, then here           | Step 1, the server's session API (`--api`), on afterhours-2015 `feature/server-api` (#163); step 2, the launcher's switch to it, is next                               |

The launch bar never shows a car. Its left side reads "Playing on", then
"Your server", then whether it runs: "Offline · this PC only" or
"Running · this PC only".

**Cops need research.** The server runs no police today. Nothing about cops is
offered until research shows how the game expects them; the World screen's
one note says so.

## Server connection (track 8)

The launcher will be able to connect to more than one server. So it treats
its own bundled server like any other: a server it reaches over HTTP, which
happens to run on this PC (`127.0.0.1`). Today it follows a session only
through the process it started (console text or `--events` lines on that
process's pipes, and `status --json` polled from files), so a window that
closes, crashes or reopens loses the session's live output, and the window
cannot close while its session runs.

Decided (2026-10-20):

- **Closing the launcher stops its own server.** It asks the server to stop,
  waits until the session has finished, then closes.
- **Another PC's launcher works as this one does today**, only over the
  network. Which changes it may make (its own account, for example) is
  decided later, with access by account.
- **The game always runs on the player's PC**, started and routed by the
  bundled `Afterhours.exe`, whichever server it plays on. Starting the
  server process, the file check, decoding car pictures and the map from the
  installation, and logs stay local commands.

Steps, in order:

1. **Server: the session API** (afterhours-2015 #163, `feature/server-api`).
   `serve --api` (also `setup` and `start`) answers `GET /v1/info`,
   `/v1/status`, `/v1/events` (status, diagnostics and map frames as
   server-sent events, starting with the newest status and map frame) and
   `POST /v1/stop`, `/v1/play`, on `127.0.0.1` only, with the same records
   and schemas as the commands. A random token per session, in `api.json`
   and printed by `api --json`, guards every request; web pages cannot
   reach it.
2. **Launcher: one server connection.** For its own server the launcher runs
   `serve --api` (and Play `play`), reads `api --json`, and follows status,
   console lines and map markers from the event stream; nothing depends on
   the process's pipes. Closing stops the server as decided above; a
   reopened launcher finds a running session and reconnects. Servers without
   `api` keep today's path. Talking to its own server on `127.0.0.1` is not
   a network call: nothing leaves the PC.
3. **Server: settings and profile over the API** (`GET`/`PUT /v1/settings`,
   `GET /v1/profile`), so World and Profile work the same way.
4. **Server and research: beyond this PC.** Listening on the network as an
   explicit opt-in, and starting the game against a server on another PC,
   which needs research into routing the game to an address that is not
   local. Nothing is promised until that research says it works.
5. **Launcher: add a server by address**, with the same screens over the
   network.
6. **Later: access by account.** A launcher on another PC changes only what
   its account owns.

## Sync model

- **One launcher, one server.** Each launcher version bundles exactly one
  afterhours-crew/afterhours-2015 release, named in `server-pin.json` by tag
  and SHA-256 (the ZIP's, from that release's `SHA256SUMS.txt`, and the
  executable's, from the ZIP's `build-info.json`). The build refuses any other
  executable. There is no separate server download and no server updater:
  server updates reach testers as launcher updates.
- **The server owns the contract.** The server repository publishes JSON
  Schemas generated from its Rust types with each release, and
  `version --json` reports its capabilities (track 1b). The launcher
  generates its TypeScript types from the pinned release's schemas
  (`pnpm types`), which 1b attaches as `Afterhours-contract.zip`. Until a
  release carries them, minimal schemas for `status` and `check` are
  vendored in `schemas/` (see `schemas/README.md`).
- **Lockstep until the first release.** Until the launcher's first published
  release, the CLI's JSON may change freely, moving together with the pin.
  After it, breaking changes bump the record `version`, because installed
  launchers will meet them.
- **Missing capabilities say so.** The launcher reads the server's
  capabilities from `version --json` (Settings → About this build lists
  them; v0.3.0 reports none). A screen whose capability is missing, such as
  Map without `map-images` or Profile without `profile`, hides what it cannot
  show and gives one note instead, never sample data.
- **Saves only move forward.** A new server may migrate the account SQLite
  forward, and older servers refuse upgraded saves. That is why saves are
  copied before a server change and why nothing is ever downgraded. The first
  start after a server change may rebuild the content cache from the
  installed game.

## Release chain

```text
afterhours-2015 release vX.Y.Z           Afterhours-windows-x64.zip, SHA256SUMS.txt, *.schema.json
        │  hourly or manual "Server pin bump" workflow
        │  (launcher changes: manual "Prepare release")
        ▼
release pull request                      server-pin.json, schemas/, src/lib/api/generated,
                                          the version (patch for a server, minor for
                                          launcher changes), draft notes in its description
        │  CI: contract job runs the new Afterhours.exe's JSON commands against the schemas
        │  a person reviews the notes and merges (never automatic)
        ▼
launcher tag vA.B.C                       "Tag release" once CI passes on the merge commit
        │  "Release" workflow: NSIS installer, updater signature, draft release
        │  with the reviewed notes, latest.json naming the bundled server
        ▼
published release                         the owner validates the draft and publishes it
        │  releases/latest/download/latest.json
        ▼
installed launchers                       Ask me (default) · Install automatically · Off
```

[RELEASING.md](../RELEASING.md) has the steps and the one-time setup.

## Updater rules

1. **Never install while a session runs.** The session supervisor outlives the
   window, so the launcher asks the bundled server (`status --json`) whether
   a session is live. If it cannot answer, it reads `current-session.json`
   and that session's `status.json` in the data folder
   (`%LOCALAPPDATA%\Afterhours2015` by default) and waits while they record a
   live state whose lock is still held. The banner says why the update waits;
   a waiting update tries again every minute.
2. **Back up before a server change.** Before installing an update whose
   bundled server differs from the current one, the launcher copies
   `artifacts/account/*.sqlite` (with any `-wal` or `-journal`) and
   `account.json` to `backups/<UTC time>-<old>-to-<new>/` in the data folder,
   checks every copy's SHA-256 and writes `backup.json`. If the copy fails,
   the update does not install.
3. **Never offer a downgrade.** Neither of the launcher (the updater only
   accepts newer versions, and each update's signature must name the version
   it announces) nor of the server it bundles (`latest.json` must name the
   bundled server; an older or unnamed one is refused).
4. **Never in the way.** Checks run in the background, eight seconds after
   start and then every six hours, are bounded to fifteen seconds and stay
   silent offline. Play is never blocked by a check; only during the few
   seconds of the install itself, when the app is about to close, is Play
   held.
5. **Modes.** Ask me (default) shows a banner with the version, notes and
   Update / Later / Skip this version. Install automatically installs when
   the rules allow. Off checks only when asked. Settings → Updates always
   offers "Check for updates" and the release page.

## Not verified yet

These need a real signed release and a Windows machine, and are tracked for
the first release (track 6):

- A signed release built by the workflow, end to end.
- The updater's download, install and relaunch on Windows (NSIS, passive
  mode, per-user install).
- Whether the relaunched app inherits a job object from the installer, and
  whether sessions started from it still work.
- SmartScreen's warnings for an installer without Authenticode signing.
- Sessions started from the installed (windowless) app: the server runs with
  `CREATE_NO_WINDOW` and its output piped to the window.
- The window refuses to close while its session runs, because the v0.3.0
  server writes progress to pipes the window owns and would stop on a broken
  pipe. Track 1b's `--events` mode silences the console and survives a
  broken pipe. Sessions now run with `--events` when the server reports
  it (track 7's map markers need it); letting the window close while one
  runs is still to decide.
