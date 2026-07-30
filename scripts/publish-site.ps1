# Publish website.html to Aliyun OSS as index.html.
# Usage: npm run publish:site
# Optional env:
#   $env:PULSE_OSS_BUCKET = "agent2"
#   $env:PULSE_OSS_REGION = "oss-cn-beijing"

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$bucket = if ($env:PULSE_OSS_BUCKET) { $env:PULSE_OSS_BUCKET } else { "agent2" }
$region = if ($env:PULSE_OSS_REGION) { $env:PULSE_OSS_REGION } else { "oss-cn-beijing" }

$ossutil = Join-Path $projectRoot "scripts\ossutil.exe"
if (-not (Test-Path $ossutil)) {
    $cmd = Get-Command ossutil -ErrorAction SilentlyContinue
    if ($cmd) {
        $ossutil = $cmd.Source
    } else {
        Write-Host "[ERROR] ossutil.exe not found." -ForegroundColor Red
        Write-Host "  Place it at: $projectRoot\scripts\ossutil.exe"
        exit 1
    }
}

$siteFile = Join-Path $projectRoot "website.html"
if (-not (Test-Path $siteFile)) {
    Write-Host "[ERROR] website.html not found at $siteFile" -ForegroundColor Red
    exit 1
}

$pkgJson = [System.IO.File]::ReadAllText((Join-Path $projectRoot "package.json"), [System.Text.Encoding]::UTF8)
$pkg = $pkgJson | ConvertFrom-Json
$version = $pkg.version
$productName = if ($pkg.productName) { $pkg.productName } else { $pkg.name }

$sizeKB = [math]::Round((Get-Item $siteFile).Length / 1KB, 2)

Write-Host "==> Publish Pulse site to OSS" -ForegroundColor Cyan
Write-Host "    Bucket : $bucket"
Write-Host "    Region : $region"
Write-Host "    Source : $siteFile  ($sizeKB KB)"
Write-Host "    ossutil: $ossutil"
Write-Host ""

# 1) Upload website.html as index.html at bucket root.
$meta = "Content-Type:text/html; charset=utf-8#Cache-Control:public, max-age=300#Content-Disposition:inline"

function Send-Site {
    param([string]$Key)
    $ossUrl = "oss://$bucket/$Key"
    Write-Host "Uploading -> $ossUrl" -ForegroundColor Yellow
    & $ossutil cp -f $siteFile $ossUrl --meta $meta
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Upload failed: $Key" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Send-Site -Key "index.html"
Send-Site -Key "pulse/index.html"

# 2) Try to enable bucket static website hosting (index + error doc).
$websiteXml = Join-Path $projectRoot "scripts\oss-website.xml"
@"
<?xml version="1.0" encoding="UTF-8"?>
<WebsiteConfiguration>
  <IndexDocument>
    <Suffix>index.html</Suffix>
  </IndexDocument>
  <ErrorDocument>
    <Key>index.html</Key>
  </ErrorDocument>
</WebsiteConfiguration>
"@ | Set-Content -Path $websiteXml -Encoding UTF8

Write-Host ""
Write-Host "Configuring bucket static website hosting..." -ForegroundColor Yellow
& $ossutil website --method put "oss://$bucket" $websiteXml
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Could not enable static website hosting (you can ignore if already on)." -ForegroundColor DarkYellow
}

# 3) Verify by HEAD request.
Write-Host ""
Write-Host "Verifying public URL..." -ForegroundColor Cyan
$publicUrl  = "https://$bucket.$region.aliyuncs.com/index.html"
$bucketRoot = "https://$bucket.$region.aliyuncs.com/"
$pulseSubdir = "https://$bucket.$region.aliyuncs.com/pulse/index.html"

foreach ($u in @($publicUrl, $pulseSubdir, $bucketRoot)) {
    try {
        $r = Invoke-WebRequest -Uri $u -Method Head -UseBasicParsing -TimeoutSec 15
        $ct = $r.Headers['Content-Type']
        $cd = $r.Headers['Content-Disposition']
        Write-Host ("  [OK {0}]  CT={1}  CD={2}" -f $r.StatusCode, $ct, $cd)
        Write-Host ("            $u")
    } catch {
        Write-Host ("  [FAIL] $u  -> $($_.Exception.Message)") -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "[OK] Site published." -ForegroundColor Green
Write-Host ""
Write-Host "Share this URL:" -ForegroundColor Cyan
Write-Host "  $publicUrl" -ForegroundColor White
Write-Host ""
Write-Host "Direct download (already public):" -ForegroundColor Cyan
Write-Host "  https://$bucket.$region.aliyuncs.com/pulse/$productName-Setup-$version.exe" -ForegroundColor White
