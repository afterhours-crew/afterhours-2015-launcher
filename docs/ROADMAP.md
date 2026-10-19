# Roadmap

The approved plan for the launcher, as of 2026-10-19. The launcher replaces
the terminal `Afterhours.exe` for testers: one installer, a bundled server,
updates that arrive by themselves, and a GUI to set up the local server. The
screens follow the "Afterhours Launcher" design system and the launcher
design canvas.

## Tracks

| Track | What                                                                                                                                                                     | Where                                             | State                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------- |
| 1a    | Profile: `profile --json` reads one save without changing it (identity, REP, bank, garage slots, stats)                                                                  | afterhours-2015                                   | Done on a local branch, awaiting validation                               |
| 1b    | CLI contract v1: JSON Schemas generated from the server's Rust types, `version --json` capabilities, `sessions --json`, the supervise event stream (afterhours-2015 #86) | afterhours-2015                                   | Done on a local branch (`feature/launcher-contract`), awaiting validation |
| 1c    | Launcher foundation: shell and routing, bundled server, NSIS installer, updater, release and pin-bump workflows, generated types, this roadmap                           | this repository                                   | This branch (`feature/launcher-foundation`)                               |
| 2     | Screens: Garage, Profile, World, Map, Host, Logs and Settings built from the designs, plus a Cars screen listing every owned car (garage and warehouse) from the profile | this repository                                   | Next, on top of 1c; the views are placeholders until then                 |
| 3     | Traffic density: a server setting, then the World screen's control                                                                                                       | afterhours-2015, then here                        | Planned; waits until the milestone work on traffic AI is idle             |
| 4     | Account edits: `account set` for name, bank and REP                                                                                                                      | afterhours-2015, then Profile                     | Planned                                                                   |
| 5     | Overlay: the in-game companion window                                                                                                                                    | both; needs a live control endpoint in the server | Planned                                                                   |
| 6     | v0.1 tester preview: the first published launcher release                                                                                                                | this repository                                   | Planned; uses the release machinery from 1c                               |
| 7     | Live map: a read-only observer feed from the server (players, traffic and rival motion, spawns and clears) and a road map built from the tester's own installation       | afterhours-2015, then the Map screen              | Planned; waits for the current server milestone, like 3                   |

The launch bar names the server, never a "last driven" car.

**Cops need research.** The server runs no police today. Nothing about cops is
offered until research shows how the game expects them; the World screen
lists them as "Coming later".

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
- **Missing capabilities say so.** A screen whose server capability does not
  exist shows "Coming later" rather than sample data.
- **Saves only move forward.** A new server may migrate the account SQLite
  forward, and older servers refuse upgraded saves. That is why saves are
  copied before a server change and why nothing is ever downgraded. The first
  start after a server change may rebuild the content cache from the
  installed game.

## Release chain

```text
afterhours-2015 release vX.Y.Z           Afterhours-windows-x64.zip, SHA256SUMS.txt, *.schema.json
        │  daily or manual "Server pin bump" workflow
        ▼
pin-bump pull request                     server-pin.json, schemas/, src/lib/api/generated
        │  CI: contract job runs the new Afterhours.exe's JSON commands against the schemas
        │  a person reviews and merges (never automatic)
        ▼
launcher tag vA.B.C                       version fields bumped; the tag must match them
        │  "Release" workflow: NSIS installer, updater signature, draft release,
        │  latest.json naming the bundled server
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
  broken pipe; once the pin reaches a release with it, sessions should run
  with `--events` and the window may close freely.
