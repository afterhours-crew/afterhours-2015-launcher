# Releasing

How a new server reaches the launcher, and how a launcher release reaches
testers. The plan and the rules behind it are in
[docs/ROADMAP.md](docs/ROADMAP.md).

## One-time setup

### Updater signing key

The updater installs only packages signed with the launcher's own key. This
is not Authenticode code signing, which was decided against for now
(2026-10-19): the installer stays unsigned and SmartScreen may warn. The
updater key is still mandatory.

**Done on 2026-10-20:** minisign key ID `7C31722E0AB52793`. Its public key is
in `tauri.conf.json`, pinned by a test in `src-tauri/src/updates.rs`, and the
two repository secrets are set. The steps below are for replacing it, which
strands every installed launcher.

1. On a trusted machine, outside this repository:

   ```sh
   pnpm tauri signer generate -w ~/.tauri/afterhours-launcher.key
   ```

   Choose a password when asked. This writes the private key
   `afterhours-launcher.key` and the public key `afterhours-launcher.key.pub`.

2. Store the private key file and its password in the owner's password
   manager and an offline backup. **Never commit them.** Installed launchers
   trust only this key: if it is lost, they can never update again and every
   tester has to reinstall by hand.

3. Put the contents of `afterhours-launcher.key.pub` in
   `src-tauri/tauri.conf.json` at `plugins.updater.pubkey` and merge that
   through a pull request. Until then builds can look for updates but not
   install them, and the release workflow refuses to run.

4. Add the repository secrets (Settings → Secrets and variables → Actions):

   ```sh
   gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/afterhours-launcher.key
   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
   ```

   In PowerShell, which has no `<`, pipe the file instead:
   `Get-Content -Raw "$env:USERPROFILE\.tauri\afterhours-launcher.key" | gh secret set TAURI_SIGNING_PRIVATE_KEY`.

### Workflow permissions

In Settings → Actions → General → Workflow permissions, choose "Read and
write permissions" and tick "Allow GitHub Actions to create and approve pull
requests". The pin-bump workflow needs both to push its branch and open its
pull request. No other token is used: the server repository is public.

## Bundling a new server (pin bump)

The "Server pin bump" workflow runs daily and on demand (Actions → Server pin
bump → Run workflow). When afterhours-crew/afterhours-2015 has a published,
non-prerelease release newer than `server-pin.json`, it:

1. downloads `SHA256SUMS.txt` and `Afterhours-windows-x64.zip`, checks the ZIP
   against the sums and `Afterhours.exe` against the ZIP's `build-info.json`;
2. takes the release's schemas (`Afterhours-contract.zip` or
   `*.schema.json` assets, each listed in `SHA256SUMS.txt`) into `schemas/`
   and regenerates `src/lib/api/generated`;
3. pushes `pin/afterhours-<tag>`, opens a pull request and dispatches CI on it.

Pull requests opened with the workflow token do not start CI by themselves,
which is why the workflow dispatches it. If checks are missing, run
`gh workflow run ci.yml --ref pin/afterhours-<tag>`.

Before merging:

- CI is green, including **Server contract**, which runs the new executable's
  JSON commands against temporary data folders and validates them against the
  schemas.
- The server's release notes do not change saves in a way the backup rule
  does not cover.
- If the generated types changed, the app compiles against them; fix it on
  the same branch.

The same steps by hand:

```sh
node scripts/server-pin.mjs bump v0.4.0
pnpm types
pnpm contract
```

Never edit `server-pin.json` by hand to match a file.

## Releasing the launcher

1. On a branch, set the new version in `package.json`,
   `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, run
   `cargo check` in `src-tauri` to update `Cargo.lock`, then `pnpm versions`.
   Merge it.
2. Tag the merge commit and push the tag:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

   The tag must be `v` plus the version in all four files; the workflow
   refuses anything else.

3. The "Release" workflow checks the versions and the signing setup, fetches
   and contract-checks the pinned server, builds the NSIS installer, signs the
   updater artifact and attaches `Afterhours_<version>_x64-setup.exe`, its
   `.sig` and `latest.json` to a **draft** release. It then adds the
   no-install ZIP, `Afterhours_<version>_x64-portable.zip`, built from the
   same launcher with the verified server beside it. Finally it checks
   `latest.json` (version, download URLs, the signed version) and adds the
   bundled server to it, which installed launchers require before they offer
   the update.

4. Validate the draft. At least:
   - Install it as an ordinary user on Windows; it installs per user without
     administrator rights. Note any SmartScreen warning.
   - Unzip the no-install ZIP into an empty folder and run
     `Afterhours Launcher.exe`. Settings → Updates says the copy runs without
     installing and offers Ask me and Off only.
   - Settings → About shows the new launcher version, the pinned server and
     "Matches the pin".
   - `latest.json` has `server.tag` and a `windows-x86_64` entry whose
     signature names this version.
   - Play reaches the game (a live run, by whoever owns live runs).
   - To exercise the update path before testers see it, publish the draft as
     a **pre-release** (the updater's `releases/latest` endpoint ignores
     those), then update an older installed launcher built with
     `plugins.updater.endpoints` pointed at
     `https://github.com/afterhours-crew/afterhours-2015-launcher/releases/download/v0.2.0/latest.json`.

5. Publish it as the latest release. Installed launchers find it at their
   next background check (within six hours) or on "Check for updates".

## When a release is bad

The updater never goes back, so the fix is a newer release. Never publish a
launcher whose bundled server is older than one already published: launchers
refuse it, and older servers refuse upgraded saves.

A tester who must go back restores by hand: close the launcher, reinstall the
older installer, then copy the contents of
`%LOCALAPPDATA%\Afterhours2015\backups\<time>-<old>-to-<new>\` back into
`%LOCALAPPDATA%\Afterhours2015\`.

## Not verified yet

A signed release built by the workflow, the updater's install and relaunch on
Windows, whether the relaunched app inherits a job object, and SmartScreen's
behaviour without Authenticode have not been exercised. Record the first
release's results here.
