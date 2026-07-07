$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$repoRoot = (Resolve-Path (Join-Path $appRoot "..")).Path
$shortWorkspaceRoot = "C:\m"
$shortWalletRoot = Join-Path $shortWorkspaceRoot "wallet-app"
$gradleShortHome = "C:\g"
$tempShortHome = "C:\t"

foreach ($path in @($shortWorkspaceRoot, $gradleShortHome, $tempShortHome)) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path | Out-Null
  }
}

$mirrorDirs = @(
  "wallet-app",
  "node_modules",
  ".npmrc"
)

foreach ($entry in $mirrorDirs) {
  $source = Join-Path $repoRoot $entry
  $target = Join-Path $shortWorkspaceRoot $entry

  if (-not (Test-Path $source)) {
    continue
  }

  if (Test-Path $target) {
    Remove-Item -Recurse -Force $target
  }

  if ((Get-Item $source).PSIsContainer) {
    cmd /c "mklink /J `"$target`" `"$source`"" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Could not create junction for $source"
    }
  } else {
    Copy-Item $source $target -Force
  }
}

Write-Host "Checking path budget..."
powershell -ExecutionPolicy Bypass -File (Join-Path $scriptDir "check-path-budget.ps1") $shortWorkspaceRoot $gradleShortHome $tempShortHome 260
if ($LASTEXITCODE -ne 0) {
  throw "Path budget exceeds 260 characters. Aborting build."
}

Push-Location $shortWalletRoot
try {
  $env:NODE_ENV = "production"
  $env:GRADLE_USER_HOME = $gradleShortHome
  $env:TEMP = $tempShortHome
  $env:TMP = $tempShortHome
  cmd /c "npm run build:apk"
  if ($LASTEXITCODE -ne 0) {
    throw "Relocated release build failed."
  }
} finally {
  Pop-Location
}
