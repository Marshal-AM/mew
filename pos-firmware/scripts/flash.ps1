# Flash esp32-s3-oled — close monitors, wait for USB, retry upload.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$python = Join-Path $PWD ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Missing .venv" -ForegroundColor Red
    exit 1
}

Write-Host "Closing PlatformIO serial monitors..."
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "platformio device monitor" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

function Get-EspPort {
    foreach ($com in @("COM6", "COM5")) {
        if (-not ([System.IO.Ports.SerialPort]::getportnames() -contains $com)) { continue }
        try {
            $sp = New-Object System.IO.Ports.SerialPort $com, 115200
            $sp.Open()
            $sp.Close()
            $sp.Dispose()
            return $com
        } catch { }
    }
    return $null
}

Write-Host "Waiting for ESP32 USB port (up to 60s)..."
$port = $null
for ($i = 0; $i -lt 60; $i++) {
    $port = Get-EspPort
    if ($port) { break }
    Start-Sleep -Seconds 1
    if (($i % 10) -eq 9) { Write-Host "  still waiting... ($($i + 1)s)" }
}

if (-not $port) {
    Write-Host "No ESP32 port found. Plug in USB and press EN, then re-run." -ForegroundColor Red
    exit 1
}

Write-Host "Flashing on $port..."
for ($attempt = 1; $attempt -le 3; $attempt++) {
    Write-Host "Upload attempt $attempt/3..."
    & $python -m platformio run -e esp32-s3-oled -t upload --upload-port $port
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Flash OK on $port" -ForegroundColor Green
        exit 0
    }
  Write-Host "Retrying in 3s (press EN on board if it fails again)..."
    Start-Sleep -Seconds 3
    $port = Get-EspPort
    if (-not $port) { $port = "COM6" }
}

Write-Host "Flash failed after 3 attempts." -ForegroundColor Red
exit 1
