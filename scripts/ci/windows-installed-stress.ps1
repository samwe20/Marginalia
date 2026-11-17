# Install Marginalia NSIS artifact, generate a large stress library, run WebdriverIO stress suite.
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$installerPath = $env:INSTALLER_PATH
if ($installerPath -and (Test-Path $installerPath)) {
  $installer = Get-Item $installerPath
} else {
  $installer = Get-ChildItem -Path $repoRoot -Filter "*-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $installer) { throw "Set INSTALLER_PATH or place *-setup.exe in repo root" }

$tauriConfig = Get-Content (Join-Path $repoRoot "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$bundleId = $tauriConfig.identifier
$installDir = Join-Path $env:LOCALAPPDATA "MarginaliaStress"
$roamingAppData = Join-Path $env:APPDATA $bundleId
$localAppData = Join-Path $env:LOCALAPPDATA $bundleId
$libraryRoot = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "MarginaliaStressLibrary"
$resultsDir = Join-Path $repoRoot "test-results\desktop-stress"

function Invoke-MarginaliaInstaller {
  param([string]$Label)
  $process = Start-Process -FilePath $installer.FullName -ArgumentList "/S", "/D=$installDir" -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "$Label installer exited with $($process.ExitCode)"
  }
}

foreach ($path in @($installDir, $roamingAppData, $localAppData, $libraryRoot, $resultsDir)) {
  if (Test-Path $path) { Remove-Item -Recurse -Force $path }
}
New-Item -ItemType Directory -Force -Path $installDir, $resultsDir | Out-Null

Write-Host "Generating stress library at $libraryRoot"
Push-Location $repoRoot
try {
  node (Join-Path $repoRoot "scripts\ci\generate-stress-library.mjs") $libraryRoot
  if ($LASTEXITCODE -ne 0) {
    throw "generate-stress-library.mjs exited with $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$manifestPath = Join-Path $libraryRoot "manifest.json"
if (-not (Test-Path $manifestPath)) {
  throw "manifest.json missing after library generation"
}

Write-Host "Install NSIS to $installDir"
Invoke-MarginaliaInstaller "Stress install"

$appExe = Get-ChildItem -Path $installDir -Recurse -Filter "Marginalia.exe" | Select-Object -First 1
if (-not $appExe) {
  $appExe = Get-ChildItem -Path $installDir -Recurse -Filter "*.exe" | Where-Object { $_.Name -notmatch "unins" } | Select-Object -First 1
}
if (-not $appExe) { throw "Installed Marginalia.exe not found under $installDir" }

$env:MARGINALIA_APP_EXE = $appExe.FullName
$env:MARGINALIA_SMOKE_LIBRARY = $libraryRoot
$env:MARGINALIA_STRESS_MANIFEST = $manifestPath
$env:MARGINALIA_SMOKE = "1"
$env:MARGINALIA_SMOKE_DEFER_LIBRARY = "1"
$env:SMOKE_ARTIFACTS_DIR = $resultsDir

Write-Host "App: $($appExe.FullName)"
Write-Host "Library: $libraryRoot"

Push-Location $repoRoot
try {
  if (-not (Get-Command tauri-driver -ErrorAction SilentlyContinue)) {
    cargo install tauri-driver --locked
  }
  # WDIO before() aborts the Node process if the suite exceeds this.
  $env:MARGINALIA_STRESS_SUITE_TIMEOUT_MS = "3600000" # 60 minutes
  npm run test:desktop-stress
  if ($LASTEXITCODE -ne 0) {
    throw "test:desktop-stress exited with $LASTEXITCODE"
  }

  $metricsJson = Join-Path $resultsDir "stress-metrics.json"
  $resultsJson = Join-Path $resultsDir "stress-results.json"
  if (-not (Test-Path $metricsJson)) {
    throw "stress-metrics.json missing at $metricsJson"
  }
  if (-not (Test-Path $resultsJson)) {
    throw "stress-results.json missing at $resultsJson"
  }

  $rows = Get-Content $resultsJson -Raw | ConvertFrom-Json
  $failed = @($rows | Where-Object { -not $_.ok })
  if ($failed.Count -gt 0) {
    foreach ($f in $failed) {
      Write-Host "::error::$($f.id) $($f.name): $($f.detail)"
    }
    throw "$($failed.Count) stress case(s) failed (see stress-results.json)"
  }

  $metrics = Get-Content $metricsJson -Raw | ConvertFrom-Json
  Write-Host "Stress metrics: $($metrics | ConvertTo-Json -Compress)"
  if ($null -ne $metrics.ok -and -not $metrics.ok) {
    throw "stress-metrics.json reports ok=false"
  }
} finally {
  Pop-Location
}
