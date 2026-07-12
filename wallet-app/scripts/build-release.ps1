$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$androidDir = Join-Path $appRoot "android"
$repoRoot = (Resolve-Path (Join-Path $appRoot "..")).Path
$gradleShortHome = "C:\g"
$tempShortHome = "C:\t"
$shortRepoRoot = "C:\mmoo"
$distDir = Join-Path $appRoot "dist"
$distApk = Join-Path $distDir "MooPay-release.apk"
$architecturesArg = if ($env:REACT_NATIVE_ARCHITECTURES -and $env:REACT_NATIVE_ARCHITECTURES.Trim().Length -gt 0) {
  " -PreactNativeArchitectures=$($env:REACT_NATIVE_ARCHITECTURES.Trim())"
} else {
  ""
}

foreach ($shortPath in @($gradleShortHome, $tempShortHome)) {
  if (-not (Test-Path $shortPath)) {
    New-Item -ItemType Directory -Path $shortPath | Out-Null
  }
}

Write-Host "Running preflight..."
powershell -ExecutionPolicy Bypass -File (Join-Path $scriptDir "preflight-release.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Preflight failed."
}

if (Test-Path $shortRepoRoot) {
  Write-Host "Removing existing junction at $shortRepoRoot"
  cmd /c "rmdir `"$shortRepoRoot`"" | Out-Null
}

cmd /c "mklink /J `"$shortRepoRoot`" `"$repoRoot`""
if ($LASTEXITCODE -ne 0) {
  throw "Could not create short-path junction at $shortRepoRoot"
}

try {
  $shortAndroidDir = Join-Path $shortRepoRoot "wallet-app\android"
  if (-not (Test-Path $shortAndroidDir)) {
    throw "Junction android directory not found at $shortAndroidDir"
  }

  # Force short Gradle/temp homes. Unset Cursor sandbox GRADLE_USER_HOME if present.
  $env:NODE_ENV = "production"
  $env:GRADLE_USER_HOME = $gradleShortHome
  $env:TEMP = $tempShortHome
  $env:TMP = $tempShortHome
  Remove-Item Env:GRADLE_OPTS -ErrorAction SilentlyContinue

  Write-Host ""
  Write-Host "== Building release APK from short junction path =="
  Write-Host "GRADLE_USER_HOME=$env:GRADLE_USER_HOME"
  Write-Host "Android dir=$shortAndroidDir"

  Push-Location $shortAndroidDir
  try {
    # Single Gradle invocation so transform caches stay consistent.
    # Metro uses realpath project root via android/app/build.gradle.
    cmd /c "gradlew.bat --no-daemon --stop"
    cmd /c "gradlew.bat --no-daemon clean assembleRelease$architecturesArg"
    if ($LASTEXITCODE -ne 0) {
      throw "Release build failed."
    }
  } finally {
    Pop-Location
  }

  $apkPath = Join-Path $shortAndroidDir "app\build\outputs\apk\release\app-release.apk"
  if (-not (Test-Path $apkPath)) {
    throw "Release APK not found at $apkPath"
  }

  if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir | Out-Null
  }
  Copy-Item -Force $apkPath $distApk

  Write-Host ""
  Write-Host "Release APK ready:"
  Write-Host $distApk
  Write-Host "Size: $((Get-Item $distApk).Length) bytes"
} finally {
  if (Test-Path $shortRepoRoot) {
    cmd /c "rmdir `"$shortRepoRoot`"" | Out-Null
  }
}
