# Start-Process on Windows PowerShell can return a Process whose ExitCode is
# null after the GUI closes. Own the original process handle and drain both
# pipes immediately; callers retain the exit result and diagnostics.
function Start-PreviewChild([string]$FilePath, [string]$WorkingDirectory, [string]$Arguments = '') {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $FilePath
    $info.WorkingDirectory = $WorkingDirectory
    $info.Arguments = $Arguments
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $child = [System.Diagnostics.Process]::Start($info)
    $null = $child.Handle
    [pscustomobject]@{
        Process = $child
        Stdout = $child.StandardOutput.ReadToEndAsync()
        Stderr = $child.StandardError.ReadToEndAsync()
    }
}
