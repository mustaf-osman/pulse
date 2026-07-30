import { execFile } from 'child_process'
import { promisify } from 'util'
import { classifyProcess } from './app-catalog.js'

const execFileAsync = promisify(execFile)

function parseJson(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  return JSON.parse(text)
}

// 进程名 → 中文友好名 + 分类元数据，由 app-catalog.js 提供。

async function runPowerShellJson(script, timeout = 8000) {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 1024 * 1024,
  })
  return parseJson(stdout)
}

export async function getForegroundWindowInfo() {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      platform: process.platform,
      appName: 'Unsupported platform',
      processName: 'unsupported',
      windowTitle: '',
      processId: 0,
      capturedAt: new Date().toISOString(),
    }
  }

  const script = `
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class PulseWin32Window {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$hwnd = [PulseWin32Window]::GetForegroundWindow()
$builder = New-Object System.Text.StringBuilder 1024
[void][PulseWin32Window]::GetWindowText($hwnd, $builder, $builder.Capacity)
[uint32]$ownerPid = 0
[void][PulseWin32Window]::GetWindowThreadProcessId($hwnd, [ref]$ownerPid)
$proc = $null
$descName = ''
try { $proc = Get-Process -Id $ownerPid -ErrorAction Stop } catch {}
if ($proc) {
  try { $descName = $proc.MainModule.FileVersionInfo.FileDescription } catch {}
}
$pname = if ($proc) { $proc.ProcessName } else { '' }
# 系统级前台进程 → 视作熄屏/锁屏/系统空闲，不算软件
$systemFront = @('LockApp', 'LogonUI', 'Idle', 'csrss', 'WUDFHost', 'fontdrvhost', 'dwm', 'ApplicationFrameHost')
$reason = if (-not $proc) { 'no_foreground' }
         elseif ($systemFront -contains $pname) {
           switch ($pname) {
             'LockApp' { 'screen_locked' }
             'LogonUI' { 'screen_locked' }
             'Idle' { 'system_idle' }
             default { 'system_process' }
           }
         } else { '' }
[pscustomobject]@{
  ok = $true
  platform = 'win32'
  reason = $reason
  appName = if ($descName) { $descName } elseif ($proc) { $proc.ProcessName } else { '' }
  processName = if ($proc) { $proc.ProcessName + '.exe' } else { '' }
  windowTitle = $builder.ToString()
  processId = [int]$ownerPid
  capturedAt = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json -Compress
`

  try {
    const result = await runPowerShellJson(script)
    const reason = String(result?.reason || '').trim()
    if (reason) {
      return makeStatusSample(reason, result)
    }
    const processName = String(result?.processName || '').trim()
    const fallbackDesc = String(result?.appName || '').trim()
    const classification = classifyProcess(processName, fallbackDesc)
    return {
      ok: Boolean(result?.ok),
      platform: 'win32',
      appName: classification.name,
      processName,
      windowTitle: String(result?.windowTitle || '').trim(),
      processId: Number(result?.processId || 0),
      capturedAt: result?.capturedAt || new Date().toISOString(),
      category: classification.category,
      categoryLabel: classification.categoryLabel,
      workRelated: classification.workRelated,
      categoryRisk: classification.risk,
      catalogMatched: classification.matched,
    }
  } catch (err) {
    const msg = String(err?.message || err || '')
    let reason = 'collector_error'
    if (/timed?\s*out|ETIMEDOUT|timeout/i.test(msg)) reason = 'timeout'
    else if (/access is denied|ACCESS_DENIED|权限/i.test(msg)) reason = 'permission_denied'
    else if (/ENOENT|powershell\.exe/i.test(msg)) reason = 'powershell_missing'
    return makeStatusSample(reason, { errorMessage: msg })
  }
}

// 失败 / 锁屏 / 系统空闲 等非真实软件的占位样本
// 这些条目在统计排行里会被剔除，单独走「采集状态说明」展示
const STATUS_LABELS = {
  user_idle: { name: '空闲', detail: '鼠标键盘超过阈值无操作' },
  screen_locked: { name: '锁屏 / 熄屏', detail: '屏幕被锁定，无法读取前台窗口' },
  system_idle: { name: '系统空闲', detail: 'Windows System Idle Process 为前台，相当于完全无操作' },
  system_process: { name: '系统进程', detail: '前台为系统组件（任务管理器隐藏的那种）' },
  no_foreground: { name: '无前台窗口', detail: '所有窗口最小化或桌面占用前台' },
  timeout: { name: '采集超时', detail: 'PowerShell 调用超过 8 秒未返回（电脑卡顿或防病毒拦截）' },
  permission_denied: { name: '权限不足', detail: 'Windows 拒绝读取前台进程信息（被管理员限制或安全软件拦截）' },
  powershell_missing: { name: '缺少 PowerShell', detail: '系统找不到 powershell.exe' },
  collector_error: { name: '旧版采集异常', detail: '旧版本只记录了“采集失败”，没有保存具体原因；新版本会区分锁屏/熄屏、采集超时、权限不足、网络异常等原因' },
  network_offline: { name: '网络异常', detail: '本地采集不依赖网络，但 AI 屏幕分类需要联网' },
}

export const COLLECTION_STATUS_PROCESS_PREFIX = '__status:'
export const COLLECTION_STATUS_REASONS = Object.keys(STATUS_LABELS)
export function getCollectionStatusLabel(reason) {
  return STATUS_LABELS[reason] || STATUS_LABELS.collector_error
}

function makeStatusSample(reason, extra = {}) {
  const label = STATUS_LABELS[reason] || STATUS_LABELS.collector_error
  return {
    ok: false,
    platform: 'win32',
    appName: label.name,
    processName: `${COLLECTION_STATUS_PROCESS_PREFIX}${reason}`,
    windowTitle: extra?.errorMessage || label.detail || '',
    processId: 0,
    capturedAt: extra?.capturedAt || new Date().toISOString(),
    isCollectionStatus: true,
    collectionReason: reason,
    collectionReasonLabel: label.name,
    collectionReasonDetail: label.detail,
  }
}

export async function getSystemIdleSeconds() {
  if (process.platform !== 'win32') return 0

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PulseWin32Idle {
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [DllImport("kernel32.dll")] public static extern uint GetTickCount();
}
"@
$info = New-Object PulseWin32Idle+LASTINPUTINFO
$info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
[void][PulseWin32Idle]::GetLastInputInfo([ref]$info)
$idleMs = [PulseWin32Idle]::GetTickCount() - $info.dwTime
[pscustomobject]@{ idleSeconds = [math]::Floor($idleMs / 1000) } | ConvertTo-Json -Compress
`

  try {
    const result = await runPowerShellJson(script, 2500)
    return Math.max(0, Number(result?.idleSeconds || 0))
  } catch {
    return 0
  }
}
