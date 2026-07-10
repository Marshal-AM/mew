# Run deep mic diagnostic — kills port locks first, optional admin elevation.
param(
    [switch]$Admin
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Closing processes that may hold COM6..."
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -match "platformio device monitor|deep_diag\.py|monitor\.ps1"
    } |
    ForEach-Object {
        Write-Host "  stopping PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
Start-Sleep -Seconds 2

$python = Join-Path $PWD ".venv\Scripts\python.exe"
$script = Join-Path $PWD "scripts\deep_diag.py"

if ($Admin) {
    $arg = "-ExecutionPolicy Bypass -NoProfile -Command `"Set-Location '$PWD'; & '$python' '$script'`""
    Write-Host "Launching elevated PowerShell (approve UAC prompt)..."
    Start-Process powershell -Verb RunAs -ArgumentList $arg
    exit 0
}

$env:PYTHONUNBUFFERED = "1"
Write-Host "Starting deep_diag.py (unbuffered)..."
Write-Host "  python: $python"
Write-Host "  script: $script"
& $python -u $script
$code = $LASTEXITCODE
Write-Host "deep_diag.py exited with code $code"
exit $code
