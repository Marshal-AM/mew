$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$androidDir = Join-Path $appRoot "android"
$appAndroidDir = Join-Path $androidDir "app"
$repoRoot = (Resolve-Path (Join-Path $appRoot "..")).Path
$expoModulesCoreAndroidDir = Join-Path $repoRoot "node_modules\expo-modules-core\android"
$gradleShortHome = "C:\g"
$tempShortHome = "C:\t"
$shortRepoRoot = "C:\mmoo"
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

foreach ($generatedPath in @(
  (Join-Path $androidDir "build"),
  (Join-Path $appAndroidDir "build"),
  (Join-Path $expoModulesCoreAndroidDir "build"),
  (Join-Path $expoModulesCoreAndroidDir ".cxx")
)) {
  if (Test-Path $generatedPath) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $generatedPath
  }
}

Write-Host "Running preflight..."
powershell -ExecutionPolicy Bypass -File (Join-Path $scriptDir "preflight-release.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Preflight failed."
}

if (Test-Path $shortRepoRoot) {
  throw "Short-path junction $shortRepoRoot already exists. Remove it and retry."
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

  Push-Location $shortAndroidDir
  try {
    $env:NODE_ENV = "production"
    $env:GRADLE_USER_HOME = $gradleShortHome
    $env:TEMP = $tempShortHome
    $env:TMP = $tempShortHome

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

  Write-Host "Release APK ready:"
  Write-Host $apkPath
} finally {
  if (Test-Path $shortRepoRoot) {
    cmd /c "rmdir `"$shortRepoRoot`"" | Out-Null
  }
}
