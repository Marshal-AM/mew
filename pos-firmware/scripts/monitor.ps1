# Open serial monitor for ESP32-S3 - kills stale monitors, waits for USB, then connects.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$python = Join-Path $PWD ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Missing .venv. Run: python -m venv .venv" -ForegroundColor Red
    exit 1
}

Write-Host "Closing any open PlatformIO serial monitors..."
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "platformio device monitor" } |
    ForEach-Object {
        Write-Host "  stopping PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
Start-Sleep -Seconds 2

function Get-EspComPort {
    $names = [System.IO.Ports.SerialPort]::getportnames()
    if ($names.Count -gt 0) {
        foreach ($n in @("COM6", "COM5") + $names) {
            if ($names -contains $n) { return $n }
        }
        return $names[0]
    }
    return $null
}

Write-Host "Waiting for ESP32 USB (up to 45s). Plug in board if needed..."
$com = $null
for ($i = 0; $i -lt 45; $i++) {
    $com = Get-EspComPort
    if ($com) {
        try {
            $sp = New-Object System.IO.Ports.SerialPort $com, 115200
            $sp.Open()
            $sp.Close()
            $sp.Dispose()
            break
        } catch {
            $com = $null
        }
    }
    Start-Sleep -Seconds 1
    if (($i % 5) -eq 4) {
        $sec = $i + 1
        Write-Host "  still waiting... ${sec}s"
    }
}

if (-not $com) {
    Write-Host ""
    Write-Host "No ESP32 serial port available." -ForegroundColor Red
    Write-Host "Plug ESP32-S3 USB in and press EN, then re-run: .\scripts\monitor.ps1"
    exit 1
}

Write-Host ""
Write-Host "Connected on $com at 115200. Ctrl+C to quit."
Write-Host ""
& $python -m platformio device monitor -e esp32-s3-oled --port $com --baud 115200 --filter direct
