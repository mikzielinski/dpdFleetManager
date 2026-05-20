# One-click staging deploy (uses ~/.uipath/.auth from uip login)
# Usage: .\deploy-now.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==> git pull" -ForegroundColor Cyan
git pull origin main

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env — verify VITE_UIPATH_CLIENT_ID if login fails in browser" -ForegroundColor Yellow
}

Write-Host "==> npm install" -ForegroundColor Cyan
npm install

Write-Host "==> Deploy staging 1.1.0" -ForegroundColor Cyan
node scripts/deploy-staging.mjs 1.1.0

Write-Host "`nApp: https://mzpocevylrxu.staging.uipath.host/dpdmonitoring/" -ForegroundColor Green
