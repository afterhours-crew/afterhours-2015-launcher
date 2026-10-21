# Releasing

How a new server reaches the launcher, and how a launcher release reaches
testers. The plan and the rules behind it are in
[docs/ROADMAP.md](docs/ROADMAP.md).

Workflows prepare everything up to an unpublished draft. A person does three
things: approves the release pull request's CI run, reviews and merges the
pull request, then tests the draft and publishes it.

1. A release pull request appears. **Server pin bump** opens one within the
   hour after the server publishes a release; **Prepare release** opens one,
   when run by hand, for launcher changes. It sets the next version by the
   rule below and drafts the notes in its description.
2. Its CI waits until someone chooses **Approve workflows to run** on the
   pull request ([why](#ci-on-the-release-pull-request)).
3. Merging it is the go-ahead. Once CI passes on the merge commit, **Tag
   release** tags it `v<version>` and starts **Release**.
4. **Release** builds and signs the installer and the no-install ZIP and
   attaches them to a **draft** with the notes from the pull request.
5. The owner tests the draft and publishes it. Nothing publishes on its own.

## Versions

The rule (owner, 2026-10-20):

- A release that only bundles a newer server (a pin bump) bumps the **patch**
  version: 0.2.0 → 0.2.1.
- A release with launcher changes bumps the **minor** version, resetting the
  patch: 0.2.0 → 0.3.0.
- If both happen together, the minor bump wins.

A launcher change is a pull request merged since the previous version tag
that changes any file outside `.github/`, `docs/`, `scripts/release/`,
Markdown files, tests (`*.test.ts`, `*.test.mjs`) and the formatter and Git
settings files: those cannot change what testers download. Release pull
requests themselves (`pin/afterhours-*`, `feature/release-*`) never count.
A dependency or lockfile update, a schema change or a change to a build
script such as `portable-zip.mjs` does count.

Tags are immutable, so a version whose tag exists is skipped: `v0.2.0` was
tagged for a draft that was deleted (0.1.2 shipped its contents instead), so
the first minor release after 0.1.2 is 0.3.0. A new version is also never
lower than the latest published release. `scripts/release/plan.mjs` holds the
rule and `plan.test.mjs` tests it.

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

In Settings → Actions → General → Workflow permissions, tick "Allow GitHub
Actions to create and approve pull requests". Server pin bump and Prepare
release open their pull requests with the workflow's own token and need it.
The default permission can stay read-only: each workflow asks for what it
needs. No other token is used: the server repository is public.

A tag pushed with the workflow token starts no Release, so Tag release
dispatches it (`gh workflow run`). A pull request opened with that token does
get CI, but GitHub holds the run until a person approves it: see the next
section. No setting lifts that hold.

## CI on the release pull request

Since June 2026 GitHub creates the CI run of a pull request opened with the
workflow token in an approval-required state
([changelog](https://github.blog/changelog/2026-06-11-bot-created-pull-requests-can-run-workflows-if-approved/)).
Until someone with write access chooses **Approve workflows to run** in the
pull request's merge box, the pull request has no checks and stays blocked,
whatever its reviews say. Approve the run when the pull request appears, so
CI runs while you read the notes. If a later push leaves the pull request
waiting again, approve that run the same way.

From the command line:

```sh
gh run list --branch <branch> --event pull_request --status action_required
gh api -X POST repos/afterhours-crew/afterhours-2015-launcher/actions/runs/<id>/approve
```

Running CI on the branch by hand (`gh workflow run ci.yml --ref <branch>`)
does not help: GitHub does not count a dispatched run's checks for a pull
request. The pull requests for 0.3.0
([#11](https://github.com/afterhours-crew/afterhours-2015-launcher/pull/11))
and 0.4.0
([#14](https://github.com/afterhours-crew/afterhours-2015-launcher/pull/14)),
on 2026-10-20, each had a dispatched run pass and still stayed blocked until
the held run was approved and passed.

Only a pull request opened by another identity, a GitHub App installation
token or a personal access token, gets CI without the approval. Either needs
a stored secret; the workflows use the workflow token alone, so a person
approves.

## A new server (pin bump)

The "Server pin bump" workflow runs every hour and on demand (Actions →
Server pin bump → Run workflow). When afterhours-crew/afterhours-2015 has a
published, non-prerelease release newer than `server-pin.json`, it:

1. downloads `SHA256SUMS.txt` and `Afterhours-windows-x64.zip`, checks the ZIP
   against the sums and `Afterhours.exe` against the ZIP's `build-info.json`;
2. takes the release's schemas (`Afterhours-contract.zip` or
   `*.schema.json` assets, each listed in `SHA256SUMS.txt`) into `schemas/`
   and regenerates `src/lib/api/generated`;
3. sets the next launcher version (the patch, or the minor when launcher
   changes merged since the previous release) in `package.json`,
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
   `src-tauri/Cargo.lock`;
4. pushes `pin/afterhours-<tag>` and opens **Release \<version\>: bundle
   server \<tag\>** with the draft notes in its description. Its CI waits for
   [approval](#ci-on-the-release-pull-request).

If checks are missing, the CI run is waiting for that approval.
If a newer server comes out while a pin bump is open, the next run opens
another one for it; its description names the older one, which can be closed.

The same steps by hand:

```sh
node scripts/server-pin.mjs bump v0.4.0
pnpm types
node scripts/release/cli.mjs prepare --for-pin --body pr-body.md
```

Never edit `server-pin.json` by hand to match a file.

## Launcher changes (Prepare release)

Actions → **Prepare release** → Run workflow on main. With **auto**, the rule
picks the version, and the workflow stops with "Nothing to release" when no
launcher change merged and the server is unchanged. **minor** or **major**
overrides the rule. Tick **dry run** to see the notes and the version change in
the run's summary without opening anything. It pushes
`feature/release-<version>` and opens **Release \<version\>**, whose CI waits
for [approval](#ci-on-the-release-pull-request).
A newer server is not pulled in here; the pin bump brings it.

CI's **Release preview** job shows, on every pull request, what Prepare release
would produce from main at that moment.

## Reviewing the release pull request

The description holds the notes between `<!-- release-notes:start -->` and
`<!-- release-notes:end -->`, then a review section that never reaches the
release: the version and why, the server change, which pull requests were
left out and why, and other open release pull requests. The notes follow the
v0.1.2 notes:

- a summary line to replace;
- **Updating from** the previous version, and **Which file to download**;
- **New with the \<version\> server**, for each server release since the
  previous pin: the server notes' summary and their Added, Changed and Fixed
  lists, with a link to the full notes. Reword what only applies to the
  terminal;
- **New in the launcher**: one entry per launcher change, under Added
  (`kind:feature` label or a `feature/` branch), Fixed (`kind:bug` or
  `bugfix/`) or Changed (anything else). An entry is the pull request's
  title, followed by the text of a `## Release note` section in its
  description when it has one;
- **Known limits** and the closing paragraphs, carried over from the previous
  release's notes.

Edit the notes in the description: the draft takes them from there when it is
built. Before merging:

- CI ran (after **Approve workflows to run**) and is green, including
  **Server contract** for a pin bump, which runs the new executable's JSON
  commands against temporary data folders and validates them against the
  schemas.
- The server's release notes do not change saves in a way the backup rule
  does not cover.
- If the generated types changed, the app compiles against them; fix it on
  the same branch.

The required checks are strict: if main moved, use **Update branch**. If more
pull requests merged meanwhile, close the release pull request, delete its
branch and prepare again, so the version and the notes include them.

## Tag and draft

**Tag release** runs when CI finishes on main. It acts only on a commit of
main's own history that changed the launcher version, only after CI passed on
it, and never moves or reuses a tag. It pushes an annotated `v<version>` tag
and dispatches **Release** for it. CI runs on main are never cancelled by later
pushes, so every merge commit gets its verdict. If CI failed on the merge
commit, re-running the failed jobs starts Tag release again once they pass; to
tag by hand after CI passed, run Tag release with the merge commit's full SHA.

**Release** checks the versions and the signing setup, fetches and
contract-checks the pinned server, builds the NSIS installer, signs the
updater artifact and attaches `Afterhours_<version>_x64-setup.exe`, its `.sig`
and `latest.json` to a **draft** release whose text is the reviewed notes
(default notes for a tag without a release pull request). It then adds the
no-install ZIP, `Afterhours_<version>_x64-portable.zip`, built from the same
launcher with the verified server beside it. Finally it checks `latest.json`
(version, download URLs, the signed version) and adds the bundled server to
it, which installed launchers require before they offer the update. To build
the draft for an existing tag again, run Release with that tag; the tag must
contain `scripts/release/`.

## Validate and publish

1. Validate the draft. At least:
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
     `https://github.com/afterhours-crew/afterhours-2015-launcher/releases/download/v<version>/latest.json`.

2. Publish it as the latest release. Installed launchers find it at their
   next background check (within six hours) or on "Check for updates".

## Releasing by hand

The workflows only automate these steps, which still work:

1. On a branch, set the new version (by the rule above) in `package.json`,
   `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, run
   `cargo check` in `src-tauri` to update `Cargo.lock`, then `pnpm versions`.
   Merge it. Tag release tags the merge commit once CI passes.
2. Without Tag release, tag the merge commit and push the tag, which starts
   Release:

   ```sh
   git tag v0.3.0
   git push origin v0.3.0
   ```

   The tag must be `v` plus the version in all four files; the workflow
   refuses anything else.

## When a release is bad

The updater never goes back, so the fix is a newer release. Never publish a
launcher whose bundled server is older than one already published: launchers
refuse it, and older servers refuse upgraded saves.

A tester who must go back restores by hand: close the launcher, reinstall the
older installer, then copy the contents of
`%LOCALAPPDATA%\Afterhours2015\backups\<time>-<old>-to-<new>\` back into
`%LOCALAPPDATA%\Afterhours2015\`.

## Not verified yet

The updater's install and relaunch on Windows, whether the relaunched app
inherits a job object, and SmartScreen's behaviour without Authenticode have
not been exercised. Record the first release's results here.

The release automation ran end to end on 2026-10-20: a pin bump made 0.3.0
and Prepare release made 0.4.0, each through Tag release and Release to a
draft, which was then published. Both pull requests needed the
[CI approval](#ci-on-the-release-pull-request), which the workflows had not
expected.

The first run, v0.1.0 (2026-10-20), signed the installer and attached it, its
`.sig` and `latest.json` to the draft. Two later steps failed and were fixed
afterwards:

- The no-install ZIP: under the workflow's Git Bash, `tar.exe` was GNU tar.
  `scripts/portable-zip.mjs` now calls Windows' own `tar.exe` by its full path.
- `latest.json`: on a draft, tauri-action links each update to the GitHub API
  (`api.github.com/.../releases/assets/<id>`). `scripts/updater-manifest.mjs`
  now replaces that with the public `releases/download/v<version>/` link for
  the file the signature names, instead of refusing it.
