# Install Marginalia NSIS artifact, launch via tauri-driver, run WebdriverIO smoke tests.
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
$productName = $tauriConfig.productName
$installDir = Join-Path $env:LOCALAPPDATA "MarginaliaSmoke"
$roamingAppData = Join-Path $env:APPDATA $bundleId
$localAppData = Join-Path $env:LOCALAPPDATA $bundleId
$libraryRoot = Join-Path $env:LOCALAPPDATA "MarginaliaSmokeLibrary"
$libraryMarker = Join-Path $libraryRoot "library-never-delete.marker"
$resultsDir = Join-Path $repoRoot "test-results\desktop-smoke"
$safetyRegistry = "HKCU:\Software\$bundleId"
$uninstallRegistry = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$productName"

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
if (Test-Path $safetyRegistry) { Remove-Item -Recurse -Force $safetyRegistry }
New-Item -ItemType Directory -Force -Path $installDir, $libraryRoot, $resultsDir | Out-Null

$shelfDir = Join-Path $libraryRoot "shelf"
New-Item -ItemType Directory -Force -Path $shelfDir | Out-Null
Copy-Item (Join-Path $repoRoot "tests/fixtures/sample.pdf") $shelfDir
Copy-Item (Join-Path $repoRoot "tests/fixtures/sample.epub") $libraryRoot
Copy-Item (Join-Path $repoRoot "tests/fixtures/sample.mobi") $libraryRoot
Set-Content -LiteralPath $libraryMarker -Value "NEVER DELETE USER LIBRARY" -NoNewline

Write-Host "Seed previous installation at $installDir"
Invoke-MarginaliaInstaller "Initial"
if (-not (Test-Path $uninstallRegistry)) {
  throw "Per-user uninstall registry key missing after initial install: $uninstallRegistry"
}
$registeredInstallDir = [string](Get-ItemProperty -Path $uninstallRegistry -Name "InstallLocation").InstallLocation
if ($registeredInstallDir.Trim('"') -ne $installDir) {
  throw "Per-user uninstall key points to '$registeredInstallDir', expected '$installDir'"
}
if (Get-Process -Name $productName -ErrorAction SilentlyContinue) {
  throw "Silent installer unexpectedly left Marginalia running and locking the installation"
}
$oldInstallMarker = Join-Path $installDir "old-install.marker"
Set-Content -LiteralPath $oldInstallMarker -Value "must disappear through silent uninstall" -NoNewline

# Simulate every stale app-owned location that a clean install must wipe.
New-Item -ItemType Directory -Force -Path $roamingAppData | Out-Null
Set-Content -LiteralPath (Join-Path $roamingAppData "marginalia-prefs.json") -Value '{"stale":true}'
New-Item -ItemType Directory -Force -Path (Join-Path $localAppData "EBWebView\Default\Local Storage"), (Join-Path $localAppData "cover-cache") | Out-Null
Set-Content -LiteralPath (Join-Path $localAppData "EBWebView\Default\Local Storage\stale.localstorage") -Value "stale"
Set-Content -LiteralPath (Join-Path $localAppData "cover-cache\stale-cover.png") -Value "stale"

# The app writes this value whenever a library is selected. The installer consumes it
# only as a deletion guard, then removes it with the rest of the old preferences.
New-Item -Path $safetyRegistry -Force | Out-Null
Set-ItemProperty -Path $safetyRegistry -Name "LibraryRoot" -Value $libraryRoot

Write-Host "Clean reinstall: previous app must uninstall; AppData must reset; library must survive"
Invoke-MarginaliaInstaller "Clean reinstall"

$cleanProof = [ordered]@{
  previousInstallMarkerRemoved = -not (Test-Path $oldInstallMarker)
  roamingAppDataRemoved = -not (Test-Path $roamingAppData)
  localAppDataRemoved = -not (Test-Path $localAppData)
  libraryMarkerPreserved = Test-Path $libraryMarker
  libraryPdfPreserved = Test-Path (Join-Path $shelfDir "sample.pdf")
  libraryEpubPreserved = Test-Path (Join-Path $libraryRoot "sample.epub")
  libraryMobiPreserved = Test-Path (Join-Path $libraryRoot "sample.mobi")
  safetyRegistryRemoved = -not (Test-Path $safetyRegistry)
  perUserUninstallKeyRecreated = Test-Path $uninstallRegistry
}
$cleanProofPath = Join-Path $resultsDir "clean-install-proof.json"
$cleanProof | ConvertTo-Json | Set-Content -LiteralPath $cleanProofPath -Encoding UTF8
$failedProof = @($cleanProof.GetEnumerator() | Where-Object { -not $_.Value })
if ($failedProof.Count -gt 0) {
  throw "Clean-install contract failed: $($failedProof.Name -join ', ')"
}
Write-Host "Clean-install proof: $($cleanProof | ConvertTo-Json -Compress)"

$appExe = Get-ChildItem -Path $installDir -Recurse -Filter "Marginalia.exe" | Select-Object -First 1
if (-not $appExe) {
  $appExe = Get-ChildItem -Path $installDir -Recurse -Filter "*.exe" | Where-Object { $_.Name -notmatch "unins" } | Select-Object -First 1
}
if (-not $appExe) { throw "Installed Marginalia.exe not found under $installDir" }

$env:MARGINALIA_APP_EXE = $appExe.FullName
$env:MARGINALIA_SMOKE_LIBRARY = $libraryRoot
$env:MARGINALIA_CLEAN_INSTALL_PROOF = $cleanProofPath
$env:MARGINALIA_SMOKE = "1"
$env:MARGINALIA_SMOKE_DEFER_LIBRARY = "1"
$env:MARGINALIA_FIXTURE_PDF = Join-Path $shelfDir "sample.pdf"
$env:MARGINALIA_FIXTURE_EPUB = Join-Path $libraryRoot "sample.epub"
$env:MARGINALIA_FIXTURE_MOBI = Join-Path $libraryRoot "sample.mobi"
# Multi-section real-world MOBI (Project Gutenberg #1524); staged into the library by S25, reused by S26.
$env:MARGINALIA_FIXTURE_MOBI_MULTI = Join-Path $repoRoot "tests/fixtures/hamlet-pg1524.mobi"
$env:MARGINALIA_FIXTURE_PDF_EXTRA = Join-Path $repoRoot "tests/fixtures/sample.pdf"
$env:SMOKE_ARTIFACTS_DIR = $resultsDir

Write-Host "App: $($appExe.FullName)"
Write-Host "Library: $libraryRoot"

Push-Location $repoRoot
try {
  if (-not (Get-Command tauri-driver -ErrorAction SilentlyContinue)) {
    cargo install tauri-driver --locked
  }
  npm run test:desktop-smoke
  if ($LASTEXITCODE -ne 0) {
    throw "test:desktop-smoke exited with $LASTEXITCODE"
  }
  $resultsJson = Join-Path $resultsDir "smoke-results.json"
  if (-not (Test-Path $resultsJson)) {
    throw "smoke-results.json missing at $resultsJson"
  }
  $rows = Get-Content $resultsJson -Raw | ConvertFrom-Json
  $failed = @($rows | Where-Object { -not $_.ok })
  if ($failed.Count -gt 0) {
    foreach ($f in $failed) {
      Write-Host "::error::$($f.id) $($f.name): $($f.detail)"
    }
    throw "$($failed.Count) smoke case(s) failed (see smoke-results.json)"
  }
} finally {
  Pop-Location
}