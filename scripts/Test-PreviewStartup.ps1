# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Destructive to a disposable runner's preview installation only. Never run on
# a developer/owner machine. No game, save, input synthesis or security changes.
param(
    [Parameter(Mandatory)][string]$InstallerDirectory,
    [Parameter(Mandatory)][string]$PortableDirectory,
    [Parameter(Mandatory)][string]$PreviewInput,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or $env:RUNNER_OS -cne 'Windows') {
    throw 'Startup smoke is restricted to disposable GitHub-hosted Windows runners.'
}
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Choose a new evidence folder.' }
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$output = (Resolve-Path -LiteralPath $OutputDirectory).Path
$distribution = Get-Content -Raw -LiteralPath (Join-Path $PreviewInput 'tauri-preview.json') | ConvertFrom-Json
if ($distribution.identifier -cne 'crew.afterhours.launcher.prologue-preview' -or $distribution.productName -cne 'Afterhours Prologue Preview') {
    throw 'This smoke only handles the isolated preview distribution.'
}
$install = Join-Path $env:LOCALAPPDATA $distribution.productName
$local = Join-Path $env:LOCALAPPDATA $distribution.identifier
$config = Join-Path $env:APPDATA $distribution.identifier
$report = [ordered]@{ version = 1; started_utc = [DateTime]::UtcNow.ToString('o'); status = 'failed'; stage = 'freshness'; checks = @(); game_started = $false }
$expected = Get-Content -Raw -LiteralPath (Join-Path $PreviewInput 'input/build-info.json') | ConvertFrom-Json

function Test-Server([string]$Directory) {
    $server = Join-Path $Directory 'Afterhours.exe'
    if ((Get-FileHash -LiteralPath $server -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected.executable_sha256) {
        throw 'The packaged server differs from the selected candidate.'
    }
    foreach ($name in @('LICENSE', 'THIRD-PARTY-NOTICES.txt', 'build-info.json')) {
        $actual = (Get-FileHash -LiteralPath (Join-Path $Directory "afterhours-server/$name") -Algorithm SHA256).Hash
        $wanted = (Get-FileHash -LiteralPath (Join-Path $PreviewInput "input/$name") -Algorithm SHA256).Hash
        if ($actual -cne $wanted) { throw "Packaged server metadata differs: $name" }
    }
    $identity = (& $server version --json | Out-String) | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $identity.release -cne $expected.release) { throw 'Packaged CLI identity failed.' }
}

function Test-Window([string]$Executable, [string]$Name) {
    $child = $null
    try {
        $child = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output "$Name.stdout.log") -RedirectStandardError (Join-Path $output "$Name.stderr.log")
        $deadline = [DateTime]::UtcNow.AddSeconds(60)
        $wizard = $false
        $names = @()
        while ([DateTime]::UtcNow -lt $deadline) {
            $child.Refresh()
            if ($child.HasExited) { throw "$Name exited before the wizard: $($child.ExitCode)" }
            if ($child.MainWindowHandle -ne [IntPtr]::Zero) {
                $window = [System.Windows.Automation.AutomationElement]::FromHandle($child.MainWindowHandle)
                $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Find your game')
                $heading = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
                if ($null -ne $heading -and !$heading.Current.IsOffscreen) {
                    $all = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
                    $names = @($all | ForEach-Object { $_.Current.Name } | Where-Object { $_ } | Select-Object -First 150)
                    if (@($names | Where-Object { $_ -like '*bundled server is missing*' }).Count -gt 0) { throw "$Name cannot find its bundled server." }
                    $wizard = $true
                    break
                }
            }
            Start-Sleep -Milliseconds 500
        }
        $names | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output "$Name-accessibility.json") -Encoding UTF8
        if (!$wizard) { throw "$Name did not expose the visible first-run heading within 60 seconds." }
        # A dialog/process handle alone is not success. This asserts the real
        # embedded first-run UI, then closes normally without completing it.
        if (!$child.CloseMainWindow()) { throw "$Name refused a normal close." }
        if (!$child.WaitForExit(15000)) { throw "$Name did not close within 15 seconds." }
        if ($child.ExitCode -ne 0) { throw "$Name closed with $($child.ExitCode)." }
        $report.checks += [ordered]@{ distribution = $Name; first_run_heading = 'Find your game'; normal_exit = $child.ExitCode; executable_sha256 = (Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLowerInvariant() }
    } finally {
        if ($null -ne $child -and !$child.HasExited) {
            # This PID belongs to this invocation on the disposable runner.
            Stop-Process -Id $child.Id -Force
        }
    }
}

try {
    foreach ($path in @($install, $local, $config)) {
        if (Test-Path -LiteralPath $path) { throw "Not a fresh preview environment: $path" }
    }
    $registry = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$($distribution.productName)"
    if (Test-Path -LiteralPath $registry) { throw 'Preview is already registered.' }
    $installers = @(Get-ChildItem -LiteralPath $InstallerDirectory -Filter '*.exe' -File)
    if ($installers.Count -ne 1) { throw 'Expected exactly one installer.' }
    $report.installer_sha256 = (Get-FileHash -LiteralPath $installers[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $report.stage = 'install'
    $installer = Start-Process -FilePath $installers[0].FullName -ArgumentList @('/S', '/NS') -WindowStyle Hidden -PassThru
    if (!$installer.WaitForExit(120000)) {
        Stop-Process -Id $installer.Id -Force
        throw 'Silent installer exceeded 120 seconds.'
    }
    $report.installer_exit = $installer.ExitCode
    if ($installer.ExitCode -ne 0) { throw "Installer exited $($installer.ExitCode)." }
    if (!(Test-Path -LiteralPath $registry)) { throw 'Installer did not register the preview.' }
    Test-Server $install
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $report.stage = 'installed wizard'
    Test-Window (Join-Path $install 'afterhours-launcher.exe') 'installed'
    $report.stage = 'portable extraction'
    $zips = @(Get-ChildItem -LiteralPath $PortableDirectory -Filter '*.zip' -File)
    if ($zips.Count -ne 1) { throw 'Expected exactly one portable ZIP.' }
    $unpacked = Join-Path $env:RUNNER_TEMP 'preview-unpacked'
    if (Test-Path -LiteralPath $unpacked) { throw 'Portable extraction directory already exists.' }
    Expand-Archive -LiteralPath $zips[0].FullName -DestinationPath $unpacked
    Test-Server $unpacked
    $report.stage = 'portable wizard'
    Test-Window (Join-Path $unpacked 'Afterhours Launcher.exe') 'portable'
    $report.status = 'passed'
    $report.stage = 'complete'
} catch {
    $report.error = $_.Exception.Message
    throw
} finally {
    # Fresh disposable profile only; no settings/save contents are uploaded.
    $diagnostics = @((Join-Path $local 'startup-error.json'), (Join-Path $env:TEMP "afterhours-$($distribution.identifier)-startup-error.json"))
    foreach ($path in $diagnostics) {
        if (Test-Path -LiteralPath $path) { Copy-Item -LiteralPath $path -Destination (Join-Path $output ([IO.Path]::GetFileName($path))) }
    }
    $report.finished_utc = [DateTime]::UtcNow.ToString('o')
    $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $output 'startup-check.json') -Encoding UTF8
}
