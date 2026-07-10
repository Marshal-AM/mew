# Start local Supabase + serve edge functions for POS/ngrok dev.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$envFile = Join-Path $PWD ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "Create backend/.env with SUPABASE keys (see supabase status after start)." -ForegroundColor Yellow
}

Write-Host "Starting Supabase local stack (if not already running)..."
npx supabase start 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "Supabase status:"
npx supabase status 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "Serving edge functions on http://127.0.0.1:54321/functions/v1/ ..."
Write-Host "Press Ctrl+C to stop functions serve (Supabase stack keeps running)."
Write-Host ""

$serveArgs = @("supabase", "functions", "serve", "--env-file", ".env")
if (Test-Path $envFile) {
    npx @serveArgs
} else {
    npx supabase functions serve
}
