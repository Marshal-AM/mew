# Install debug APK on emulator only (no Metro). Run `npm start` after this.
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$gradleShortHome = "C:\g"
$tempShortHome = "C:\t"
$shortRepoRoot = "C:\mmoo"

foreach ($shortPath in @($gradleShortHome, $tempShortHome)) {
  if (-not (Test-Path $shortPath)) {
    New-Item -ItemType Directory -Path $shortPath | Out-Null
  }
}

$createdJunction = $false
if (-not (Test-Path $shortRepoRoot)) {
  cmd /c "mklink /J `"$shortRepoRoot`" `"$repoRoot`""
  if ($LASTEXITCODE -ne 0) { throw "Could not create junction at $shortRepoRoot" }
  $createdJunction = $true
}

try {
  Push-Location (Join-Path $shortRepoRoot "wallet-app\android")
  $env:NODE_ENV = "development"
  $env:GRADLE_USER_HOME = $gradleShortHome
  $env:TEMP = $tempShortHome
  $env:TMP = $tempShortHome

  cmd /c "gradlew.bat --no-daemon installDebug -PreactNativeArchitectures=x86_64"
  if ($LASTEXITCODE -ne 0) { throw "installDebug failed" }

  Write-Host "Debug app installed on emulator."
} finally {
  Pop-Location
  if ($createdJunction -and (Test-Path $shortRepoRoot)) {
    cmd /c "rmdir `"$shortRepoRoot`"" | Out-Null
  }
}
