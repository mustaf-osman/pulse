# 模拟"别人从官网首次下载"的全新用户体验。
# 它会：
#   1. 关闭正在运行的 Pulse / Electron 进程
#   2. 把 %APPDATA%\Pulse 整体备份到 %APPDATA%\Pulse.backup-{时间戳}
#   3. 清空 %APPDATA%\Pulse（保留目录本身，避免重装时权限问题）
#   4. 告诉你接下来怎么验证 + 怎么还原
# 你的数据不会丢失，备份会在 %APPDATA% 里以 Pulse.backup-* 形式留着。
# 还原跑：powershell -ExecutionPolicy Bypass -File scripts/test-restore-data.ps1

$ErrorActionPreference = "Stop"

$pulseDir = Join-Path $env:APPDATA "Pulse"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $env:APPDATA "Pulse.backup-$ts"

Write-Host ""
Write-Host "==> Pulse · 模拟新用户体验" -ForegroundColor Cyan
Write-Host ""

# ─────── 1. 检查 Pulse 是否在运行 ───────
$running = @()
foreach ($name in @("Pulse", "electron")) {
    $p = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($p) { $running += $p }
}
if ($running.Count -gt 0) {
    Write-Host "[!] 检测到 Pulse 还在运行，需要先关闭：" -ForegroundColor Yellow
    foreach ($p in $running) {
        Write-Host "    PID $($p.Id) · $($p.ProcessName)"
    }
    Write-Host ""
    $ans = Read-Host "    自动关闭它们吗？输入 y 继续，输入其他取消"
    if ($ans -ne "y" -and $ans -ne "Y") {
        Write-Host "[X] 已取消。请先手动关闭 Pulse 后再跑这个脚本。" -ForegroundColor Red
        exit 1
    }
    foreach ($p in $running) {
        try {
            Stop-Process -Id $p.Id -Force -ErrorAction Stop
            Write-Host "    已关闭 PID $($p.Id)" -ForegroundColor Green
        } catch {
            Write-Host "    无法关闭 PID $($p.Id)：$_" -ForegroundColor Red
        }
    }
    Start-Sleep -Seconds 2
}

# ─────── 2. 备份当前数据 ───────
if (Test-Path $pulseDir) {
    $sizeMB = [math]::Round((Get-ChildItem $pulseDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
    Write-Host "==> 步骤 1 / 2 · 备份你现有的数据" -ForegroundColor Cyan
    Write-Host "    源： $pulseDir ($sizeMB MB)"
    Write-Host "    去： $backupDir"
    Write-Host ""

    Copy-Item -Path $pulseDir -Destination $backupDir -Recurse -Force -ErrorAction Stop
    Write-Host "    [OK] 备份完成。" -ForegroundColor Green
    Write-Host ""

    # ─────── 3. 清空数据 ───────
    Write-Host "==> 步骤 2 / 2 · 清空当前数据，让 Pulse 以为自己是第一次启动" -ForegroundColor Cyan
    Get-ChildItem -Path $pulseDir -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction Stop
        } catch {
            Write-Host "    [警告] 无法删除 $($_.Name)：$_" -ForegroundColor Yellow
        }
    }
    Write-Host "    [OK] 已清空。" -ForegroundColor Green
} else {
    Write-Host "[i] $pulseDir 不存在，等于已经是新用户状态了。" -ForegroundColor Gray
    $backupDir = "(无需备份 · 当前已经是空)"
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host " 现在你可以：" -ForegroundColor Cyan
Write-Host ""
Write-Host "   方式 A · 用现在装着的 Pulse（最快）" -ForegroundColor White
Write-Host "     直接从开始菜单/桌面点开 Pulse"
Write-Host "     这就是别人首次下载安装后的全新体验"
Write-Host ""
Write-Host "   方式 B · 真的从官网下载一遍" -ForegroundColor White
Write-Host "     1. 浏览器打开你的官网（或直接访问下载链接）"
Write-Host "        https://agent2.oss-cn-beijing.aliyuncs.com/pulse/Pulse-Setup-0.1.4.exe"
Write-Host "     2. 双击安装，看从下载到激活的完整流程"
Write-Host ""
Write-Host " 你应该会看到：" -ForegroundColor Cyan
Write-Host "   - 首次激活页（输入大模型 API key）"
Write-Host "   - 闲聊模式默认状态（没有任何对话历史）"
Write-Host "   - 没有客户、没有长期记忆、没有任何业务数据"
Write-Host ""
Write-Host " 体验完了想拿回你原来的数据：" -ForegroundColor Cyan
Write-Host "   npm run test:restore-data" -ForegroundColor Yellow
Write-Host "   或" -ForegroundColor Gray
Write-Host "   powershell -ExecutionPolicy Bypass -File scripts/test-restore-data.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host " 备份位置：" -ForegroundColor Cyan
Write-Host "   $backupDir"
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host ""
