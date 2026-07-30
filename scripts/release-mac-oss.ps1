# Upload existing macOS build artifacts to Aliyun OSS.
# Build macOS artifacts on GitHub Actions or a Mac first, then place them in dist/.
# Usage: npm run release:mac:oss
# Optional env:
#   $env:PULSE_OSS_BUCKET = "agent2"
#   $env:PULSE_OSS_PREFIX = "pulse/mac/"
#   $env:PULSE_OSS_REGION = "oss-cn-beijing"

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$bucket = if ($env:PULSE_OSS_BUCKET) { $env:PULSE_OSS_BUCKET } else { "agent2" }
$prefix = if ($null -ne $env:PULSE_OSS_PREFIX) { $env:PULSE_OSS_PREFIX } else { "pulse/mac/" }
$region = if ($env:PULSE_OSS_REGION) { $env:PULSE_OSS_REGION } else { "oss-cn-beijing" }
if ($prefix -and -not $prefix.EndsWith("/")) { $prefix = "$prefix/" }

$localOssutil = Join-Path $projectRoot "scripts\ossutil.exe"
if (Test-Path $localOssutil) {
    $ossutil = $localOssutil
} else {
    $cmd = Get-Command ossutil -ErrorAction SilentlyContinue
    if ($cmd) {
        $ossutil = $cmd.Source
    } else {
        Write-Host "[ERROR] ossutil.exe not found." -ForegroundColor Red
        Write-Host "  Place it at: $localOssutil"
        exit 1
    }
}

$distDir = Join-Path $projectRoot "dist"
if (-not (Test-Path $distDir)) {
    Write-Host "[ERROR] dist directory not found." -ForegroundColor Red
    exit 1
}

$artifacts = Get-ChildItem -Path $distDir -File -ErrorAction Stop | Where-Object {
    $_.Name -match '^Pulse-.*\.(dmg|zip)$' -or $_.Name -eq 'latest-mac.yml' -or $_.Name -match '^Pulse-.*\.(dmg|zip)\.blockmap$'
} | Sort-Object Name

if ($artifacts.Count -eq 0) {
    Write-Host "[ERROR] No macOS artifacts found in dist/." -ForegroundColor Red
    Write-Host "  Expected files like: Pulse-0.1.4-x64.dmg, Pulse-0.1.4-arm64.dmg, latest-mac.yml"
    exit 1
}

Write-Host "==> Upload Pulse macOS artifacts to Aliyun OSS" -ForegroundColor Cyan
Write-Host "    Bucket : $bucket"
Write-Host "    Prefix : $prefix"
Write-Host "    Region : $region"
Write-Host "    ossutil: $ossutil"
Write-Host ""

foreach ($file in $artifacts) {
    $ossUrl = "oss://$bucket/$prefix$($file.Name)"
    $sizeMB = [math]::Round($file.Length / 1MB, 2)
    Write-Host "Uploading -> $ossUrl  ($sizeMB MB)" -ForegroundColor Yellow
    & $ossutil cp -f $file.FullName $ossUrl
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Upload failed: $($file.Name)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host ""
Write-Host "[OK] macOS artifacts uploaded." -ForegroundColor Green
Write-Host ""
Write-Host "Share / verify:" -ForegroundColor Cyan
$base = "https://$bucket.$region.aliyuncs.com/$prefix"
foreach ($file in $artifacts) {
    Write-Host "  $base$($file.Name)"
}
