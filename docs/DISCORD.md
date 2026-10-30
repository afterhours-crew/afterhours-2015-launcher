# Discord presence

The launcher owns this optional integration; the server and its production pin
are unchanged. `discord_presence` in launcher settings defaults to false, including
old settings files. Enabling it allows publication through the desktop Discord
client. No bot, access token, OAuth login or webview network permission is used.

The public application ID is `1565749588378259597`; its application name supplies
Discord's Playing title. The uploaded asset key `afterhours` supplies the large
image. The application avatar and invite cover are separate portal fields.

## State and privacy

`src-tauri/src/discord.rs` reads only the canonical local `status --json` command,
with the selected local data folder, every five seconds after the preceding read
finishes. The existing command has a ten-second deadline and 1 MiB output bound.
No save is read or written by this integration. It never queries the selected
remote server, inspects game processes itself, or infers gameplay from a GUI tab.
A relay game has a local canonical session and follows the same path.

Only fixed text and the owned logo are published: in the launcher, preparing,
starting, playing, hosting locally or stopping. Failed/unknown reads return to
launcher status. A `start` action without a running game is not Playing.
Changing the data folder or disabling invalidates pending reads. Existing status
timestamps are update times, so no elapsed-play timer is fabricated.

No driver/account/session ID, network address, token, path, car, reward or story
objective is sent. Discord's user payload and raw replies are not logged or sent
to the window. The library necessarily supplies the helper's own process ID to
associate its activity with its lifetime.

## Package and lifecycle

[`discord-presence` 3.2.0](https://docs.rs/discord-presence/3.2.0/discord_presence/)
(MIT) owns platform discovery, native IPC and activity encoding. Its synchronous
handshake, command reply and shutdown can block. The same launcher executable
therefore has a private `--afterhours-discord-presence` mode, entered before any
Tauri or server initialization. It receives only a small status enum over stdin.
There is one helper while enabled; no resident service or separate binary.

The parent bounds command replies to three seconds, retains only the latest
desired status and backs off failed starts from one to thirty seconds. It checks
helper health every two seconds. A helper waiting thirty seconds without a ready
Discord connection is restarted. Ordinary status changes are deduplicated and
coalesced over fifteen seconds; a new Discord connection republishes the latest.
One local status read can finish after opt-out; its result is discarded, and no
new read starts while disabled.

On disable/exit the helper gets a best-effort clear, then is terminated and reaped
within a bounded grace period. Only its own activity is affected. A separate
bounded stdin reader exits on parent EOF even if a library call has stalled.
Actual application exit waits at most one second for cleanup; a refused close
does not stop presence. Discord disappearance/errors never block Play.

The package's IPC parser and reconnect behavior are upstream code. Process
isolation bounds their effect on launcher responsiveness; it does not establish
correct handling of every malformed Discord frame. No custom Discord transport
is maintained here. Sources inspected 2026-10-30:
[package source](https://docs.rs/crate/discord-presence/3.2.0/source/),
[Discord RPC](https://docs.discord.com/developers/topics/rpc).

## Verification

Automated coverage includes setting migration/round-trip, local and legacy status
mapping, end-of-game return, stale-read rejection, exact library activity payload,
deduplication/rate interval/reconnect generation, bounded helper input, real child
pipe replies, malformed/silent helpers, kill/reap, opt-out and restart. A test of
the actual launcher executable enters helper mode and exits on Stop or parent
EOF without creating a Discord client or window. No automated test publishes
activity to an account.

Desktop acceptance remains manual: enable with Discord open and inspect the card
and logo; start/close a local game and a relay game; select a remote server whose
game runs elsewhere; restart Discord; disable; close/reopen the launcher; kill
the launcher; and run two copies to inspect Discord's own conflict behavior.
Confirm absent/offline Discord leaves normal launch and shutdown working. Windows
automated results do not establish Linux/macOS desktop behavior.

## Recent activity identity

A correct live card does not establish correct recent activity history. Discord
documents Rich Presence and automatic game detection as independent systems:
[Game claiming requirements](https://docs.discord.com/developers/platform/claim-your-game).
A reported history entry pointed to the unrelated **AfterHours** game.
Executable-name detection is a hypothesis, not a confirmed cause.

Windows installers and portable ZIPs package the GUI as
`Afterhours2015Launcher.exe` and the verified server bytes as
`Afterhours2015Server.exe`. Server resolution prefers that exact name beside the
launcher and falls back to the existing `Afterhours.exe` name for old packages.
The presence helper follows the current launcher executable automatically.
No application ID, server pin, version, Discord setting or save location changes.
Keep both binaries together in a new folder, with the portable marker and notices.
The upstream archive still supplies `Afterhours.exe`; its hashes and provenance
remain intact when staging it under the distribution name. The installer keeps
the existing product name and application identifier. Tauri's NSIS migration
handles the main executable rename and shortcut targets. The Windows installer
CI checks migration from the published v0.5.0 format with synthetic settings and
save bytes; see [RELEASING.md](../RELEASING.md). This does not establish that an
upgrade has been exercised on every existing installation.

Check the live title/artwork and subsequent activity history after a new session.
Existing history is historical: an old incorrect tile remaining is not evidence
that the new session was also misidentified. Record whether the unrelated entry's
last-played time advances. No tester should need to disable another game's
detection for this check.

On 2026-10-30 the owner tested portable GUI ef2b55f with these names and reported
that NFS updated while the unrelated AfterHours entry stayed old (30 seconds
versus 17 minutes in the supplied screenshot). The owner accepted correct live
presence with no fresh wrong history entry; a separate Afterhours 2015 history
entry is not required. This is one owner observation, not a guarantee about
Discord's matching algorithm, other clients or future history retention.
