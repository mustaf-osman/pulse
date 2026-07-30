# One-time ossutil setup. Auto-reads AccessKey.csv from Downloads/Desktop/project root.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/setup-ossutil.ps1

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot

$ossutil = Join-Path $projectRoot "scripts\ossutil.exe"
if (-not (Test-Path $ossutil)) {
    Write-Host "[ERROR] ossutil.exe not found at: $ossutil" -ForegroundColor Red
    exit 1
}

$csvCandidates = @(
    (Join-Path $env:USERPROFILE "Downloads\AccessKey.csv"),
    (Join-Path $env:USERPROFILE "Desktop\AccessKey.csv"),
    (Join-Path $projectRoot "AccessKey.csv")
)
$csvPath = $csvCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csvPath) {
    Write-Host "[ERROR] AccessKey.csv not found. Looked at:" -ForegroundColor Red
    foreach ($c in $csvCandidates) { Write-Host "  $c" }
    Write-Host ""
    Write-Host "Put AccessKey.csv into your Downloads folder, or copy it to $projectRoot, then re-run." -ForegroundColor Yellow
    exit 1
}

Write-Host "[INFO] Found CSV: $csvPath" -ForegroundColor Cyan

$row = Import-Csv $csvPath | Select-Object -First 1
if (-not $row) {
    Write-Host "[ERROR] CSV is empty." -ForegroundColor Red
    exit 1
}

$idProp = ($row.PSObject.Properties | Where-Object { $_.Name -match '(?i)^\s*accesskey\s*id\s*$' } | Select-Object -First 1).Name
$secProp = ($row.PSObject.Properties | Where-Object { $_.Name -match '(?i)^\s*accesskey\s*secret\s*$' } | Select-Object -First 1).Name

if (-not $idProp -or -not $secProp) {
    Write-Host "[ERROR] Cannot find AccessKey columns. Got: $($row.PSObject.Properties.Name -join ', ')" -ForegroundColor Red
    exit 1
}

$ak = ($row.$idProp).Trim()
$sk = ($row.$secProp).Trim()

if (-not $ak -or -not $sk) {
    Write-Host "[ERROR] AccessKey fields are empty." -ForegroundColor Red
    exit 1
}

$cfgPath = Join-Path $env:USERPROFILE ".ossutilconfig"
$lines = @(
    "[Credentials]"
    "language=CH"
    "endpoint=oss-cn-beijing.aliyuncs.com"
    "accessKeyID=$ak"
    "accessKeySecret=$sk"
)
$lines | Set-Content -Path $cfgPath -Encoding ASCII

Write-Host "[OK] Wrote $cfgPath" -ForegroundColor Green
Write-Host ""
Write-Host "[INFO] Testing connection (ls oss://agent2)..." -ForegroundColor Cyan
& $ossutil ls oss://agent2

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[OK] ossutil configured. Next: npm run build, then npm run release:oss" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[FAIL] Connection test failed. Check:" -ForegroundColor Red
    Write-Host "  - bucket 'agent2' is in oss-cn-beijing region"
    Write-Host "  - AccessKey is enabled and correct"
    Write-Host "  - network ok"
}
