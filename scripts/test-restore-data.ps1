# 把 test-fresh-install.ps1 备份的数据还原回 %APPDATA%\Pulse。
# 自动选最新的 Pulse.backup-* 文件夹。
# 当前 %APPDATA%\Pulse 会被覆盖（先重命名到 Pulse.replaced-{时间戳} 安全起见）。

$ErrorActionPreference = "Stop"

$pulseDir = Join-Path $env:APPDATA "Pulse"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host ""
Write-Host "==> Pulse · 还原你的数据" -ForegroundColor Cyan
Write-Host ""

# ─────── 1. 找最新备份 ───────
$backups = Get-ChildItem -Path $env:APPDATA -Directory -Filter "Pulse.backup-*" -ErrorAction SilentlyContinue |
           Sort-Object LastWriteTime -Descending

if (-not $backups -or $backups.Count -eq 0) {
    Write-Host "[X] 找不到任何备份文件夹（%APPDATA%\Pulse.backup-*）。" -ForegroundColor Red
    Write-Host "    可能的原因：" -ForegroundColor Yellow
    Write-Host "    - 你还没跑过 test-fresh-install.ps1"
    Write-Host "    - 备份被手动删掉了"
    exit 1
}

Write-Host "可用备份：" -ForegroundColor Cyan
$i = 0
foreach ($b in $backups) {
    $marker = if ($i -eq 0) { "(最新)" } else { "" }
    $sizeMB = [math]::Round((Get-ChildItem $b.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
    Write-Host ("  [{0}] {1}  {2} MB  {3:yyyy-MM-dd HH:mm:ss}  {4}" -f $i, $b.Name, $sizeMB, $b.LastWriteTime, $marker)
    $i++
}
Write-Host ""

$choice = Read-Host "选哪个？默认 0（回车直接用最新的），或输入序号 / 输入 q 取消"
if ($choice -eq "q" -or $choice -eq "Q") {
    Write-Host "[X] 已取消。" -ForegroundColor Yellow
    exit 0
}
if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "0" }

$idx = 0
if (-not [int]::TryParse($choice, [ref]$idx)) {
    Write-Host "[X] 无效输入。" -ForegroundColor Red
    exit 1
}
if ($idx -lt 0 -or $idx -ge $backups.Count) {
    Write-Host "[X] 序号超出范围。" -ForegroundColor Red
    exit 1
}
$picked = $backups[$idx]

# ─────── 2. 关闭 Pulse 进程 ───────
$running = @()
foreach ($name in @("Pulse", "electron")) {
    $p = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($p) { $running += $p }
}
if ($running.Count -gt 0) {
    Write-Host ""
    Write-Host "[!] 检测到 Pulse 还在运行，必须先关闭：" -ForegroundColor Yellow
    foreach ($p in $running) {
        Write-Host "    PID $($p.Id) · $($p.ProcessName)"
    }
    $ans = Read-Host "    自动关闭它们吗？输入 y 继续"
    if ($ans -ne "y" -and $ans -ne "Y") {
        Write-Host "[X] 已取消。" -ForegroundColor Red
        exit 1
    }
    foreach ($p in $running) {
        try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch {}
    }
    Start-Sleep -Seconds 2
}

# ─────── 3. 把当前 Pulse 目录挪开（保险起见） ───────
if (Test-Path $pulseDir) {
    Write-Host ""
    Write-Host "==> 把当前 Pulse 目录改名到 Pulse.replaced-$ts（保险起见，万一你想再切回去）" -ForegroundColor Cyan
    try {
        Rename-Item -Path $pulseDir -NewName "Pulse.replaced-$ts" -ErrorAction Stop
        Write-Host "    [OK]" -ForegroundColor Green
    } catch {
        Write-Host "    [X] 改名失败：$_" -ForegroundColor Red
        exit 1
    }
}

# ─────── 4. 把备份拷回 Pulse ───────
Write-Host ""
Write-Host "==> 从 $($picked.Name) 还原到 Pulse" -ForegroundColor Cyan
Copy-Item -Path $picked.FullName -Destination $pulseDir -Recurse -Force -ErrorAction Stop
Write-Host "    [OK] 还原完成。" -ForegroundColor Green

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host " 你的数据已还原。打开 Pulse 看看，应该回到你原来的样子。" -ForegroundColor Cyan
Write-Host ""
Write-Host " 备份还在原地（你可以再次跑 test-fresh-install 不会丢东西）：" -ForegroundColor Cyan
Write-Host "   $($picked.FullName)"
Write-Host ""
Write-Host " 你刚被替换掉的那份数据（就是测试新用户时的空状态）也保留了：" -ForegroundColor Cyan
Write-Host "   $($env:APPDATA)\Pulse.replaced-$ts"
Write-Host "   想清掉的话：Remove-Item -Recurse -Force `"$env:APPDATA\Pulse.replaced-$ts`""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host ""
