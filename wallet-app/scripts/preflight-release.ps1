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
$defaultSdkDir = "C:\Users\MSI\AppData\Local\Android\Sdk"

Write-Host "== Moo wallet release preflight =="
Write-Host "App root: $appRoot"
Write-Host "Android dir: $androidDir"

if (-not (Test-Path $androidDir)) {
  throw "Android directory not found. Run expo prebuild first."
}

$sdkDir = $defaultSdkDir
$localPropertiesPath = Join-Path $androidDir "local.properties"
if (Test-Path $localPropertiesPath) {
  $localProperties = Get-Content $localPropertiesPath
  foreach ($line in $localProperties) {
    if ($line -like "sdk.dir=*") {
      $sdkDir = $line.Substring(8).Replace("\:", ":").Replace("\\", "\")
      break
    }
  }
}

if (-not (Test-Path $sdkDir)) {
  throw "Android SDK not found at $sdkDir"
}

$requiredSdkPaths = @(
  (Join-Path $sdkDir "platform-tools\adb.exe"),
  (Join-Path $sdkDir "cmake\3.22.1\bin\ninja.exe"),
  (Join-Path $sdkDir "ndk\26.1.10909125")
)

foreach ($path in $requiredSdkPaths) {
  if (-not (Test-Path $path)) {
    throw "Required Android tool missing: $path"
  }
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

$nodeChecks = @(
  "react-native/package.json",
  "@expo/cli",
  "hermes-parser",
  "babel-plugin-syntax-hermes-parser"
)

foreach ($moduleName in $nodeChecks) {
  $resolved = node -e "console.log(require.resolve('$moduleName'))" 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $resolved) {
    throw "Node could not resolve $moduleName from repo root"
  }
  Write-Host "Resolved $moduleName -> $resolved"
}

$longPathsEnabled = $null
try {
  $longPathsEnabled = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem").LongPathsEnabled
} catch {
  $longPathsEnabled = $null
}

if ($longPathsEnabled -eq 1) {
  Write-Host "Windows long paths: enabled"
} else {
  Write-Warning "Windows long paths are not enabled. The build script will use short paths and a junction as a workaround."
}

$existingShortRepo = Test-Path $shortRepoRoot
if ($existingShortRepo) {
  Write-Warning "$shortRepoRoot already exists. The build script may need it removed first."
} else {
  cmd /c "mklink /J `"$shortRepoRoot`" `"$repoRoot`""
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create short-path junction at $shortRepoRoot"
  }

  try {
    $shortAndroidDir = Join-Path $shortRepoRoot "wallet-app\android"
    if (-not (Test-Path $shortAndroidDir)) {
      throw "Junction android directory not found at $shortAndroidDir"
    }

    Write-Host "Created short-path junction at $shortRepoRoot"
    Push-Location $shortAndroidDir
    try {
      $env:GRADLE_USER_HOME = $gradleShortHome
      $env:TEMP = $tempShortHome
      $env:TMP = $tempShortHome
      cmd /c "gradlew.bat --no-daemon help -PreactNativeArchitectures=arm64-v8a"
      if ($LASTEXITCODE -ne 0) {
        throw "Gradle help smoke test failed"
      }
    } finally {
      Pop-Location
    }
  } finally {
    if (Test-Path $shortRepoRoot) {
      cmd /c "rmdir `"$shortRepoRoot`"" | Out-Null
    }
  }
}

Write-Host "Preflight passed."
