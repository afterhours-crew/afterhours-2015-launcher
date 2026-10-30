# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Installs the published legacy format, then updates it on a disposable runner.
# Never run on an owner/developer machine. Does not open the launcher or game.
param(
    [Parameter(Mandatory)][string]$InstallerDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or $env:RUNNER_OS -cne 'Windows') {
    throw 'Installer migration is restricted to disposable GitHub-hosted Windows runners.'
}
. (Join-Path $PSScriptRoot 'lib/preview-process.ps1')
$root = Split-Path -Parent $PSScriptRoot
$config = Get-Content -Raw -LiteralPath (Join-Path $root 'src-tauri/tauri.conf.json') | ConvertFrom-Json
if ($config.productName -cne 'Afterhours' -or $config.identifier -cne 'crew.afterhours.launcher') {
    throw 'Migration requires the existing production product and application identity.'
}
$install = Join-Path $env:LOCALAPPDATA 'Afterhours'
$settingsDir = Join-Path $env:APPDATA $config.identifier
$dataDir = Join-Path $env:LOCALAPPDATA 'Afterhours2015'
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Afterhours'
foreach ($path in @($install, $settingsDir, $dataDir, $registry, $OutputDirectory)) {
    if (Test-Path -LiteralPath $path) { throw "Expected a fresh runner: $path" }
}
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$output = (Resolve-Path -LiteralPath $OutputDirectory).Path
$report = [ordered]@{ version = 1; started_utc = [DateTime]::UtcNow.ToString('o'); status = 'failed'; baseline = 'v0.5.0'; game_started = $false; launcher_started = $false }

function Invoke-Installer([string]$Path, [string]$Arguments) {
    $observed = Start-PreviewChild -FilePath $Path -WorkingDirectory (Split-Path -Parent $Path) -Arguments $Arguments
    $child = $observed.Process
    try {
        if (!$child.WaitForExit(120000)) { throw 'Installer exceeded 120 seconds.' }
        if ($child.ExitCode -ne 0) { throw "Installer exited $($child.ExitCode)." }
    } finally {
        if (!$child.HasExited) { $child.Kill(); $null = $child.WaitForExit(5000) }
        $child.Dispose()
    }
}

function Get-ExpectedInstalledHash([string]$Path) {
    # Tauri patches the bundle marker before NSIS packaging, then restores the
    # loose binary. Match the entire installed file, allowing exactly that edit.
    # tauri-cli-v2.12.3/crates/tauri-bundler/src/bundle.rs: patch_binary
    $bytes = [IO.File]::ReadAllBytes($Path)
    $token = '__TAURI_BUNDLE_TYPE_VAR_UNK'
    $text = [Text.Encoding]::Latin1.GetString($bytes)
    $at = $text.IndexOf($token, [StringComparison]::Ordinal)
    if ($at -lt 0 -or $text.IndexOf($token, $at + 1, [StringComparison]::Ordinal) -ge 0) {
        throw 'Expected exactly one unpatched Tauri bundle marker.'
    }
    $replacement = [Text.Encoding]::ASCII.GetBytes('__TAURI_BUNDLE_TYPE_VAR_NSS')
    [Array]::Copy($replacement, 0, $bytes, $at, $replacement.Length)
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))
}

