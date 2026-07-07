# One-time (or after native dependency changes): install a DEBUG build on the emulator.
# After that, run `npm start` in wallet-app — JS changes reload in seconds, no APK rebuild.
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$repoRoot = (Resolve-Path (Join-Path $appRoot "..")).Path
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
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create junction at $shortRepoRoot"
  }
  $createdJunction = $true
}

try {
  $shortAndroidDir = Join-Path $shortRepoRoot "wallet-app\android"
  Push-Location $shortAndroidDir
  try {
    $env:NODE_ENV = "development"
    $env:GRADLE_USER_HOME = $gradleShortHome
    $env:TEMP = $tempShortHome
    $env:TMP = $tempShortHome

  Write-Host "Building and installing DEBUG app on emulator (first run may take several minutes)..."
  cmd /c "gradlew.bat --no-daemon installDebug -PreactNativeArchitectures=x86_64"
    if ($LASTEXITCODE -ne 0) {
      throw "Debug install failed."
    }
  } finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "Debug app installed. Starting Metro bundler..."
  Write-Host "Leave this running. Edit JS/TS files and press 'r' in this terminal to reload."
  Write-Host ""

  Push-Location (Join-Path $shortRepoRoot "wallet-app")
  try {
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = "127.0.0.1"
    & "C:\Users\MSI\AppData\Local\Android\Sdk\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
    npx expo start --dev-client
  } finally {
    Pop-Location
  }
} finally {
  if ($createdJunction -and (Test-Path $shortRepoRoot)) {
    cmd /c "rmdir `"$shortRepoRoot`"" | Out-Null
  }
}
