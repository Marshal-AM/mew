$ErrorActionPreference = "Stop"

$RepoRoot = if ($args.Length -ge 1 -and $args[0]) { $args[0] } else { "C:\m" }
$GradleHome = if ($args.Length -ge 2 -and $args[1]) { $args[1] } else { "C:\g" }
$TempRoot = if ($args.Length -ge 3 -and $args[2]) { $args[2] } else { "C:\t" }
$Limit = if ($args.Length -ge 4 -and $args[3]) { [int]$args[3] } else { 260 }

$observedTempCacheRoot = "C:\Users\MSI\AppData\Local\Temp\cursor-sandbox-cache\e29afc823603ccd41e7c0208f6765b06"
$transformHash = "39112f360b4d33c8c9c78b2a3f037265"

$paths = @(
  @{
    name = "repoRoot"
    path = $RepoRoot
  },
  @{
    name = "gradleHome"
    path = $GradleHome
  },
  @{
    name = "tempRoot"
    path = $TempRoot
  },
  @{
    name = "cxxBuildPath"
    path = Join-Path $RepoRoot "node_modules\expo-modules-core\android\.cxx\RelWithDebInfo\l5c2p3r1\arm64-v8a"
  },
  @{
    name = "projectPrefabPath"
    path = Join-Path $GradleHome "caches\8.10.2\transforms\$transformHash\transformed\react-android-0.76.9-release\prefab\modules\reactnative\include\boost\preprocessor\control\expr_iif.hpp"
  },
  @{
    name = "cursorSandboxPrefabPath"
    path = Join-Path $observedTempCacheRoot "gradle\caches\8.10.2\transforms\$transformHash\transformed\react-android-0.76.9-release\prefab\modules\reactnative\include\boost\preprocessor\control\expr_iif.hpp"
  }
)

$rows = foreach ($item in $paths) {
  [pscustomobject]@{
    Name = $item.name
    Length = $item.path.Length
    WithinLimit = ($item.path.Length -le $Limit)
    Path = $item.path
  }
}

$rows | ForEach-Object {
  Write-Host ("{0} | len={1} | withinLimit={2}" -f $_.Name, $_.Length, $_.WithinLimit)
  Write-Host $_.Path
}

$max = ($rows | Sort-Object Length -Descending | Select-Object -First 1)
Write-Host ("MAX_PATH_LENGTH={0}" -f $max.Length)
Write-Host ("MAX_PATH_NAME={0}" -f $max.Name)

if ($max.Length -le $Limit) {
  Write-Host "PATH_BUDGET_OK"
  exit 0
}

Write-Host "PATH_BUDGET_EXCEEDED"
exit 1
