# One-click staging deploy (uses ~/.uipath/.auth from uip login)
# Usage: .\deploy-now.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==> git pull" -ForegroundColor Cyan
# Git prints progress to stderr; with Stop that aborts the script on Windows PowerShell
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
git pull origin main 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
  $ErrorActionPreference = $prevEap
  throw "git pull failed (exit $LASTEXITCODE)"
}
$ErrorActionPreference = $prevEap

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env - verify VITE_UIPATH_CLIENT_ID if login fails in browser" -ForegroundColor Yellow
}

Write-Host "==> npm install" -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }

Write-Host "==> Deploy staging 1.1.2" -ForegroundColor Cyan
node scripts/deploy-staging.mjs 1.1.3
if ($LASTEXITCODE -ne 0) { throw "deploy-staging failed (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "App: https://mzpocevylrxu.staging.uipath.host/dpdmonitoring/" -ForegroundColor Green
