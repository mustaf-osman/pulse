param(
  [string]$CloudApi = $env:NIMO_CLOUD_API,
  [switch]$NoLock,
  [switch]$NoIgnoreCert,
  [switch]$Clear
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$configPath = Join-Path $repoRoot 'electron\cloud-config.json'

if ($Clear) {
  if (Test-Path $configPath) {
    Remove-Item $configPath -Force
    Write-Host "[prebuild-cloud] removed $configPath (dev mode restored)" -ForegroundColor Yellow
  } else {
    Write-Host "[prebuild-cloud] already in dev mode (no cloud-config.json)" -ForegroundColor Yellow
  }
  exit 0
}

if (-not $CloudApi) {
  Write-Host "[prebuild-cloud] ERROR: cloud API not specified" -ForegroundColor Red
  Write-Host "Usage:" -ForegroundColor Yellow
  Write-Host "  `$env:NIMO_CLOUD_API = 'https://your-nimo-cloud.example.com'" -ForegroundColor Yellow
  Write-Host "  powershell -File scripts/prebuild-cloud.ps1" -ForegroundColor Yellow
  Write-Host "Or:" -ForegroundColor Yellow
  Write-Host "  powershell -File scripts/prebuild-cloud.ps1 -CloudApi 'https://your-nimo-cloud.example.com'" -ForegroundColor Yellow
  exit 1
}

$config = [ordered]@{
  cloudApi         = $CloudApi
  cloudApiLock     = -not $NoLock.IsPresent
  ignoreCertErrors = -not $NoIgnoreCert.IsPresent
  bakedAt          = (Get-Date).ToString('o')
}

$json = $config | ConvertTo-Json -Compress
Set-Content -Path $configPath -Value $json -Encoding UTF8 -NoNewline

Write-Host "[prebuild-cloud] baked cloud config -> $configPath" -ForegroundColor Green
Write-Host "  cloudApi         = $($config.cloudApi)" -ForegroundColor Cyan
Write-Host "  cloudApiLock     = $($config.cloudApiLock)" -ForegroundColor Cyan
Write-Host "  ignoreCertErrors = $($config.ignoreCertErrors)" -ForegroundColor Cyan
