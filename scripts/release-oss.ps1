# Pulse -> Aliyun OSS one-click release.
# Usage: npm run release:oss
# Optional env:
#   $env:PULSE_OSS_BUCKET = "agent2"     # bucket name
#   $env:PULSE_OSS_PREFIX = "pulse/"     # path prefix in bucket
#   $env:PULSE_OSS_REGION = "oss-cn-beijing"  # region for verify URL

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$bucket = if ($env:PULSE_OSS_BUCKET) { $env:PULSE_OSS_BUCKET } else { "agent2" }
$prefix = if ($null -ne $env:PULSE_OSS_PREFIX) { $env:PULSE_OSS_PREFIX } else { "pulse/" }
$region = if ($env:PULSE_OSS_REGION) { $env:PULSE_OSS_REGION } else { "oss-cn-beijing" }
if ($prefix -and -not $prefix.EndsWith("/")) { $prefix = "$prefix/" }

# Locate ossutil.exe
$localOssutil = Join-Path $projectRoot "scripts\ossutil.exe"
if (Test-Path $localOssutil) {
    $ossutil = $localOssutil
} else {
    $cmd = Get-Command ossutil -ErrorAction SilentlyContinue
    if ($cmd) {
        $ossutil = $cmd.Source
    } else {
        Write-Host "[ERROR] ossutil.exe not found." -ForegroundColor Red
        Write-Host "  Download from: https://help.aliyun.com/zh/oss/developer-reference/install-ossutil"
        Write-Host "  Place it at:   $localOssutil"
        Write-Host "  Then run:      powershell -ExecutionPolicy Bypass -File scripts/setup-ossutil.ps1"
        exit 1
    }
}

# Read package.json
$pkgJson = [System.IO.File]::ReadAllText((Resolve-Path "package.json"), [System.Text.Encoding]::UTF8)
$pkg = $pkgJson | ConvertFrom-Json
$version = $pkg.version
$productName = if ($pkg.productName) { $pkg.productName } else { $pkg.name }

# electron-builder artifactName: ${productName}-Setup-${version}.${ext}
$exeName = "$productName-Setup-$version.exe"
$blockmapName = "$exeName.blockmap"
$ymlName = "latest.yml"

$distDir = Join-Path $projectRoot "dist"
$exePath = Join-Path $distDir $exeName
$blockmapPath = Join-Path $distDir $blockmapName
$ymlPath = Join-Path $distDir $ymlName

Write-Host "==> Pulse Release to Aliyun OSS" -ForegroundColor Cyan
Write-Host "    Bucket : $bucket"
Write-Host "    Prefix : $prefix"
Write-Host "    Region : $region"
Write-Host "    Version: $version"
Write-Host "    ossutil: $ossutil"
Write-Host ""

# Verify artifacts present
$missing = @()
foreach ($p in @($exePath, $blockmapPath, $ymlPath)) {
    if (-not (Test-Path $p)) { $missing += $p }
}
if ($missing.Count -gt 0) {
    Write-Host "[ERROR] Missing build artifacts. Run 'npm run build' first." -ForegroundColor Red
    foreach ($m in $missing) { Write-Host "  missing: $m" -ForegroundColor Red }
    exit 1
}

function Send-OSS {
    param(
        [string]$LocalPath,
        [string]$KeyName
    )
    $key = "$prefix$KeyName"
    $ossUrl = "oss://$bucket/$key"
    Write-Host "Uploading -> $ossUrl" -ForegroundColor Yellow
    & $ossutil cp -f $LocalPath $ossUrl
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Upload failed: $KeyName" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

# Upload order: .exe first, then .blockmap, then latest.yml last.
# Reason: latest.yml is the manifest. If a user reads it before .exe is uploaded,
# they hit a 404. Uploading metadata last avoids that race.
Send-OSS -LocalPath $exePath      -KeyName $exeName
Send-OSS -LocalPath $blockmapPath -KeyName $blockmapName
Send-OSS -LocalPath $ymlPath      -KeyName $ymlName

Write-Host ""
Write-Host "[OK] Release complete." -ForegroundColor Green
Write-Host ""
Write-Host "Verify in browser:" -ForegroundColor Cyan
$base = "https://$bucket.$region.aliyuncs.com/$prefix"
Write-Host "  $base$ymlName"
Write-Host "  $base$exeName"
