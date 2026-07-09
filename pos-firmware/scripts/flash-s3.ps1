# Build (and optionally flash) Moo POS firmware for ESP32-S3.
#
# Test + build only (no upload):
#   .\scripts\flash-s3.ps1
#
# Test, build, then upload:
#   .\scripts\flash-s3.ps1 -Upload
#
# Skip tests (not recommended):
#   .\scripts\flash-s3.ps1 -Upload -SkipTests
param(
  [switch]$Upload,
  [switch]$SkipTests,
  [string]$Port = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$firmwareDir = Resolve-Path (Join-Path $scriptDir "..")
$python = Join-Path $firmwareDir ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
  throw "PlatformIO venv not found. Run: python -m venv .venv; .\.venv\Scripts\python.exe -m pip install platformio"
}

function Ensure-TestDeps {
  & $python -c "import qrcode" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing QR test dependency (qrcode)..." -ForegroundColor Yellow
    & $python -m pip install -r (Join-Path $scriptDir "requirements-test.txt")
    if ($LASTEXITCODE -ne 0) { throw "Failed to install test dependencies" }
  }
}

Push-Location $firmwareDir
try {
  Write-Host ""
  Write-Host "=== Moo POS - ESP32-S3 ===" -ForegroundColor Cyan
  Write-Host ""

  if (-not $SkipTests) {
    Write-Host "Step 1/3: QR layout test (terminal preview)..." -ForegroundColor Yellow
    Ensure-TestDeps
    & $python (Join-Path $scriptDir "test_qr_layout.py")
    if ($LASTEXITCODE -ne 0) { throw "QR layout test failed - fix before flashing" }
    Write-Host ""
  } else {
    Write-Host "Skipping QR layout tests (-SkipTests)." -ForegroundColor DarkYellow
    Write-Host ""
  }

  Write-Host "Step 2/3: Building firmware..." -ForegroundColor Yellow
  & $python -m platformio run -e esp32-s3-oled
  if ($LASTEXITCODE -ne 0) { throw "Build failed" }

  if (-not $Upload) {
    Write-Host ""
    Write-Host "Build OK. Board was NOT flashed." -ForegroundColor Green
    Write-Host "Review the ASCII QR preview above, then run:" -ForegroundColor Green
    Write-Host "  .\scripts\flash-s3.ps1 -Upload" -ForegroundColor Green
    exit 0
  }

  Write-Host ""
  Write-Host "Step 3/3: Uploading to board..." -ForegroundColor Yellow
  Write-Host "If upload fails: hold BOOT, tap RST, keep holding BOOT until 'Writing...' appears."
  Write-Host ""
  & $python -m platformio device list
  Write-Host ""

  $uploadArgs = @("-m", "platformio", "run", "-e", "esp32-s3-oled", "-t", "upload")
  if ($Port) {
    $uploadArgs += @("--upload-port", $Port)
  }

  & $python @uploadArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Upload failed. Try again:" -ForegroundColor Red
    Write-Host "  .\scripts\flash-s3.ps1 -Upload"
    exit 1
  }

  Write-Host ""
  Write-Host "Flash OK. Opening serial monitor (Ctrl+C to exit)..." -ForegroundColor Green
  $monitorArgs = @("-m", "platformio", "device", "monitor", "-e", "esp32-s3-oled")
  if ($Port) {
    $monitorArgs += @("--port", $Port)
  }
  & $python @monitorArgs
} finally {
  Pop-Location
}
