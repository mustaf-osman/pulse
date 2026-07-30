// Windows: 把控制台代码页切到 UTF-8，避免中文 stdout 显示为乱码
if (process.platform === 'win32') {
  try {
    require('child_process').execSync('chcp 65001', { stdio: 'ignore', windowsHide: true })
  } catch (_) {}
}

// 防御打包后写入 stdout/stderr 时父端 pipe 已关闭导致的 EPIPE：
// Electron 主进程里 console.log 会同步调用 Socket._write，若 pipe 已关闭就会
// 同步抛出 EPIPE，被 Electron 默认 uncaughtException 抓住弹窗
// （"A JavaScript error occurred in the main process"）。
// 监听 stream.on('error') 拦不住同步抛出的异常，所以这里直接 monkey-patch
// 写入路径和 console.*，把 EPIPE 当作"管道已断，丢弃这条日志"处理。
;(function shieldEpipe() {
  const isEpipe = (err) => Boolean(err && (err.code === 'EPIPE' || err.errno === -4047 || /EPIPE/.test(String(err.message || ''))))
  let stdoutBroken = false
  let stderrBroken = false

  const wrapStreamWrite = (stream, markBroken) => {
    if (!stream || typeof stream.write !== 'function') return
    const origWrite = stream.write.bind(stream)
    stream.write = (chunk, encoding, cb) => {
      if (markBroken()) {
        if (typeof encoding === 'function') { try { encoding() } catch (_) {} }
        else if (typeof cb === 'function') { try { cb() } catch (_) {} }
        return true
      }
      try {
        return origWrite(chunk, encoding, cb)
      } catch (err) {
        if (isEpipe(err)) { markBroken(true); return true }
        throw err
      }
    }
    stream.on('error', (err) => {
      if (isEpipe(err)) { markBroken(true); return }
    })
  }
  wrapStreamWrite(process.stdout, (set) => { if (set) stdoutBroken = true; return stdoutBroken })
  wrapStreamWrite(process.stderr, (set) => { if (set) stderrBroken = true; return stderrBroken })

  const wrapConsole = (name) => {
    const orig = console[name]
    if (typeof orig !== 'function') return
    console[name] = function (...args) {
      try { return orig.apply(this, args) }
      catch (err) { if (isEpipe(err)) return; throw err }
    }
  }
  ;['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir'].forEach(wrapConsole)

  process.on('uncaughtException', (err) => {
    if (isEpipe(err)) return
    try {
      process.stderr.write(`[uncaughtException] ${err && (err.stack || err.message || err)}\n`)
    } catch (_) {}
  })
  process.on('unhandledRejection', (reason) => {
    if (isEpipe(reason)) return
    try {
      process.stderr.write(`[unhandledRejection] ${reason && (reason.stack || reason.message || reason)}\n`)
    } catch (_) {}
  })
})()

const { app, BrowserWindow, shell, dialog, Menu, ipcMain, globalShortcut, Tray, nativeImage } = require('electron')
const path = require('path')

try { app.setName('Nimo 提醒助手') } catch (_) {}
try { app.setPath('userData', path.join(app.getPath('appData'), 'NimoReminder')) } catch (_) {}

