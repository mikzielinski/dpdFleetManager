# Deploy DPD Fleet Manager to dpdmonitoring (Coded Web App)
# Usage: .\.uipath\deploy-dpdmonitoring.ps1 [version] [-Environment staging|production]
param(
  [string]$Version = "",
  [ValidateSet('staging', 'production')]
  [string]$Environment = 'staging'
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$configPath = Join-Path $Root ".uipath\deploy-config.$Environment.json"
if (-not (Test-Path $configPath)) {
  throw "Missing $configPath — copy deploy-config.production.example.json for production"
}
$cfg = Get-Content $configPath -Raw | ConvertFrom-Json
if (-not $Version) {
  $pkg = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
  $Version = $pkg.version
}
Write-Host "==> Environment: $($cfg.environment) ($configPath)" -ForegroundColor Cyan

Write-Host "==> Build" -ForegroundColor Cyan
npm run build

Write-Host "==> Repack nupkg ($Version)" -ForegroundColor Cyan
node scripts/repack-nupkg.mjs $Version

$PkgId   = $cfg.packageId
$Nupkg   = Join-Path $Root ".uipath\$PkgId.$Version.nupkg"
if (-not (Test-Path $Nupkg)) { throw "Missing $Nupkg" }

# --- Auth: auto-refresh token if expired ---
$authFile = Join-Path $env:USERPROFILE ".uipath\.auth"

function Get-AuthToken {
    param([string]$AuthFile)
    $lines        = Get-Content $AuthFile
    $accessToken  = ($lines | Where-Object { $_ -match '^UIPATH_ACCESS_TOKEN='  }) -replace '^UIPATH_ACCESS_TOKEN=',''
    $refreshToken = ($lines | Where-Object { $_ -match '^UIPATH_REFRESH_TOKEN=' }) -replace '^UIPATH_REFRESH_TOKEN=',''

    # Decode JWT exp
    $payload = $accessToken.Split('.')[1]
    $pad = 4 - ($payload.Length % 4); if ($pad -ne 4) { $payload += '=' * $pad }
    $decoded = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
    $exp = [DateTimeOffset]::FromUnixTimeSeconds($decoded.exp).LocalDateTime

    if ((Get-Date) -gt $exp) {
        Write-Host "  Token expired ($exp), refreshing..." -ForegroundColor Yellow
        $body = @{
            grant_type    = "refresh_token"
            refresh_token = $refreshToken
            client_id     = $cfg.identityClientId
        }
        $tokenUrl = "https://$($cfg.portalHost)/identity_/connect/token"
        $resp = Invoke-RestMethod `
            -Uri $tokenUrl `
            -Method POST -Body $body `
            -ContentType "application/x-www-form-urlencoded"

        $accessToken = $resp.access_token
        $lines = $lines -replace '^UIPATH_ACCESS_TOKEN=.*',  "UIPATH_ACCESS_TOKEN=$accessToken"
        if ($resp.refresh_token) {
            $lines = $lines -replace '^UIPATH_REFRESH_TOKEN=.*', "UIPATH_REFRESH_TOKEN=$($resp.refresh_token)"
        }
        $lines | Set-Content $AuthFile
        Write-Host "  Token refreshed, valid for $($resp.expires_in)s" -ForegroundColor Green
    } else {
        Write-Host "  Token valid until $exp" -ForegroundColor Green
    }
    return $accessToken
}

$token       = Get-AuthToken -AuthFile $authFile
$orgId       = $cfg.orgId
$tenantId    = $cfg.tenantId
$folderKey   = $cfg.folderKey
$routingName = $cfg.routingName
$portalBase  = "https://$($cfg.portalHost)"
$appsBase    = "$portalBase/$orgId/apps_/default/api/v1/default/models"

# --- Upload ---
Write-Host "==> Upload to Orchestrator" -ForegroundColor Cyan
$fileBytes = [System.IO.File]::ReadAllBytes($Nupkg)
$boundary  = [System.Guid]::NewGuid().ToString()
$LF        = "`r`n"
$body = "--$boundary$LF" +
  "Content-Disposition: form-data; name=`"uploads[]`"; filename=`"$PkgId.$Version.nupkg`"$LF" +
  "Content-Type: application/octet-stream$LF$LF" +
  [System.Text.Encoding]::GetEncoding('iso-8859-1').GetString($fileBytes) +
  "$LF--$boundary--$LF"
$uploadUrl = "$portalBase/$orgId/$tenantId/orchestrator_/odata/Processes/UiPath.Server.Configuration.OData.UploadPackage()?origin=uip&command=codedapp"
try {
  Invoke-RestMethod -Uri $uploadUrl -Method POST `
    -Headers @{ Authorization = "Bearer $token" } `
    -ContentType "multipart/form-data; boundary=$boundary" `
    -Body $body | Out-Null
  Write-Host "Upload OK" -ForegroundColor Green
} catch {
  if ($_.ErrorDetails.Message -match 'already exists') { Write-Host "Package already in feed" -ForegroundColor Yellow }
  else { throw }
}

# --- Publish ---
Write-Host "==> Publish coded app" -ForegroundColor Cyan
$publishUrl = "$appsBase/apps/codedapp/publish?origin=uip&command=codedapp"
$payload = @{
  tenantName   = $cfg.tenantName
  packageName  = $PkgId
  packageVersion = $Version
  title        = $PkgId
  schema       = @{}
} | ConvertTo-Json
$apiHeaders = @{
  Authorization                = "Bearer $token"
  'x-uipath-internal-tenantid' = $tenantId
  'x-uipath-folderkey'         = $folderKey
  'Content-Type'               = 'application/json'
}
$pub = Invoke-RestMethod -Uri $publishUrl -Method POST -Headers $apiHeaders -Body $payload
Write-Host "Published deployVersion=$($pub.deployVersion)" -ForegroundColor Green

# --- Deploy / upgrade (Apps API uses "version" = deployVersion, NOT semVersion) ---
Write-Host "==> Deploy / upgrade ($routingName)" -ForegroundColor Cyan
$deployVersion = $pub.deployVersion
$publishedFeed = Invoke-RestMethod -Uri "$appsBase/tenants/$tenantId/publish/apps?searchText=$([uri]::EscapeDataString($PkgId))&folderFeedType=tenant&origin=uip&command=codedapp" -Headers $apiHeaders
$published = $publishedFeed.value | Where-Object { $_.title -eq $PkgId -and $_.deployVersion -eq $deployVersion } | Select-Object -First 1
if (-not $published.systemName) { throw "Published app not found in feed (title=$PkgId deployVersion=$deployVersion)" }

$listUrl = "$appsBase/deployed/apps?origin=uip&command=codedapp"
$deployed = (Invoke-RestMethod -Uri $listUrl -Headers $apiHeaders).value |
  Where-Object { $_.routingName -eq $routingName } | Select-Object -First 1

$upgradeOk = $false
if ($deployed) {
  $upgradeBody = @{ title = $PkgId; version = $deployVersion } | ConvertTo-Json
  try {
    Invoke-RestMethod -Uri "$appsBase/deployed/apps/$($deployed.id)?origin=uip&command=codedapp" -Method PATCH -Headers $apiHeaders -Body $upgradeBody | Out-Null
    Start-Sleep -Seconds 5
    $deployed = (Invoke-RestMethod -Uri $listUrl -Headers $apiHeaders).value |
      Where-Object { $_.routingName -eq $routingName } | Select-Object -First 1
    if ($deployed.deployVersion -eq $deployVersion) {
      $upgradeOk = $true
      Write-Host "Upgrade OK $($deployed.semVersion) deployVersion=$($deployed.deployVersion)" -ForegroundColor Green
    }
  } catch {
    Write-Host "PATCH upgrade failed: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
  }
}

if (-not $upgradeOk) {
  if ($deployed) {
    Write-Host "Redeploy: remove $($deployed.semVersion) then install publish version $deployVersion" -ForegroundColor Yellow
    Invoke-RestMethod -Uri "$appsBase/deployed/apps/$($deployed.id)?origin=uip&command=codedapp" -Method DELETE -Headers $apiHeaders | Out-Null
    Start-Sleep -Seconds 2
  }
  $deployBody = @{ title = $PkgId; routingName = $routingName } | ConvertTo-Json
  $newId = Invoke-RestMethod -Uri "$appsBase/$($published.systemName)/publish/versions/$deployVersion/deploy?origin=uip&command=codedapp" -Method POST -Headers $apiHeaders -Body $deployBody
  Start-Sleep -Seconds 5
  $deployed = (Invoke-RestMethod -Uri $listUrl -Headers $apiHeaders).value |
    Where-Object { $_.routingName -eq $routingName } | Select-Object -First 1
  if ($deployed.deployVersion -eq $deployVersion) {
    $upgradeOk = $true
    Write-Host "Fresh deploy OK $($deployed.semVersion) deployVersion=$($deployed.deployVersion) id=$($newId.id)" -ForegroundColor Green
  }
}

if (-not $upgradeOk) {
  Write-Host "Deploy failed — do NOT use Orchestrator Upgrade (known 400 on unified apps). Re-run this script." -ForegroundColor Red
}

# --- Verify ---
Write-Host "==> Verify hosted bundle" -ForegroundColor Cyan
$verifyUrl = if ($cfg.hostedBaseUrl -match '/$') { $cfg.hostedBaseUrl } else { "$($cfg.hostedBaseUrl)/" }
$html = (Invoke-WebRequest -Uri $verifyUrl -UseBasicParsing).Content
$expectedJs = $null
if ((Get-Content (Join-Path $Root 'dist\index.html') -Raw) -match 'index-([A-Za-z0-9_-]+)\.js') { $expectedJs = $Matches[1] }
if ($html -match 'uipath:cdn-base" content="[^"]+/(\d+)"') { $cdnVer = $Matches[1] } else { $cdnVer = '?' }
if ($html -match 'index-([A-Za-z0-9_-]+)\.js') {
  $liveJs = $Matches[1]
  if ($liveJs -eq $expectedJs -and $cdnVer -eq "$($pub.deployVersion)") {
    Write-Host "Live bundle OK: index-$liveJs.js CDN deployVersion=$cdnVer" -ForegroundColor Green
  } else {
    Write-Host "Still serving index-$liveJs.js (expected index-$expectedJs.js, CDN=$cdnVer want $($pub.deployVersion)) — hard refresh Ctrl+Shift+R" -ForegroundColor Yellow
  }
}

# --- Push source ---
Write-Host "==> Push source to Studio (optional sync)" -ForegroundColor Cyan
$env:UIPATH_PROJECT_ID = $cfg.studioProjectId
uip codedapp push $cfg.studioProjectId --build-dir dist

Write-Host "==> Clean old artifacts" -ForegroundColor Cyan
node scripts/clean-artifacts.mjs --keep-latest