try {
    # Immutable published baseline; digest from its GitHub release asset metadata.
    $legacy = Join-Path $output 'legacy-setup.exe'
    Invoke-WebRequest -Uri 'https://github.com/afterhours-crew/afterhours-2015-launcher/releases/download/v0.5.0/Afterhours_0.5.0_x64-setup.exe' -OutFile $legacy
    $legacyHash = 'f8112dab96e8a92391e6436058eda5e6858b45996c03be00d08b1b87b7e87162'
    if ((Get-FileHash -LiteralPath $legacy).Hash.ToLowerInvariant() -cne $legacyHash) { throw 'Legacy installer digest mismatch.' }
    Invoke-Installer $legacy '/S'
    $oldName = (Get-ItemProperty -LiteralPath $registry).MainBinaryName
    if ($oldName -cne 'afterhours-launcher.exe') { throw "Unexpected legacy executable: $oldName" }
    if (!(Test-Path -LiteralPath (Join-Path $install 'Afterhours.exe') -PathType Leaf)) { throw 'Legacy server missing.' }

    # Synthetic data only. Preserve exact bytes through the updater's /UPDATE path.
    New-Item -ItemType Directory -Path $settingsDir, $dataDir | Out-Null
    $settings = Join-Path $settingsDir 'settings.json'
    @{ data_dir = $dataDir; updates = @{ mode = 'off' } } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $settings -Encoding UTF8
    $save = Join-Path $dataDir 'migration-sentinel.bin'
    [IO.File]::WriteAllBytes($save, [byte[]](1, 3, 5, 7, 9))
    $settingsHash = (Get-FileHash -LiteralPath $settings).Hash
    $saveHash = (Get-FileHash -LiteralPath $save).Hash
    $shell = New-Object -ComObject WScript.Shell
    $shortcuts = @(
        (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Afterhours.lnk'),
        (Join-Path ([Environment]::GetFolderPath('Programs')) 'Afterhours.lnk')
    )
    foreach ($link in $shortcuts) {
        if (!(Test-Path -LiteralPath $link) -or $shell.CreateShortcut($link).TargetPath -ine (Join-Path $install $oldName)) { throw 'Legacy shortcut missing or unexpected.' }
    }
    $candidates = @(Get-ChildItem -LiteralPath $InstallerDirectory -Filter '*.exe' -File)
    if ($candidates.Count -ne 1) { throw 'Expected exactly one candidate installer.' }
    Invoke-Installer $candidates[0].FullName '/S /UPDATE'
    if ((Get-ItemProperty -LiteralPath $registry).MainBinaryName -cne 'Afterhours2015Launcher.exe') { throw 'Main executable registration was not migrated.' }
    if (Test-Path -LiteralPath (Join-Path $install $oldName)) { throw 'Old main executable remains.' }
    $installedGui = Join-Path $install 'Afterhours2015Launcher.exe'
    $builtGui = Join-Path $root 'src-tauri/target/release/Afterhours2015Launcher.exe'
    if ((Get-FileHash -LiteralPath $installedGui).Hash -cne (Get-ExpectedInstalledHash $builtGui)) { throw 'Installed GUI differs from the expected NSIS-marked build.' }
    $pin = Get-Content -Raw -LiteralPath (Join-Path $root 'server-pin.json') | ConvertFrom-Json
    $server = Join-Path $install 'Afterhours2015Server.exe'
    if ((Get-FileHash -LiteralPath $server).Hash.ToLowerInvariant() -cne $pin.executable_sha256) { throw 'Installed server differs from the pin.' }
    foreach ($link in $shortcuts) {
        if ($shell.CreateShortcut($link).TargetPath -ine $installedGui) { throw 'Shortcut target was not migrated.' }
    }
    if ((Get-FileHash -LiteralPath $settings).Hash -cne $settingsHash -or (Get-FileHash -LiteralPath $save).Hash -cne $saveHash) { throw 'Settings or save bytes changed during update.' }
    if (Test-Path -LiteralPath (Join-Path $install 'portable.txt')) { throw 'Installer incorrectly carries the portable marker.' }
    $report.status = 'passed'
    $report.checks = @('legacy v0.5.0 installed', 'updater-mode install succeeded', 'old GUI removed', 'NSIS-marked GUI and pinned server hashes match', 'desktop and start-menu shortcuts migrated', 'settings and save bytes preserved', 'installed update mode retained')
    $report.candidate_sha256 = (Get-FileHash -LiteralPath $candidates[0].FullName).Hash.ToLowerInvariant()
} finally {
    $report.finished_utc = [DateTime]::UtcNow.ToString('o')
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'migration-check.json') -Encoding UTF8
}