// 烘焙的云端授权配置：由 scripts/prebuild-cloud.ps1 在打包时生成 electron/cloud-config.json
// 缺省（开发模式）下没有这个文件，客户端会回退到默认 http://localhost:8787，并允许用户手填地址
let __bakedCloudConfig = {}
try { __bakedCloudConfig = require('./cloud-config.json') } catch (_) {}
if (__bakedCloudConfig.cloudApi) {
  process.env.NIMO_CLOUD_API = String(__bakedCloudConfig.cloudApi)
  // 烘焙版使用独立的 userData 路径（NewPulse-Cloud），与本地开发数据彻底隔离
  // 这样开发者本机用 npm start 跑的旧数据不会泄漏进装机版
  try {
    const baseUserData = app.getPath('userData')
    if (baseUserData && !/-Cloud$/.test(baseUserData)) {
      app.setPath('userData', baseUserData + '-Cloud')
    }
  } catch (_) {}
}
if (__bakedCloudConfig.cloudApiLock) {
  process.env.NIMO_CLOUD_API_LOCK = '1'
}
if (__bakedCloudConfig.ignoreCertErrors) {
  try { app.commandLine.appendSwitch('ignore-certificate-errors') } catch (_) {}
}
const net = require('net')
const http = require('http')
const fs = require('fs')
const crypto = require('crypto')
const { EventEmitter } = require('events')
const { pathToFileURL } = require('url')
const { autoUpdater } = require('electron-updater')

const IS_DEV = !app.isPackaged
const WINDOWS_APP_USER_MODEL_ID = 'com.nimo.reminder'
const USER_DIR = app.getPath('userData')
const CODE_ROOT = app.getAppPath()
const RESOURCE_ROOT = CODE_ROOT
const BACKEND_ENTRY = path.join(CODE_ROOT, 'src', 'index.js')

let loginWindow = null
let mainWindow = null
let backendPort = 0
let tray = null
let focusBannerWindow = null

// 后端通过 global.focusBannerBridge 控制横幅窗口
const focusBannerBridge = new EventEmitter()
global.focusBannerBridge = focusBannerBridge

if (process.platform === 'win32') {
  app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID)
}

// ── Login credentials ──
const CREDENTIALS_FILE = path.join(USER_DIR, 'credentials.json')

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function getCredentials() {
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function initCredentials() {
  if (!getCredentials()) {
    const defaultCreds = {
      username: '1',
      passwordHash: sha256('1'),
    }
    fs.mkdirSync(path.dirname(CREDENTIALS_FILE), { recursive: true })
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(defaultCreds, null, 2), 'utf-8')
  }
}

function verifyLogin(username, password) {
  const creds = getCredentials()
  if (!creds) return false
  return creds.username === username && creds.passwordHash === sha256(password)
}

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 480,
    height: 560,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#ffffff',
    title: 'Nimo 提醒助手 · 登录',
    icon: path.join(RESOURCE_ROOT, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'login-preload.cjs'),
    },
  })

  loginWindow.loadFile(path.join(RESOURCE_ROOT, 'login.html'))
  loginWindow.show()

  loginWindow.on('closed', () => {
    loginWindow = null
  })
}

function sendUpdaterStatus(payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('updater:status', {
    currentVersion: app.getVersion(),
    ...payload,
  })
}

async function bootstrapBackend(port) {
  process.env.PULSE_USER_DIR ||= USER_DIR
  process.env.PULSE_RESOURCES_DIR ||= RESOURCE_ROOT
  process.env.PULSE_PORT = String(port)
  await import(pathToFileURL(BACKEND_ENTRY).href)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

async function findFreePort(preferred = 52557) {
  for (const port of [preferred, 0]) {
    try {
      const actual = await new Promise((resolve, reject) => {
        const server = net.createServer()
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => {
          const address = server.address()
          server.close(() => resolve(address.port))
        })
      })
      return actual
    } catch {}
  }
  throw new Error('Unable to find a free local port')
}

