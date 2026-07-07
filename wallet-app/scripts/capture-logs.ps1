$ErrorActionPreference = "Stop"

$adb = "C:\Users\MSI\AppData\Local\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
  throw "adb not found at $adb"
}

$outFile = Join-Path $PSScriptRoot "..\logs\latest-emulator.log"
$logDir = Split-Path $outFile -Parent
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

Write-Host "Clearing logcat..."
& $adb logcat -c

Write-Host "Force-stopping com.moo.wallet..."
& $adb shell am force-stop com.moo.wallet

Write-Host "Launching app..."
& $adb shell monkey -p com.moo.wallet -c android.intent.category.LAUNCHER 1 | Out-Null

Start-Sleep -Seconds 4

Write-Host "Capturing logs to $outFile"
& $adb logcat -d | Select-String "MooBoot|MooApp|MooWallet|MooGlobalError|MooConsoleError|ReactNativeJS|AndroidRuntime|ExpoModulesCore|FATAL EXCEPTION|nativeFabricUIManager" | Out-File -FilePath $outFile -Encoding utf8

Write-Host "Done. Recent lines:"
Get-Content $outFile | Select-Object -Last 40
