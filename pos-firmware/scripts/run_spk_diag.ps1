# Run MAX98357A speaker/amp diagnostic — kills port locks first.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Closing processes that may hold COM6..."
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -match "platformio device monitor|deep_diag\.py|spk_diag\.py|monitor\.ps1"
    } |
    ForEach-Object {
        Write-Host "  stopping PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
Start-Sleep -Seconds 2

$python = Join-Path $PWD ".venv\Scripts\python.exe"
$script = Join-Path $PWD "scripts\spk_diag.py"

if (-not (Test-Path $python)) {
    Write-Host "Missing .venv. Run: python -m venv .venv" -ForegroundColor Red
    exit 1
}

$env:PYTHONUNBUFFERED = "1"
& $python -u $script
exit $LASTEXITCODE
