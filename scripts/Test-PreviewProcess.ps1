$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'lib/preview-process.ps1')
# Real child exit/pipe regression for the smoke harness, without any GUI or
# installer. Check both success and failure so a missing exit cannot pass.
foreach ($exit in @(0, 7)) {
    $observed = Start-PreviewChild -FilePath (Join-Path $env:SystemRoot 'System32/cmd.exe') -WorkingDirectory $env:TEMP -Arguments "/d /c echo stdout& echo stderr 1>&2& exit $exit"
    $child = $observed.Process
    try {
        if (!$child.WaitForExit(5000)) { throw 'Child exit control timed out.' }
        if ($null -eq $child.ExitCode -or $child.ExitCode -ne $exit) { throw "Lost exit code $exit." }
        if ($observed.Stdout.Result.Trim() -cne 'stdout' -or $observed.Stderr.Result.Trim() -cne 'stderr') { throw 'Lost child output.' }
    } finally {
        if (!$child.HasExited) { $child.Kill(); $child.WaitForExit() }
        $child.Dispose()
    }
}
'Child exit 0/nonzero and both diagnostic streams pass.'
