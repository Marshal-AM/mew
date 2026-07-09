# Flash standalone QR keypad test to ESP32-S3
$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$parent = Resolve-Path (Join-Path $here "..")
$python = Join-Path $parent ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
  throw "Run from pos-firmware: python -m venv .venv && .\.venv\Scripts\python.exe -m pip install platformio"
}

Push-Location $here
try {
  Write-Host ""
  Write-Host "=== QR keypad test firmware ===" -ForegroundColor Cyan
  Write-Host "Type text on keypad, press # to show QR, * to clear."
  Write-Host ""

  & $python -m platformio device list
  Write-Host ""

  & $python -m platformio run -t upload
  if ($LASTEXITCODE -ne 0) { exit 1 }

  Write-Host ""
  Write-Host "Flash OK. Serial monitor (Ctrl+C to exit)..." -ForegroundColor Green
  & $python -m platformio device monitor
} finally {
  Pop-Location
}
