// 语音服务进程管理：启动/停止 Python whisper_server.py
// 兼容开发模式和 Electron 打包后（asarUnpack）两种路径
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const VOICE_WS_PORT = 3723

let proc = null
let status = 'stopped'  // 'stopped' | 'starting' | 'running' | 'error'
let statusMessage = ''
let lastServer = null
let lastError = ''

// 解析语音服务的启动方式：
//   打包模式 → 优先用 extraResources 中的 whisper_server.exe（无需 Python）
//   开发模式 → 用 Python + whisper_server.py
function resolveServer() {
  const resourcesDir = process.env.PULSE_RESOURCES_DIR
  if (resourcesDir && resourcesDir.endsWith('.asar')) {
    // 打包后 extraResources 落在 app.asar 的上一级目录（resources/）
    const resourcesPath = path.dirname(resourcesDir)
    const candidates = [
      path.join(resourcesPath, 'voice', 'whisper_server.exe'),
      path.join(resourcesPath, 'voice', 'whisper_server', 'whisper_server.exe'),
    ]
    for (const exe of candidates) {
      if (fs.existsSync(exe)) return { mode: 'exe', path: exe, resourcesPath }
    }

    // 兜底：.py 在 asar.unpacked 里（仍需用户安装 Python）
    const py = path.join(
      resourcesDir.replace(/\.asar$/, '.asar.unpacked'),
      'src', 'voice', 'whisper_server.py'
    )
    if (fs.existsSync(py)) return { mode: 'python', path: py, resourcesPath }
  }
  // 开发模式
  return { mode: 'python', path: path.join(__dirname, 'whisper_server.py'), resourcesPath: process.cwd() }
}

function findPython() {
  return process.platform === 'win32' ? 'python' : 'python3'
}

export function getVoiceStatus() {
  const resolved = lastServer || resolveServer()
  return {
    status,
    message: statusMessage,
    port: VOICE_WS_PORT,
    pid: proc?.pid ?? null,
    mode: resolved.mode,
    serverPath: resolved.path,
    serverExists: fs.existsSync(resolved.path),
    lastError,
  }
}

export function startVoiceServer({ model = 'small' } = {}) {
  if (proc) return getVoiceStatus()

  const server = resolveServer()
  lastServer = server
  lastError = ''

  if (!fs.existsSync(server.path)) {
    status = 'error'
    statusMessage = `找不到语音服务: ${server.path}`
    lastError = statusMessage
    console.error(`[Voice] ${statusMessage}`)
    return getVoiceStatus()
  }

  status = 'starting'
  statusMessage = `正在加载 Whisper (${model})…`

  const modelDir = path.join(process.env.PULSE_USER_DIR || path.join(os.homedir(), '.newpulse'), 'voice-models')
  const voiceEnv = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    PULSE_WHISPER_MODEL_DIR: modelDir,
  }
  const spawnArgs = ['--model', model, '--port', String(VOICE_WS_PORT)]
  if (server.mode === 'exe') {
    console.log(`[Voice] 启动语音服务 (exe): ${server.path} --model ${model}`)
    proc = spawn(server.path, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: voiceEnv,
    })
  } else {
    console.log(`[Voice] 启动语音服务 (python): ${server.path} --model ${model}`)
    proc = spawn(findPython(), [server.path, ...spawnArgs], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: voiceEnv,
    })
  }

  proc.stdout.on('data', (data) => {
    for (const line of data.toString('utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      console.log(`[Voice] ${trimmed}`)
      // 同时检测中文和 ASCII 部分，避免 Windows 编码导致中文匹配失败
      if (trimmed.includes('WebSocket 服务启动') || trimmed.includes('ws://')) {
        status = 'running'
        statusMessage = `运行中 (port ${VOICE_WS_PORT})`
      } else if (trimmed.includes('加载') || trimmed.includes('load')) {
        statusMessage = trimmed.replace('[语音] ', '')
      }
    }
  })

  proc.stderr.on('data', (data) => {
    const text = data.toString().trim()
    if (text) {
      lastError = text
      if (status !== 'running') statusMessage = text.slice(0, 240)
      console.error(`[Voice] ${text}`)
    }
  })

  proc.on('exit', (code, signal) => {
    console.log(`[Voice] 进程退出: code=${code} signal=${signal}`)
    proc = null
    status = code === 0 ? 'stopped' : 'error'
    if (code === 0) {
      statusMessage = '已停止'
    } else {
      const exitMessage = `异常退出 (code ${code})`
      statusMessage = lastError ? `${exitMessage}: ${lastError.slice(-300)}` : exitMessage
      if (!lastError) lastError = exitMessage
    }
  })

  proc.on('error', (err) => {
    console.error('[Voice] 无法启动语音服务:', err.message)
    proc = null
    status = 'error'
    statusMessage = `语音服务启动失败: ${err.message}`
    lastError = err.message
  })

  return getVoiceStatus()
}

export function stopVoiceServer() {
  if (!proc) return getVoiceStatus()
  try { proc.kill('SIGTERM') } catch {}
  proc = null
  status = 'stopped'
  statusMessage = '已停止'
  return getVoiceStatus()
}

export function restartVoiceServer(model = 'small') {
  stopVoiceServer()
  // 给进程一点时间完全退出，再用新模型启动
  setTimeout(() => startVoiceServer({ model }), 500)
  return getVoiceStatus()
}