function waitForBackend(port, timeoutMs = 30000) {
  const startedAt = Date.now()
  const url = `http://127.0.0.1:${port}/activation-status`

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('Backend startup timed out'))
        return
      }

      const req = http.get(url, res => {
        res.resume()
        resolve()
      })
      req.on('error', () => setTimeout(tick, 300))
      req.setTimeout(1500, () => {
        req.destroy()
        setTimeout(tick, 300)
      })
    }

    tick()
  })
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#ffffff',
    title: 'Nimo 提醒助手',
    icon: path.join(RESOURCE_ROOT, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  // 授予麦克风权限（语音输入需要）
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') return callback(true)
    callback(false)
  })
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') return true
    return false
  })

  // F12 打开开发者工具（调试用）
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  try { await mainWindow.webContents.session.clearCache() } catch {}
  try { await mainWindow.webContents.session.clearStorageData({ storages: ['shadercache', 'cachestorage'] }) } catch {}
  try { await mainWindow.webContents.session.clearCodeCaches({ urls: [] }) } catch {}
  await mainWindow.loadURL(`http://127.0.0.1:${backendPort}/?t=${Date.now()}`)
  // 关闭主窗口时最小化到托盘，不退出
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setupTray() {
  const iconPath = path.join(RESOURCE_ROOT, 'build', 'icon.ico')
  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('Nimo 提醒助手')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主界面',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuiting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function createFocusBannerWindow({ task = '', current_step = '', tasks = [] } = {}) {
  if (focusBannerWindow && !focusBannerWindow.isDestroyed()) {
    focusBannerWindow.webContents.send('focus-banner:update', { task, current_step, tasks })
    return
  }

  const { width: screenW } = require('electron').screen.getPrimaryDisplay().workAreaSize

  focusBannerWindow = new BrowserWindow({
    width: 280,
    height: 60,
    x: Math.round(screenW / 2 - 140),
    y: 48,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    focusable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'focus-banner-preload.cjs'),
    },
  })

  // 给 banner 窗口的 session 也授权麦克风
  focusBannerWindow.webContents.session.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'media') return callback(true)
    callback(false)
  })
  focusBannerWindow.webContents.session.setPermissionCheckHandler((wc, permission) => {
    if (permission === 'media') return true
    return false
  })

  focusBannerWindow.loadFile(path.join(RESOURCE_ROOT, 'focus-banner.html'))

  focusBannerWindow.webContents.once('did-finish-load', () => {
    if (!focusBannerWindow || focusBannerWindow.isDestroyed()) return
    // 先发端口配置，让语音识别结果能发回后端
    focusBannerWindow.webContents.send('focus-banner:config', { port: backendPort })
    focusBannerWindow.webContents.send('focus-banner:update', { task, current_step, tasks })
    autoResizeBannerWindow()
  })

  focusBannerWindow.on('closed', () => {
    focusBannerWindow = null
  })
}

function autoResizeBannerWindow() {
  if (!focusBannerWindow || focusBannerWindow.isDestroyed()) return
  focusBannerWindow.webContents.executeJavaScript(`
    (() => {
      const b = document.getElementById('banner')
      return b ? { w: b.offsetWidth, h: b.offsetHeight } : null
    })()
  `).then(size => {
    if (!size || !focusBannerWindow || focusBannerWindow.isDestroyed()) return
    const padW = 0
    const padH = 0
    focusBannerWindow.setSize(Math.max(160, size.w + padW), Math.max(40, size.h + padH))
  }).catch(() => {})
}

// Focus Banner IPC handlers
ipcMain.on('focus-banner:close', () => {
  if (focusBannerWindow && !focusBannerWindow.isDestroyed()) {
    focusBannerWindow.close()
    focusBannerWindow = null
  }
})

ipcMain.on('focus-banner:set-expanded', (_e, { expanded }) => {
  if (!focusBannerWindow || focusBannerWindow.isDestroyed()) return
  setTimeout(() => autoResizeBannerWindow(), 50)
})

ipcMain.on('focus-banner:request-resize', () => {
  setTimeout(() => autoResizeBannerWindow(), 30)
})

ipcMain.on('focus-banner:toggle-task', (_e, { idx, done }) => {
  // 任务勾选状态更改，横幅已在前端自行更新，无需额外操作
})

// 后端 bridge 事件监听
focusBannerBridge.on('command', ({ action, task, current_step, tasks }) => {
  if (action === 'show' || action === 'update') {
    createFocusBannerWindow({ task, current_step, tasks })
  }
})

