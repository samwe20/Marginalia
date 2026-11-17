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

$installDir = Join-Path $env:LOCALAPPDATA "MarginaliaSmoke"
if (Test-Path $installDir) { Remove-Item -Recurse -Force $installDir }
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

Write-Host "Silent install to $installDir"
Start-Process -FilePath $installer.FullName -ArgumentList "/S", "/D=$installDir" -Wait

$appExe = Get-ChildItem -Path $installDir -Recurse -Filter "Marginalia.exe" | Select-Object -First 1
if (-not $appExe) {
  $appExe = Get-ChildItem -Path $installDir -Recurse -Filter "*.exe" | Where-Object { $_.Name -notmatch "unins" } | Select-Object -First 1
}
if (-not $appExe) { throw "Installed Marginalia.exe not found under $installDir" }

$libraryRoot = Join-Path $env:LOCALAPPDATA "MarginaliaSmokeLibrary"
if (Test-Path $libraryRoot) { Remove-Item -Recurse -Force $libraryRoot }
New-Item -ItemType Directory -Force -Path $libraryRoot | Out-Null
$shelfDir = Join-Path $libraryRoot "shelf"
New-Item -ItemType Directory -Force -Path $shelfDir | Out-Null
Copy-Item (Join-Path $repoRoot "tests/fixtures/sample.pdf") $shelfDir
Copy-Item (Join-Path $repoRoot "tests/fixtures/sample.epub") $libraryRoot
Copy-Item (Join-Path $repoRoot "tests/fixtures/sample.mobi") $libraryRoot

$env:MARGINALIA_APP_EXE = $appExe.FullName
$env:MARGINALIA_SMOKE_LIBRARY = $libraryRoot
$env:MARGINALIA_SMOKE = "1"
$env:MARGINALIA_SMOKE_DEFER_LIBRARY = "1"
$env:MARGINALIA_FIXTURE_PDF = Join-Path $shelfDir "sample.pdf"
$env:MARGINALIA_FIXTURE_EPUB = Join-Path $libraryRoot "sample.epub"
$env:MARGINALIA_FIXTURE_MOBI = Join-Path $libraryRoot "sample.mobi"
# Multi-section real-world MOBI (Project Gutenberg #1524); staged into the library by S25 only.
$env:MARGINALIA_FIXTURE_MOBI_MULTI = Join-Path $repoRoot "tests/fixtures/hamlet-pg1524.mobi"
$env:MARGINALIA_FIXTURE_PDF_EXTRA = Join-Path $repoRoot "tests/fixtures/sample.pdf"
$resultsDir = Join-Path $repoRoot "test-results\desktop-smoke"
New-Item -ItemType Directory -Force -Path $resultsDir | Out-Null
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