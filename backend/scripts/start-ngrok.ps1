# Tunnel local Supabase API (port 54321) via ngrok.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Read-DotEnvValue([string]$name) {
    $path = Join-Path $PWD ".env"
    if (-not (Test-Path $path)) { return $null }
    foreach ($line in Get-Content $path) {
        if ($line -match "^\s*$name\s*=\s*(.+)\s*$") {
            return $matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

$token = Read-DotEnvValue "NGROK_AUTH_TOKEN"
if (-not $token) {
    Write-Host "NGROK_AUTH_TOKEN not found in backend/.env" -ForegroundColor Red
    exit 1
}

$ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrok) {
    Write-Host "ngrok not on PATH. Install from https://ngrok.com/download" -ForegroundColor Red
    exit 1
}

Write-Host "Configuring ngrok authtoken..."
& ngrok config add-authtoken $token 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "Tunneling http://127.0.0.1:54321"
Write-Host "Use the HTTPS forwarding URL in pos-firmware/platformio.ini:"
Write-Host "  SUBMIT_URL=https://<host>/functions/v1/submit-transaction"
Write-Host "  POS_PRODUCTS_URL=https://<host>/functions/v1/pos-products"
Write-Host "  VOICE_QUERY_URL=https://<host>/functions/v1/voice-query"
Write-Host ""

& ngrok http 54321