focusBannerBridge.on('hide', () => {
  if (focusBannerWindow && !focusBannerWindow.isDestroyed()) {
    focusBannerWindow.close()
    focusBannerWindow = null
  }
})

function setupAutoUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendUpdaterStatus({ stage: 'checking', message: 'Checking for updates...' })
  })

  autoUpdater.on('update-available', info => {
    console.log('[updater] update available', info?.version)
    sendUpdaterStatus({
      stage: 'available',
      version: info?.version,
      message: `New version ${info?.version || ''} found, downloading...`.trim(),
    })
  })

  autoUpdater.on('download-progress', progress => {
    sendUpdaterStatus({
      stage: 'downloading',
      percent: Number(progress?.percent || 0),
      transferred: progress?.transferred || 0,
      total: progress?.total || 0,
      message: `Downloading update ${Math.round(Number(progress?.percent || 0))}%`,
    })
  })

  autoUpdater.on('update-downloaded', info => {
    sendUpdaterStatus({
      stage: 'downloaded',
      version: info?.version,
      message: `Version ${info?.version || ''} is ready to install`.trim(),
    })

    const result = dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: `Nimo 提醒助手 ${info.version} has been downloaded. Restart now to install?`,
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })

    if (result === 0) autoUpdater.quitAndInstall()
  })

  autoUpdater.on('update-not-available', info => {
    sendUpdaterStatus({
      stage: 'idle',
      version: info?.version || app.getVersion(),
      message: 'You already have the latest version',
    })
  })

  autoUpdater.on('error', err => {
    const message = err?.message || String(err || 'Update failed')
    console.warn('[updater] update failed', message)
    sendUpdaterStatus({
      stage: 'error',
      message,
    })
  })

  if (!IS_DEV) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }
}

// Login flow removed. Kept these no-op handlers in case any cached renderer page calls them.
ipcMain.handle('pulse:login', async () => ({ ok: true }))
ipcMain.on('pulse:quit-from-login', () => {
  app.isQuiting = true
  app.quit()
})

ipcMain.handle('app:get-version', () => app.getVersion())

ipcMain.handle('updater:check-for-updates', async () => {
  if (IS_DEV) {
    const message = 'Update checks are disabled in development mode'
    sendUpdaterStatus({ stage: 'dev', message })
    return { ok: false, skipped: true, reason: 'dev', message }
  }

  try {
    sendUpdaterStatus({ stage: 'checking', message: 'Checking for updates...' })
    const result = await autoUpdater.checkForUpdates()
    return {
      ok: true,
      updateInfo: result?.updateInfo || null,
    }
  } catch (error) {
    const message = error?.message || String(error || 'Update check failed')
    sendUpdaterStatus({ stage: 'error', message })
    return { ok: false, message }
  }
})

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  // 主窗口关闭后保持后台运行（Focus Banner 等桌面功能继续工作）
  // 只有托盘菜单「退出」才真正退出
})

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  initCredentials()

  // 0.1.2+：不再有登录窗口，应用启动时直接拉起后端 + 主窗口，
  // 由后端 / 路由判断是否需要进 /onboarding（首次配 API Key + 选行业）。
  try {
    backendPort = await findFreePort(52557)
    await bootstrapBackend(backendPort)
    await waitForBackend(backendPort)
    await createWindow()
    setupTray()
  } catch (err) {
    console.error('[main] bootstrap failed:', err)
    dialog.showErrorBox('Nimo 提醒助手启动失败', String(err?.message || err))
    app.quit()
    return
  }

  // F11 切换全屏
  globalShortcut.register('F11', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.setFullScreen(!mainWindow.isFullScreen())
  })

  // 开发快捷键
  if (IS_DEV) {
    globalShortcut.register('F12', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents.toggleDevTools()
    })
    globalShortcut.register('CommandOrControl+R', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents.reloadIgnoringCache()
    })
  }
})
