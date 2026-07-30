import http from 'http'
import fs from 'fs'
import path from 'path'
import net from 'net'
import crypto from 'crypto'
import os from 'os'
import { inflateRawSync } from 'zlib'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'
import OpusScript from 'opusscript'
import { pushMessage } from './queue.js'
import { getDB, getConfig, setConfig, insertUISignal, upsertMediaHistory, getMediaHistory, insertMemory, getDailySummary, upsertDailySummary, createReadingDocument, listReadingDocuments, getReadingDocument, touchReadingDocument, updateReadingDocumentSummary, deleteReadingDocument, listChatThreads, createChatThread, updateChatThread, deleteChatThread, clearChatThreadConversations, touchChatThread, listActiveReminders, listCompletedReminders, getReminderStats, createReminder, cancelReminder, completeReminder, snoozeReminder, getReminderById } from './db.js'
import { emitEvent, addSSEClient, removeSSEClient, addDeviceSSEClient, removeDeviceSSEClient, emitDeviceEvent, addACUIClient, removeACUIClient, removeActiveUICard, flushStickyEvents } from './events.js'
import { getQuotaStatus } from './quota.js'
import { isRunning, stopLoop, startLoop } from './control.js'
import { buildHeartbeatSystemPromptPreview } from './system-prompt-preview.js'
import { paths } from './paths.js'
import { config, activate as activateLLM, getActivationStatus, switchModel, setTemperature, getMinimaxKey, setMinimaxKey, getSocialConfig, setSocialConfig, getVoiceConfig, setVoiceConfig, getTTSConfig, setTTSConfig, getTTSCredentials, getProviderSummaries } from './config.js'
import { streamTTS, TTS_PROVIDERS, TTS_VOICES } from './voice/tts-providers.js'
import { enqueueDeviceSpeech, getNextDeviceSpeech, getDeviceSpeechById, ackDeviceSpeech, getDeviceSpeechQueueStatus, setSpeechPregenHook } from './device-speech.js'
import { restartConnector } from './social/index.js'
import { getVoiceStatus, startVoiceServer, stopVoiceServer, restartVoiceServer } from './voice/manager.js'
import { getCapabilityRoadmap } from './capabilities/roadmap.js'
import { replaceProvider } from './providers/registry.js'
import { persistAppState } from './capabilities/executor.js'
import { MinimaxProvider } from './providers/minimax.js'
import { handleSocialWebhook, isSocialWebhookPath } from './social/webhooks.js'
import { getClawbotQR, logoutClawbot } from './social/wechat-clawbot.js'
import { createCloudASRSession } from './voice/cloud-asr.js'
import { getHotspots, setHotspotPanelState, getHotspotPanelState } from './hotspots.js'
import { getIndustryRadar, clearIndustryRadarCache } from './industry-radar.js'
import { getPersonCard, setPersonCardPanelState, getPersonCardPanelState } from './person-cards.js'
import { setDocPanelState, getDocPanelState, DOC_TOPICS } from './docs.js'
import { getIndustryState, setEnabledIndustries, setActiveIndustry, markOnboarded, setOnboarded, isOnboarded, getActivePack, getActiveIndustry } from './industry/loader.js'
import { listCustomers, getCustomer, saveCustomer, deleteCustomer, getCurrentCustomer, setCurrentCustomerId } from './customers.js'
import { getCompanyProfile, saveCompanyProfile, listEmployees, saveEmployee, deleteEmployee } from './org-profile.js'
import { getActivityTrackerStatus, setActivityTrackerConfig, runActivitySample, runScreenAnalysisSample } from './activity/tracker.js'
import { getActivitySummary, getActivityTimeline, listActivityEvents, listScreenAnalyses, todayDateString } from './activity/reports.js'
import { listCatalogByCategory, CATEGORY_META } from './activity/app-catalog.js'
import { callLLM } from './llm.js'

// 启动一次性时间戳：用于给 brain-ui 静态资源加版本号绕开 Electron webContents 缓存
const ASSET_VERSION = process.env.PULSE_BOOT_TS || String(Date.now())

export { emitEvent }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function customerHealthSignal({ stage = '', staleDays = 0 } = {}) {
  const s = String(stage || '').toLowerCase()
  const days = Number.isFinite(staleDays) ? staleDays : 999
  if (/丢单|关闭|无效/.test(s)) return { label: '已关闭', level: 'muted', score: 10 }
  if (/签约|成交|长期合作/.test(s)) return { label: '已成交', level: 'good', score: 95 }
  if (days >= 30) return { label: '沉睡客户', level: 'danger', score: 15 }
  if (days >= 14) return { label: '流失风险', level: 'danger', score: 28 }
  if (days >= 7) return { label: '需要跟进', level: 'warn', score: 48 }
  if (/报价|价格|demo|演示|poc|验收|合同|签约/.test(s)) return { label: '高意向', level: 'hot', score: 82 }
  if (days >= 3) return { label: '轻度停滞', level: 'warn', score: 62 }
  return { label: '正常推进', level: 'good', score: 72 }
}

const INDEX_PATH         = paths.indexHtml
const DASHBOARD_PATH     = paths.dashboardHtml
const BRAIN_PATH         = paths.brainHtml
const BRAIN_UI_PATH      = paths.brainUiHtml
const WEBSITE_PATH       = paths.websiteHtml
const SYSTEM_PROMPT_PATH = paths.systemPromptHtml
const ACTIVATION_PATH    = paths.activationHtml
const ONBOARDING_PATH    = paths.onboardingHtml
const BRAIN_UI_ASSET_ROOT = paths.brainUiAssetRoot
const D3_VENDOR_PATH     = path.join(paths.resourcesDir, 'node_modules', 'd3', 'dist', 'd3.min.js')
const SANDBOX_PATH       = paths.sandboxDir
const DEFAULT_AGENT_NAME = 'Nimo 提醒助手'
const DEFAULT_API_HOST = '127.0.0.1'
const CLOUD_DEVICE_ID_CONFIG = 'nimo_cloud_device_install_id'

function getApiHost() {
  return String(globalThis.process?.env?.NIMO_BIND_HOST || globalThis.process?.env?.PULSE_HOST || DEFAULT_API_HOST).trim() || DEFAULT_API_HOST
}

function getCloudConfig() {
  const env = globalThis.process?.env || {}
  const cloudApi = String(env.NIMO_CLOUD_API || '').trim()
  const localAuthDisabled = /^(0|false|no|off)$/i.test(String(env.NIMO_LOCAL_AUTH || '').trim())
  return {
    ok: true,
    cloudApi: cloudApi || '',
    allowOverride: !/^(1|true|yes|on)$/i.test(String(env.NIMO_CLOUD_API_LOCK || '').trim()),
    localAuth: !cloudApi && !localAuthDisabled,
  }
}

function getCloudDeviceIdentity() {
  let installId = getConfig(CLOUD_DEVICE_ID_CONFIG)
  if (!installId) {
    installId = `nimodev_${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')}`
    setConfig(CLOUD_DEVICE_ID_CONFIG, installId)
  }
  const host = os.hostname?.() || 'unknown-host'
  let username = 'unknown-user'
  try { username = os.userInfo?.().username || username } catch {}
  const platform = globalThis.process?.platform || 'unknown-platform'
  const arch = globalThis.process?.arch || 'unknown-arch'
  const raw = [installId, host, username, platform, arch].join('|')
  const fingerprint = `nimo_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)}`
  return {
    ok: true,
    fingerprint,
    name: `Nimo Reminder Desktop · ${platform} · ${host}`,
    platform,
    arch,
  }
}

function isLanAccessEnabled() {
  const env = globalThis.process?.env || {}
  if (/^(1|true|yes|on)$/i.test(String(env.PULSE_ALLOW_LAN || '').trim())) return true
  const host = String(env.NIMO_BIND_HOST || '').trim()
  return !!host && host !== '127.0.0.1' && host !== 'localhost'
}

function normalizeRemoteAddress(address = '') {
  const value = String(address || '').trim().toLowerCase()
  if (value.startsWith('::ffff:')) return value.slice('::ffff:'.length)
  return value
}

function isLoopbackAddress(address = '') {
  const value = normalizeRemoteAddress(address)
  return value === '127.0.0.1'
    || value === '::1'
    || value === 'localhost'
}

function isLoopbackRequest(req) {
  return isLoopbackAddress(req.socket?.remoteAddress)
}

function isPrivateLanAddress(address = '') {
  const value = normalizeRemoteAddress(address)
  if (!value) return false

  if (net.isIP(value) === 4) {
    const [a, b] = value.split('.').map(part => Number(part))
    return a === 10
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)
  }

  if (net.isIP(value) === 6) {
    return value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')
  }

  return false
}

function isLanRequest(req) {
  return isLanAccessEnabled() && isPrivateLanAddress(req.socket?.remoteAddress)
}

function getLocalNetworkAddresses() {
  const interfaces = os.networkInterfaces?.() || {}
  const addresses = []
  for (const items of Object.values(interfaces)) {
    for (const item of items || []) {
      if (!item || item.internal || item.family !== 'IPv4') continue
      if (!isPrivateLanAddress(item.address)) continue
      addresses.push(item.address)
    }
  }
  return [...new Set(addresses)].sort((a, b) => localAddressScore(a) - localAddressScore(b))
}

function localAddressScore(address = '') {
  const [a, b] = String(address).split('.').map(part => Number(part))
  if (a === 10) return 10
  if (a === 192 && b === 168) return 20
  if (a === 172 && b >= 16 && b <= 31) return 30
  return 100
}

function getDeviceServerInfo(port) {
  const bindHost = getApiHost()
  const lanEnabled = isLanAccessEnabled()
  const lanAddresses = getLocalNetworkAddresses()
  const publicHost = String(globalThis.process?.env?.NIMO_PUBLIC_HOST || globalThis.process?.env?.PULSE_PUBLIC_HOST || '').trim()
  const localUrl = `http://127.0.0.1:${port}`
  const lanUrls = lanEnabled ? lanAddresses.map((address) => `http://${address}:${port}`) : []
  const recommendedUrl = publicHost
    ? `http://${publicHost}:${port}`
    : (lanUrls[0] || (bindHost !== '127.0.0.1' && bindHost !== 'localhost' ? `http://${bindHost}:${port}` : localUrl))
  return {
    name: DEFAULT_AGENT_NAME,
    host: bindHost,
    port,
    lanEnabled,
    localUrl,
    lanAddresses,
    lanUrls,
    recommendedUrl,
    protocolVersion: 2,
  }
}

function getXiaozhiPublicBaseUrl(port) {
  const env = globalThis.process?.env || {}
  const explicit = String(env.NIMO_XIAOZHI_PUBLIC_URL || env.PULSE_PUBLIC_URL || '').trim().replace(/\/$/, '')
  if (explicit) return explicit
  const info = getDeviceServerInfo(port)
  return String(info.recommendedUrl || info.localUrl || `http://127.0.0.1:${port}`).replace(/\/$/, '')
}

function buildXiaozhiOtaResponse({ port }) {
  const baseUrl = getXiaozhiPublicBaseUrl(port)
  const wsBaseUrl = baseUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')
  const now = Date.now()
  return {
    server_time: {
      timestamp: now,
      timezone_offset: -new Date().getTimezoneOffset(),
    },
    protocol: 'websocket',
    mqtt: null,
    websocket: {
      url: `${wsBaseUrl}/nimo/ws`,
      token: String(globalThis.process?.env?.NIMO_XIAOZHI_TOKEN || 'nimo-local'),
      version: 2,
    },
    firmware: {
      version: '0.0.0',
      url: '',
    },
  }
}

function sendXiaozhiJson(ws, payload) {
  if (!ws || ws.readyState !== ws.OPEN) return false
  try {
    ws.send(JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

function createXiaozhiSessionId() {
  return `nimo-xz-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
}

function makeXiaozhiLine(text = '', max = 120) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function replyXiaozhiText(ws, sessionId, text, { showUser = '', emotion = 'happy' } = {}) {
  const line = makeXiaozhiLine(text || 'Nimo is connected.', 180)
  if (showUser) sendXiaozhiJson(ws, { type: 'stt', text: makeXiaozhiLine(showUser, 120), session_id: sessionId })
  sendXiaozhiJson(ws, { type: 'llm', emotion, text: line, session_id: sessionId })
  sendXiaozhiJson(ws, { type: 'tts', state: 'start', session_id: sessionId })
  sendXiaozhiJson(ws, { type: 'tts', state: 'sentence_start', text: line, session_id: sessionId })
  sendXiaozhiJson(ws, { type: 'tts', state: 'stop', session_id: sessionId })
}

function getXiaozhiProtocolVersion(req, helloMsg = null) {
  const headerVersion = Number(req?.headers?.['protocol-version'] || 0)
  const helloVersion = Number(helloMsg?.version || 0)
  return headerVersion || helloVersion || 1
}

function parseXiaozhiAudioPacket(raw, protocolVersion = 1) {
  const buf = Buffer.from(raw)
  if (!buf.length) return null

  if (protocolVersion === 2 && buf.length >= 16) {
    const version = buf.readUInt16BE(0)
    const type = buf.readUInt16BE(2)
    const timestamp = buf.readUInt32BE(8)
    const payloadSize = buf.readUInt32BE(12)
    if (version === 2 && type === 0 && payloadSize > 0 && payloadSize <= buf.length - 16) {
      return { payload: buf.subarray(16, 16 + payloadSize), timestamp, protocolVersion: 2 }
    }
  }

  if (protocolVersion === 3 && buf.length >= 4) {
    const type = buf.readUInt8(0)
    const payloadSize = buf.readUInt16BE(2)
    if (type === 0 && payloadSize > 0 && payloadSize <= buf.length - 4) {
      return { payload: buf.subarray(4, 4 + payloadSize), timestamp: 0, protocolVersion: 3 }
    }
  }

  return { payload: buf, timestamp: 0, protocolVersion: 1 }
}

function getXiaozhiStatusText() {
  let activeRows = []
  try { activeRows = listActiveReminders(10).map(normalizeReminderRow) } catch {}
  const next = activeRows[0]
  if (next) {
    return `Nimo connected. Next reminder: ${toDeviceTaskLabel(next.task, 'Open Nimo')} at ${formatDeviceDueLabel(next.dueAt)}.`
  }
  return 'Nimo connected. Your local memory and reminders are ready. Real voice ASR and Opus TTS are the next step.'
}

function handleXiaozhiWsConnection(ws, req, { port }) {
  const sessionId = createXiaozhiSessionId()
  const deviceId = normalizeDeviceId(req.headers['device-id'] || req.headers['client-id'] || sessionId)
  normalizeDeviceRecord({
    id: deviceId,
    name: 'Nimo ESP32-S3',
    type: 'nimo-voice',
    capabilities: ['nimo-ws', 'opus-audio', 'screen', 'wake-word'],
  }, req)
  emitEvent('device_changed', { action: 'nimo_connected', deviceId })
  emitDeviceEvent('device_registered', { id: deviceId, type: 'nimo-voice' })
  updateHardwareVoiceStats({ connected: true, deviceId, sessionId, listenState: 'connected', audioFrames: 0, decodedPcmBytes: 0, decodeErrors: 0, asrErrors: 0, lastError: '' })

  let helloSeen = false
  let audioFrames = 0
  let lastListenMode = ''
  let asrSession = null
  let opusDecoder = null
  let finalTranscript = ''
  let protocolVersion = Math.max(1, Math.min(3, getXiaozhiProtocolVersion(req)))
  let audioDebugFrames = 0

  const closeAsr = () => {
    try { asrSession?.close?.() } catch {}
    asrSession = null
  }
  const closeOpus = () => {
    try { opusDecoder?.delete?.() } catch {}
    opusDecoder = null
  }
  const startAsr = () => {
    closeAsr()
    closeOpus()
    finalTranscript = ''
    audioFrames = 0
    updateHardwareVoiceStats({ listenState: 'start', audioFrames: 0, decodedPcmBytes: 0, decodeErrors: 0, asrErrors: 0, lastError: '' })
    try {
      opusDecoder = new OpusScript(HARDWARE_VOICE_SAMPLE_RATE, 1, OpusScript.Application.VOIP)
    } catch (err) {
      sendXiaozhiJson(ws, { type: 'stt', text: `Opus decoder failed: ${err.message}`, session_id: sessionId })
      return
    }
    let rawCfg = {}
    try { rawCfg = JSON.parse(fs.readFileSync(paths.configFile, 'utf-8'))?.voice || {} } catch {}
    asrSession = createCloudASRSession(
      { provider: rawCfg.provider || 'aliyun', lang: rawCfg.lang || 'zh', ...rawCfg },
      (text, isFinal) => {
        const clean = makeXiaozhiLine(text, 160)
        if (!clean) return
        sendXiaozhiJson(ws, { type: 'stt', text: clean, session_id: sessionId })
        if (isFinal) {
          finalTranscript = clean
          pushMessage(deviceId, clean, 'HARDWARE_VOICE', { threadId: 'hardware' })
          emitEvent('message_in', { from_id: deviceId, content: clean, channel: 'HARDWARE_VOICE', thread_id: 'hardware', timestamp: new Date().toISOString() })
          replyXiaozhiText(ws, sessionId, `I heard: ${clean}. NewPulse has received it.`, { emotion: 'happy' })
        }
      },
      (errMsg) => {
        updateHardwareVoiceStats({ asrErrors: hardwareVoiceStats.asrErrors + 1, lastError: `ASR: ${makeXiaozhiLine(errMsg, 120)}` })
        sendXiaozhiJson(ws, { type: 'stt', text: `ASR error: ${makeXiaozhiLine(errMsg, 120)}`, session_id: sessionId })
      },
      () => { asrSession = null }
    )
  }

  ws.on('message', (raw, isBinary) => {
    touchDevice(deviceId, req)
    if (isBinary || raw instanceof Buffer && raw.length > 0 && raw[0] !== 0x7b) {
      if (!hardwareVoiceControl.captureEnabled) {
        audioFrames += 1
        if (audioFrames === 1) {
          sendXiaozhiJson(ws, { type: 'stt', text: 'Hardware microphone is paused in NewPulse.', session_id: sessionId })
        }
        return
      }
      audioFrames += 1
      updateHardwareVoiceStats({ audioFrames: hardwareVoiceStats.audioFrames + 1, lastAudioAt: new Date().toISOString() })
      if (audioFrames === 1) {
        sendXiaozhiJson(ws, { type: 'stt', text: 'Receiving microphone audio...', session_id: sessionId })
      }
      try {
        if (opusDecoder && asrSession) {
          const packet = parseXiaozhiAudioPacket(raw, protocolVersion)
          if (!packet?.payload?.length) return
          if (packet.protocolVersion !== protocolVersion) protocolVersion = packet.protocolVersion
          if (audioDebugFrames < 3) {
            audioDebugFrames += 1
            console.log(`[xiaozhi] audio frame v${packet.protocolVersion} raw=${Buffer.from(raw).length} payload=${packet.payload.length} prefix=${Buffer.from(raw).subarray(0, 16).toString('hex')}`)
          }
          const pcm = opusDecoder.decode(packet.payload)
          if (pcm?.length) {
            updateHardwareVoiceStats({ decodedPcmBytes: hardwareVoiceStats.decodedPcmBytes + pcm.length, lastPcmAt: new Date().toISOString() })
            asrSession.sendAudio(Buffer.from(pcm))
          }
        }
      } catch (err) {
        updateHardwareVoiceStats({ decodeErrors: hardwareVoiceStats.decodeErrors + 1, lastError: `Decode: ${makeXiaozhiLine(err.message, 80)}` })
        if (audioFrames <= 3) sendXiaozhiJson(ws, { type: 'stt', text: `Audio decode error: ${makeXiaozhiLine(err.message, 80)}`, session_id: sessionId })
      }
      return
    }

    let msg = null
    try { msg = JSON.parse(raw.toString('utf-8')) } catch { return }
    const type = String(msg?.type || '')

    if (type === 'hello') {
      helloSeen = true
      protocolVersion = Math.max(1, Math.min(3, getXiaozhiProtocolVersion(req, msg)))
      sendXiaozhiJson(ws, {
        type: 'hello',
        transport: 'websocket',
        session_id: sessionId,
        audio_params: {
          format: 'opus',
          sample_rate: HARDWARE_VOICE_SAMPLE_RATE,
          channels: 1,
          frame_duration: 60,
        },
      })
      setTimeout(() => {
        replyXiaozhiText(ws, sessionId, getXiaozhiStatusText(), { emotion: 'happy' })
      }, 250)
      return
    }

    if (!helloSeen) return

    if (type === 'listen') {
      const state = String(msg.state || '')
      updateHardwareVoiceStats({ listenState: state || 'listen' })
      lastListenMode = String(msg.mode || lastListenMode || '')
      if (state === 'detect') {
        const wake = makeXiaozhiLine(msg.text || 'wake word', 40)
        replyXiaozhiText(ws, sessionId, 'Nimo heard the wake word. I am ready to connect real speech recognition.', { showUser: wake, emotion: 'happy' })
      } else if (state === 'start') {
        if (!hardwareVoiceControl.captureEnabled) {
          closeAsr()
          closeOpus()
          sendXiaozhiJson(ws, { type: 'stt', text: 'Hardware microphone is paused in NewPulse.', session_id: sessionId })
          return
        }
        startAsr()
        sendXiaozhiJson(ws, { type: 'stt', text: `Listening started${lastListenMode ? ` (${lastListenMode})` : ''}.`, session_id: sessionId })
      } else if (state === 'stop') {
        try { asrSession?.flush?.() } catch {}
        const summary = finalTranscript
          ? `NewPulse heard: ${finalTranscript}`
          : (audioFrames > 0 ? `I received ${audioFrames} audio frames and sent them to ASR.` : 'Listening stopped. No audio frames were received.')
        if (!finalTranscript) replyXiaozhiText(ws, sessionId, summary, { emotion: 'neutral' })
      }
      return
    }

    if (type === 'abort') {
      sendXiaozhiJson(ws, { type: 'tts', state: 'stop', session_id: sessionId })
      return
    }

    if (type === 'mcp') {
      sendXiaozhiJson(ws, {
        type: 'mcp',
        session_id: sessionId,
        payload: {
          jsonrpc: '2.0',
          id: msg.payload?.id || null,
          result: { ok: true, server: 'Nimo NewPulse local bridge' },
        },
      })
    }
  })

  ws.on('close', () => {
    closeAsr()
    closeOpus()
    updateHardwareVoiceStats({ connected: false, listenState: 'closed' })
    touchDevice(deviceId, req)
    emitEvent('device_changed', { action: 'nimo_disconnected', deviceId })
  })
}
function isLoopbackOrigin(origin = '') {
  if (!origin || origin === 'null') return true
  try {
    const parsed = new URL(origin)
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
  } catch {
    return false
  }
}

function isAllowedOrigin(origin = '') {
  if (isLoopbackOrigin(origin)) return true
  if (!isLanAccessEnabled()) return false
  try {
    const parsed = new URL(origin)
    return isPrivateLanAddress(parsed.hostname)
  } catch {
    return false
  }
}

function getAuthToken() {
  return String(globalThis.process?.env?.PULSE_API_TOKEN || '').trim()
}

function hasValidAuthToken(req, url) {
  const expected = getAuthToken()
  if (!expected) return false
  const header = req.headers.authorization || ''
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const queryToken = url.searchParams.get('token')
  return bearer === expected || queryToken === expected
}

function requireLocalOrToken(req, res, url) {
  if (hasAllowedAccess(req, url)) return true
  jsonResponse(res, 403, { ok: false, error: 'forbidden' })
  return false
}

function hasAllowedAccess(req, url) {
  return isLoopbackRequest(req) || hasValidAuthToken(req, url) || isLanRequest(req)
}

function isSensitivePath(pathname) {
  return pathname === '/activate'
    || pathname === '/settings'
    || pathname.startsWith('/settings/')
    || pathname.startsWith('/admin/')
    || pathname.startsWith('/memories/')
}

function isPathInside(parentDir, candidatePath) {
  const parent = path.resolve(parentDir)
  const candidate = path.resolve(candidatePath)
  const relative = path.relative(parent, candidate)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function readBinaryBody(req, maxBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let rejected = false
    req.on('data', chunk => {
      if (rejected) return
      total += chunk.length
      if (total > maxBytes) {
        rejected = true
        reject(new Error(`request body too large: ${total}/${maxBytes}`))
        try { req.destroy() } catch {}
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks))
    })
    req.on('error', reject)
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function recognizeDevicePcm(pcmBuffer, { deviceId = 'nimo-esp32s3-001', sampleRate = 16000 } = {}) {
  if (!Buffer.isBuffer(pcmBuffer) || pcmBuffer.length < 800) {
    throw new Error('empty pcm audio')
  }
  let rawCfg = {}
  try { rawCfg = JSON.parse(fs.readFileSync(paths.configFile, 'utf-8'))?.voice || {} } catch {}

  let finalTranscript = ''
  let latestTranscript = ''
  let lastError = ''
  let closed = false

  const session = createCloudASRSession(
    { provider: rawCfg.provider || 'aliyun', lang: rawCfg.lang || 'zh', ...rawCfg },
    (text, isFinal) => {
      const clean = makeXiaozhiLine(text, 180)
      if (!clean) return
      latestTranscript = clean
      if (isFinal) finalTranscript = clean
    },
    (errMsg) => { lastError = makeXiaozhiLine(errMsg, 160) },
    () => { closed = true }
  )

  if (!session) throw new Error(lastError || 'ASR session unavailable')

  const chunkBytes = Math.max(640, Math.floor(sampleRate * 2 / 10))
  for (let offset = 0; offset < pcmBuffer.length; offset += chunkBytes) {
    session.sendAudio(pcmBuffer.subarray(offset, Math.min(offset + chunkBytes, pcmBuffer.length)))
  }
  try { session.flush?.() } catch {}

  const deadline = Date.now() + 9000
  while (Date.now() < deadline && !finalTranscript && !lastError) {
    await sleep(120)
    if (closed && latestTranscript) break
  }
  try { session.close?.() } catch {}

  const transcript = finalTranscript || latestTranscript
  if (!transcript && lastError) throw new Error(lastError)
  if (!transcript) throw new Error('ASR returned no transcript')
  pushMessage(deviceId, transcript, 'HARDWARE_VOICE', { threadId: 'hardware' })
  emitEvent('message_in', { from_id: deviceId, content: transcript, channel: 'HARDWARE_VOICE', thread_id: 'hardware', timestamp: new Date().toISOString() })
  return transcript
}

function resolveFfmpegPath() {
  const explicit = String(globalThis.process?.env?.FFMPEG_PATH || '').trim()
  if (explicit) return explicit
  const exe = globalThis.process?.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const local = path.resolve(__dirname, '..', 'node_modules', 'ffmpeg-static', exe)
  const wingetLink = globalThis.process?.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', exe)
    : ''
  const candidates = [
    wingetLink,
    // Prefer full system ffmpeg; TRAE/ffmpeg-static builds may lack mp3 demuxer.
    'ffmpeg',
    local,
    globalThis.process?.platform === 'win32' ? 'G:\\trea\\TRAE SOLO\\resources\\app\\bin\\ffmpeg.exe' : '',
  ].filter(Boolean)
  const runnable = candidates.find((candidate) => {
    if (candidate === 'ffmpeg') return true
    try { return fs.existsSync(candidate) } catch { return false }
  })
  return runnable || 'ffmpeg'
}

async function createConvertedDeviceSpeechStream(item, output = 'pcm') {
  const creds = getTTSCredentials()
  const ttsStream = await streamTTS({
    text: item.text,
    provider: creds.provider,
    voiceId: creds.voiceId || undefined,
    keys: {
      doubaoKey: creds.doubaoKey,
      doubaoAppId: creds.doubaoAppId,
      doubaoAccessKey: creds.doubaoAccessKey,
      doubaoResourceId: creds.doubaoResourceId,
      minimaxKey: creds.minimaxKey,
      openaiKey: creds.openaiKey,
      openaiBaseURL: creds.openaiBaseURL,
      elevenLabsKey: creds.elevenLabsKey,
      volcanoAppId: creds.volcanoAppId,
      volcanoToken: creds.volcanoToken,
    },
  })

  // MiniMax/OpenAI TTS usually returns mp3. Use stdin/stdout "-" pipes with a
  // full ffmpeg build (WinGet/system). Autodetect input; don't force -f mp3
  // because stripped ffmpeg builds reject unknown demuxers.
  const ffmpegArgs = output === 'wav'
    ? ['-hide_banner', '-loglevel', 'error', '-i', '-', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', '-f', 'wav', '-']
    : ['-hide_banner', '-loglevel', 'error', '-i', '-', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', '-f', 's16le', '-']
  const child = spawn(resolveFfmpegPath(), ffmpegArgs, { windowsHide: true })
  let stderr = ''
  child.stderr?.on('data', chunk => { stderr += chunk.toString('utf-8') })
  child.on('close', code => {
    if (code) console.warn(`[device speech] ffmpeg exited ${code}: ${stderr.slice(0, 300)}`)
  })
  ttsStream.on('error', err => {
    try { child.stdin.destroy(err) } catch {}
  })
  ttsStream.pipe(child.stdin)
  return child.stdout
}

const deviceSpeechAudioCache = new Map()

function pregenerateDeviceSpeechAudio(item) {
  if (!item?.id) return
  const promise = (async () => {
    const stream = await createConvertedDeviceSpeechStream(item, 'pcm')
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    return Buffer.concat(chunks)
  })()
  promise.catch(() => deviceSpeechAudioCache.delete(item.id))
  deviceSpeechAudioCache.set(item.id, promise)
  while (deviceSpeechAudioCache.size > 8) {
    deviceSpeechAudioCache.delete(deviceSpeechAudioCache.keys().next().value)
  }
}

setSpeechPregenHook(pregenerateDeviceSpeechAudio)

const deviceRegistry = new Map()

const HARDWARE_VOICE_SAMPLE_RATE = 16000

const hardwareVoiceControl = {
  captureEnabled: false,
  updatedAt: new Date().toISOString(),
  updatedBy: 'boot',
}

const hardwareVoiceStats = {
  connected: false,
  deviceId: '',
  sessionId: '',
  listenState: '',
  audioFrames: 0,
  decodedPcmBytes: 0,
  decodeErrors: 0,
  asrErrors: 0,
  lastAudioAt: '',
  lastPcmAt: '',
  lastError: '',
  updatedAt: new Date().toISOString(),
}

function getHardwareVoiceControl() {
  return { ...hardwareVoiceControl }
}

function updateHardwareVoiceStats(patch = {}) {
  Object.assign(hardwareVoiceStats, patch, { updatedAt: new Date().toISOString() })
  return getHardwareVoiceStats()
}

function getHardwareVoiceStats() {
  return { ...hardwareVoiceStats }
}

function setHardwareVoiceCapture(enabled, updatedBy = 'api') {
  hardwareVoiceControl.captureEnabled = !!enabled
  hardwareVoiceControl.updatedAt = new Date().toISOString()
  hardwareVoiceControl.updatedBy = String(updatedBy || 'api').slice(0, 40)
  const capture = getHardwareVoiceControl()
  emitEvent('device_changed', { action: 'hardware_voice_capture', capture })
  emitDeviceEvent('device_voice_capture', capture)
  return capture
}

function normalizeDeviceId(value = '') {
  const cleaned = String(value || '').trim().replace(/[^\w.-]/g, '').slice(0, 64)
  return cleaned || `device_${crypto.randomBytes(6).toString('hex')}`
}

function normalizeDeviceRecord(input = {}, req = null) {
  const now = new Date().toISOString()
  const id = normalizeDeviceId(input.id || input.deviceId || input.device_id)
  const existing = deviceRegistry.get(id) || {}
  const record = {
    ...existing,
    id,
    name: String(input.name || existing.name || 'Nimo Device').trim().slice(0, 80) || 'Nimo Device',
    type: String(input.type || existing.type || 'hardware').trim().slice(0, 40) || 'hardware',
    capabilities: Array.isArray(input.capabilities) ? input.capabilities.slice(0, 20).map((item) => String(item).slice(0, 40)) : (existing.capabilities || []),
    remoteAddress: normalizeRemoteAddress(req?.socket?.remoteAddress || existing.remoteAddress || ''),
    registeredAt: existing.registeredAt || now,
    lastSeenAt: now,
    online: true,
    hardwareVoiceCapture: getHardwareVoiceControl(),
  }
  deviceRegistry.set(id, record)
  return record
}

function touchDevice(id, req = null) {
  const key = normalizeDeviceId(id)
  const existing = deviceRegistry.get(key)
  if (!existing) return null
  const record = {
    ...existing,
    remoteAddress: normalizeRemoteAddress(req?.socket?.remoteAddress || existing.remoteAddress || ''),
    lastSeenAt: new Date().toISOString(),
    online: true,
  }
  deviceRegistry.set(key, record)
  return record
}

function listDeviceRecords() {
  const now = Date.now()
  return [...deviceRegistry.values()]
    .map((record) => {
      const last = new Date(record.lastSeenAt || 0).getTime()
      return { ...record, online: Number.isFinite(last) && now - last < 90 * 1000 }
    })
    .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text) } catch { return fallback }
}

function normalizeReminderRow(row = {}) {
  return {
    id: row.id,
    userId: row.user_id,
    task: row.task,
    systemMessage: row.system_message,
    dueAt: row.due_at,
    status: row.status,
    createdAt: row.created_at,
    firedAt: row.fired_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    source: row.source || '',
    snoozeCount: Number(row.snooze_count || 0),
    recurrenceType: row.recurrence_type || null,
    recurrenceConfig: row.recurrence_config ? safeJsonParse(row.recurrence_config, null) : null,
  }
}

function toDeviceAscii(value, fallback = '', maxLength = 32) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim()
  const ascii = Array.from(raw)
    .map((ch) => {
      const code = ch.charCodeAt(0)
      return code >= 32 && code <= 126 ? ch : ' '
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return String(ascii || fallback || '').slice(0, maxLength)
}

function formatDeviceTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '--:--'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDeviceDueLabel(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '--:--'
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const day = sameDay ? 'Today' : `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `${day} ${formatDeviceTime(d)}`
}

function toDeviceTaskLabel(value, fallback = 'Open Nimo') {
  const raw = String(value || '').replace(/\s+/g, ' ').trim()
  const ascii = toDeviceAscii(raw, '', 34)
  if (ascii) return ascii
  if (/吃饭|吃飯|午饭|午飯|晚饭|晚飯|早餐|早饭|早飯/.test(raw)) return 'Eat meal'
  if (/喝水|饮水|飲水|喝/.test(raw)) return 'Drink water'
  if (/吃药|吃藥|药|藥/.test(raw)) return 'Take medicine'
  if (/睡觉|睡覺|休息/.test(raw)) return 'Rest'
  if (/运动|運動|锻炼|鍛煉/.test(raw)) return 'Exercise'
  if (/出门|出門|去|走|离开|離開/.test(raw)) return 'Go / leave'
  if (/会议|會議|开会|開會/.test(raw)) return 'Meeting'
  if (/学习|學習|读书|讀書|看书|看書/.test(raw)) return 'Study / read'
  return fallback
}

function pickDeviceScreenReminder(rows = []) {
  const now = Date.now()
  const normalized = rows
    .map((row) => ({ row, dueMs: new Date(row.due_at).getTime(), status: String(row.status || '') }))
    .filter((item) => Number.isFinite(item.dueMs))
  const pendingFuture = normalized
    .filter((item) => item.status === 'pending' && item.dueMs >= now - 60 * 1000)
    .sort((a, b) => a.dueMs - b.dueMs || Number(a.row.id || 0) - Number(b.row.id || 0))[0]
  if (pendingFuture) return { row: pendingFuture.row, mode: 'upcoming' }
  const firedRecent = normalized
    .filter((item) => item.status === 'fired' && now - item.dueMs <= 30 * 60 * 1000)
    .sort((a, b) => Math.abs(now - a.dueMs) - Math.abs(now - b.dueMs) || Number(b.row.id || 0) - Number(a.row.id || 0))[0]
  if (firedRecent) return { row: firedRecent.row, mode: 'due' }
  const pendingAny = normalized
    .filter((item) => item.status === 'pending')
    .sort((a, b) => a.dueMs - b.dueMs || Number(a.row.id || 0) - Number(b.row.id || 0))[0]
  if (pendingAny) return { row: pendingAny.row, mode: 'pending' }
  const activeRecent = normalized
    .sort((a, b) => b.dueMs - a.dueMs || Number(b.row.id || 0) - Number(a.row.id || 0))[0]
  return activeRecent ? { row: activeRecent.row, mode: activeRecent.status || 'active' } : { row: null, mode: 'empty' }
}

function buildDeviceScreenStatus({ port, deviceId = '', req = null } = {}) {
  const device = deviceId ? (touchDevice(deviceId, req) || null) : null
  let activeRows = []
  try {
    activeRows = listActiveReminders(50)
  } catch (err) {
    console.warn('[device] screen-status reminder lookup failed:', err?.message || err)
  }
  const picked = pickDeviceScreenReminder(activeRows)
  const nextRaw = picked.row
  const reminder = nextRaw ? normalizeReminderRow(nextRaw) : null
  const clock = formatDeviceTime(new Date())
  const dueLabel = reminder ? formatDeviceDueLabel(reminder.dueAt) : ''
  const task = reminder ? toDeviceTaskLabel(reminder.task, 'Open Nimo') : ''
  const modeLabel = picked.mode === 'due' ? 'Due' : picked.mode === 'upcoming' ? 'Next' : picked.mode === 'pending' ? 'Later' : 'No active'
  const activeCount = Array.isArray(activeRows) ? activeRows.length : 0
  return {
    ok: true,
    server: getDeviceServerInfo(port),
    serverTime: new Date().toISOString(),
    device,
    reminder,
    screen: {
      state: 'Online',
      line1: 'Nimo Online',
      line2: `Time ${clock} | ${activeCount} active`,
      line3: reminder ? `${modeLabel} ${dueLabel}` : 'No active reminder',
      line4: reminder ? `#${reminder.id} ${task}` : 'Create one in Nimo',
      dueLabel,
      mode: picked.mode,
      pollIntervalSeconds: 10,
    },
  }
}

function parseIncomingDueAt(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const raw = String(value).trim()
  if (!raw) return null
  // 兼容 yyyy-MM-dd HH:mm 这种本地时间格式
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function nimoSecondsText(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}小时${m}分钟`
  if (m > 0) return `${m}分钟`
  return `${total}秒`
}

function nimoFileNameFromTitle(title = '') {
  const text = String(title || '').replace(/\s+/g, ' ').trim()
  const match = text.match(/([^\\/:*?"<>|\n\r]+?\.(pdf|docx?|xlsx?|pptx?|txt|md|html?|csv|json|js|ts|py|java|cpp|c|png|jpe?g|zip))/i)
  if (match) return match[1].trim()
  const first = text.split(/\s[-—|]\s/)[0]?.trim()
  return first && first.length >= 4 && first.length <= 80 ? first : ''
}

function summarizeNimoFiles(timeline = {}) {
  const map = new Map()
  for (const event of timeline.events || []) {
    const fileName = nimoFileNameFromTitle(event.windowTitle || '')
    if (!fileName) continue
    const exist = map.get(fileName) || { fileName, seconds: 0, count: 0, appName: event.appName || '' }
    exist.seconds += Number(event.durationSeconds || 0)
    exist.count += 1
    if (!exist.appName && event.appName) exist.appName = event.appName
    map.set(fileName, exist)
  }
  const total = [...map.values()].reduce((sum, row) => sum + row.seconds, 0)
  return [...map.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8)
    .map((row) => ({
      ...row,
      durationText: nimoSecondsText(row.seconds),
      percent: total > 0 ? Math.round((row.seconds / total) * 100) : 0,
    }))
}

function buildNimoSummaryFallback({ summary, reminders = [], files = [], readingDocs = [] } = {}) {
  const pending = reminders.length
  const topApps = (summary?.apps || []).slice(0, 3).map((app) => app.appName || app.processName).filter(Boolean).join('、') || '暂无明显软件排行'
  const topFiles = files.slice(0, 2).map((file) => file.fileName).join('、') || '暂无明显文件记录'
  const readingText = readingDocs.length ? `最近导入阅读文档：${readingDocs.slice(0, 2).map((doc) => doc.title).join('、')}。` : ''
  const workText = summary?.workText || nimoSecondsText(summary?.workSeconds)
  const idleText = summary?.idleText || nimoSecondsText(summary?.idleSeconds)
  return `今天电脑有效使用 ${workText}，空闲/离开 ${idleText}。主要在 ${topApps} 上活动，文件侧重点是 ${topFiles}。${readingText}当前还有 ${pending} 个待处理提醒。建议今晚先收尾最临近的提醒，再整理明天第一件事。`
}

function normalizeImportedText(value = '') {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function isUnsupportedReadingSource(sourceName = '', sourceType = '') {
  const name = String(sourceName || '').trim()
  const type = String(sourceType || '').trim().toLowerCase()
  if ((type === 'docx' && /\.docx$/i.test(name)) || (type === 'xlsx' && /\.xlsx$/i.test(name))) return false
  return /\.(doc|docx|pdf|xls|xlsx|ppt|pptx)$/i.test(name)
}

function looksLikeBinaryDocument(content = '') {
  const text = String(content || '')
  const head = text.slice(0, 4096)
  if (/^%PDF-/.test(head)) return true
  if (/^PK[\s\S]{0,2000}(word\/|xl\/|ppt\/|docProps\/|\[Content_Types\]\.xml)/.test(head)) return true
  const weird = (head.match(/[\uFFFD\u0001-\u0008\u000E-\u001F]/g) || []).length
  return head.length > 200 && weird / head.length > 0.03
}

function assertReadingImportSupported({ content = '', sourceName = '', sourceType = '' } = {}) {
  if (isUnsupportedReadingSource(sourceName, sourceType)) {
    throw new Error('当前还不能直接解析 Word/PDF/Excel/PPT，请先另存为 TXT/CSV 或复制正文粘贴。')
  }
  if (looksLikeBinaryDocument(content)) {
    throw new Error('检测到二进制文档内容，当前只能导入文本类内容，请先转换为 TXT/CSV 或复制正文粘贴。')
  }
}

function readZipUInt16(buffer, offset) {
  return buffer.readUInt16LE(offset)
}

function readZipUInt32(buffer, offset) {
  return buffer.readUInt32LE(offset)
}

function readZipEntries(buffer) {
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i -= 1) {
    if (readZipUInt32(buffer, i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('无法识别 Office 文件结构')
  const total = readZipUInt16(buffer, eocd + 10)
  let offset = readZipUInt32(buffer, eocd + 16)
  const entries = new Map()
  for (let i = 0; i < total; i += 1) {
    if (offset + 46 > buffer.length || readZipUInt32(buffer, offset) !== 0x02014b50) break
    const method = readZipUInt16(buffer, offset + 10)
    const compressedSize = readZipUInt32(buffer, offset + 20)
    const nameLength = readZipUInt16(buffer, offset + 28)
    const extraLength = readZipUInt16(buffer, offset + 30)
    const commentLength = readZipUInt16(buffer, offset + 32)
    const localOffset = readZipUInt32(buffer, offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf-8').replace(/\\/g, '/')
    if (localOffset + 30 > buffer.length) break
    const localNameLength = readZipUInt16(buffer, localOffset + 26)
    const localExtraLength = readZipUInt16(buffer, localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    let data = Buffer.alloc(0)
    if (method === 0) data = Buffer.from(compressed)
    else if (method === 8) data = inflateRawSync(compressed)
    entries.set(name, data)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function decodeXmlEntities(value = '') {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function stripXmlTags(value = '') {
  return decodeXmlEntities(String(value || '').replace(/<[^>]*>/g, ''))
}

function extractWordTextFromXml(xml = '') {
  const paragraphs = []
  const paragraphRe = /<w:p\b[\s\S]*?<\/w:p>/g
  const textRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
  const breakRe = /<w:(?:br|tab)\b[^>]*\/?>/g
  for (const paragraph of String(xml || '').match(paragraphRe) || []) {
    const normalized = paragraph.replace(breakRe, ' ')
    const parts = []
    let match
    while ((match = textRe.exec(normalized))) parts.push(stripXmlTags(match[1]))
    const line = parts.join('').replace(/\s+/g, ' ').trim()
    if (line) paragraphs.push(line)
  }
  return paragraphs.join('\n')
}

function extractDocxTextFromBuffer(buffer) {
  const entries = readZipEntries(buffer)
  const documentXml = entries.get('word/document.xml')
  if (!documentXml) throw new Error('未找到 Word 正文内容')
  const text = extractWordTextFromXml(documentXml.toString('utf-8'))
  if (!text) throw new Error('没有从 Word 文档中提取到可读文本')
  return text
}

function extractSharedStringsFromXml(xml = '') {
  const values = []
  const siRe = /<si\b[\s\S]*?<\/si>/g
  const textRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g
  for (const item of String(xml || '').match(siRe) || []) {
    const parts = []
    let match
    while ((match = textRe.exec(item))) parts.push(stripXmlTags(match[1]))
    values.push(parts.join(''))
  }
  return values
}

function extractSheetNamesFromXml(xml = '') {
  return Array.from(String(xml || '').matchAll(/<sheet\b[^>]*\bname="([^"]+)"/g)).map((match) => decodeXmlEntities(match[1]))
}

function extractSheetRowsFromXml(xml = '', sharedStrings = []) {
  const rows = []
  const rowRe = /<row\b[\s\S]*?<\/row>/g
  const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g
  for (const row of String(xml || '').match(rowRe) || []) {
    const cells = []
    let cell
    while ((cell = cellRe.exec(row))) {
      const attrs = cell[1] || ''
      const body = cell[2] || ''
      const value = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || ''
      if (/\bt="s"/.test(attrs)) cells.push(sharedStrings[Number(value)] || '')
      else if (/\bt="inlineStr"/.test(attrs)) cells.push(stripXmlTags(body))
      else cells.push(stripXmlTags(value))
    }
    const line = cells.join('\t').trim()
    if (line) rows.push(line)
  }
  return rows
}

function extractXlsxTextFromBuffer(buffer) {
  const entries = readZipEntries(buffer)
  const sharedStrings = entries.get('xl/sharedStrings.xml')
    ? extractSharedStringsFromXml(entries.get('xl/sharedStrings.xml').toString('utf-8'))
    : []
  const sheetNames = entries.get('xl/workbook.xml')
    ? extractSheetNamesFromXml(entries.get('xl/workbook.xml').toString('utf-8'))
    : []
  const sheetEntries = Array.from(entries.keys()).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort()
  const sections = sheetEntries.map((name, index) => {
    const rows = extractSheetRowsFromXml(entries.get(name).toString('utf-8'), sharedStrings)
    if (!rows.length) return ''
    return [`# ${sheetNames[index] || `Sheet${index + 1}`}`, ...rows].join('\n')
  }).filter(Boolean)
  const text = sections.join('\n\n')
  if (!text) throw new Error('没有从 Excel 文档中提取到可读文本')
  return text
}

function extractReadingOfficeDocument({ sourceName = '', dataBase64 = '' } = {}) {
  const name = String(sourceName || '').trim()
  const base64 = String(dataBase64 || '').replace(/^data:[^,]+,/, '')
  if (!base64) throw new Error('文件内容不能为空')
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) throw new Error('文件内容不能为空')
  if (buffer.length > 25 * 1024 * 1024) throw new Error('文件过大，请先拆分或转换为文本导入')
  if (/\.docx$/i.test(name)) return { content: extractDocxTextFromBuffer(buffer), sourceType: 'docx' }
  if (/\.xlsx$/i.test(name)) return { content: extractXlsxTextFromBuffer(buffer), sourceType: 'xlsx' }
  throw new Error('当前后端仅支持 DOCX/XLSX 提取；PDF/PPT 暂需先转成文本或复制正文')
}

function buildReadingSummaryFallback(content = '') {
  const text = normalizeImportedText(content)
  if (!text) return ''
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const first = paragraphs.slice(0, 3).join(' ')
  const keyLines = paragraphs
    .filter((p) => /^(#+|\d+[.、]|[-*]|摘要|结论|目标|问题|方法|结果|建议)/.test(p))
    .slice(0, 5)
  const base = keyLines.length ? keyLines.join('；') : first
  return base.length > 260 ? `${base.slice(0, 260)}…` : base
}

function normalizeReadingDocumentRow(row, { includeContent = false } = {}) {
  if (!row) return null
  const result = {
    id: row.id,
    title: row.title,
    sourceType: row.source_type,
    sourceName: row.source_name,
    summary: row.summary,
    charCount: row.char_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
  }
  if (includeContent) result.content = row.content
  return result
}

async function generateReadingDocumentSummary(doc, { force = false } = {}) {
  if (!doc) throw new Error('文档不存在')
  if (!force && doc.summary) return doc
  const fallback = buildReadingSummaryFallback(doc.content)
  try {
    const result = await callLLM({
      systemPrompt: '你是 Nimo 的陪读助手。请把用户导入的文档压缩成中文精简摘要，最多 5 条要点，并给出 1 个适合继续追问的问题。不要编造文档外的信息。',
      message: JSON.stringify({
        title: doc.title,
        content: String(doc.content || '').slice(0, 12000),
      }),
      temperature: 0.2,
      topP: 0.8,
      tools: [],
      maxTokens: 520,
      thinking: false,
    })
    const text = String(result?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    return updateReadingDocumentSummary(doc.id, text || fallback)
  } catch {
    return updateReadingDocumentSummary(doc.id, fallback)
  }
}

async function generateNimoDailyAiSummary({ date = todayDateString(), force = false } = {}) {
  const existing = !force ? getDailySummary(date) : null
  if (existing?.summary) {
    return {
      ok: true,
      source: existing.source,
      date: existing.date,
      summary: existing.summary,
      fallback: existing.fallback,
      data: existing.data,
      error: existing.error || undefined,
      saved: true,
      generatedAt: existing.generated_at,
      updatedAt: existing.updated_at,
    }
  }
  const employeeId = 'local'
  const summary = getActivitySummary({ date, employeeId })
  const timeline = getActivityTimeline({ date, employeeId })
  const reminders = listActiveReminders(30).map(normalizeReminderRow)
  const files = summarizeNimoFiles(timeline)
  const readingDocs = listReadingDocuments(5)
  const fallback = buildNimoSummaryFallback({ summary, reminders, files, readingDocs })
  const payload = {
    date,
    total: summary.totalText,
    work: summary.workText,
    idle: summary.idleText,
    eventCount: summary.eventCount,
    topApps: (summary.apps || []).slice(0, 6).map((app) => ({
      name: app.appName || app.processName,
      duration: app.durationText,
      percent: app.percent,
    })),
    files: files.slice(0, 6).map((file) => ({
      name: file.fileName,
      app: file.appName,
      duration: file.durationText,
      percent: file.percent,
    })),
    reminders: reminders.slice(0, 8).map((item) => ({
      task: item.task,
      dueAt: item.dueAt,
      status: item.status,
    })),
    readingDocs: readingDocs.map((doc) => ({
      title: doc.title,
      summary: doc.summary,
      charCount: doc.char_count,
      updatedAt: doc.updated_at,
    })),
  }
  try {
    const result = await callLLM({
      systemPrompt: '你是 Nimo 提醒助手。请基于本地统计生成用户当天的精简中文总结。不要说你看不到数据，不要编造。输出 3-5 行，每行短句，语气像陪伴伙伴：先说今天做了什么/干了什么，再说软件和文件重点，再给一个下一步建议。不要超过 160 字。',
      message: JSON.stringify(payload),
      temperature: 0.25,
      topP: 0.8,
      tools: [],
      maxTokens: 360,
      thinking: false,
    })
    const text = String(result?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    const source = text ? 'ai' : 'fallback'
    const saved = upsertDailySummary({ date, source, summary: text || fallback, fallback, data: payload })
    return { ok: true, source, date, summary: saved.summary, fallback, data: payload, force, saved: true, generatedAt: saved.generated_at, updatedAt: saved.updated_at }
  } catch (err) {
    const saved = upsertDailySummary({ date, source: 'fallback', summary: fallback, fallback, data: payload, error: err.message })
    return { ok: true, source: 'fallback', date, summary: saved.summary, fallback, data: payload, error: err.message, force, saved: true, generatedAt: saved.generated_at, updatedAt: saved.updated_at }
  }
}

function customerListOptionsFromUrl(url) {
  const industryParam = url.searchParams.get('industry')
  const allParam = url.searchParams.get('all')
  if (allParam === '1') return { industryId: null }
  if (industryParam) return { industryId: industryParam, includeGlobal: false }
  return { industryId: getActiveIndustry(), includeGlobal: false }
}

function orgIndustryOptionsFromUrl(url) {
  return { industryId: url.searchParams.get('industry') || getActiveIndustry() || '' }
}

function memoryScopeWhereFromUrl(url, alias = '') {
  const scope = String(url.searchParams.get('scope') || 'current').trim()
  const industry = String(url.searchParams.get('industry') || getActiveIndustry() || '').trim()
  const tagsExpr = alias ? `${alias}.tags` : 'tags'
  if (scope === 'all') return { clause: '', params: [] }
  if (scope === 'global') return { clause: ` AND (${tagsExpr} IS NULL OR ${tagsExpr} NOT LIKE '%industry:%')`, params: [] }
  if (scope === 'industry' && industry) return { clause: ` AND ${tagsExpr} LIKE ?`, params: [`%industry:${industry}%`] }
  if (industry) {
    return {
      clause: ` AND (${tagsExpr} LIKE ? OR ${tagsExpr} IS NULL OR ${tagsExpr} NOT LIKE '%industry:%')`,
      params: [`%industry:${industry}%`],
    }
  }
  return { clause: '', params: [] }
}

function getIndustryStateWithStats(url = null) {
  const state = getIndustryState()
  const activeId = state.active || getActiveIndustry() || ''
  const stats = {
    customerCount: 0,
    memoryCount: 0,
    knowledgeCount: Array.isArray(state.activePack?.knowledge) ? state.activePack.knowledge.length : 0,
  }
  try {
    stats.customerCount = listCustomers({ industryId: activeId || null, includeGlobal: false }).length
  } catch {}
  try {
    const db = getDB()
    const scopeUrl = url ? new URL(url.toString()) : new URL('http://localhost/industry')
    if (activeId && !scopeUrl.searchParams.get('industry')) scopeUrl.searchParams.set('industry', activeId)
    if (!scopeUrl.searchParams.get('scope')) scopeUrl.searchParams.set('scope', 'current')
    const memScope = memoryScopeWhereFromUrl(scopeUrl)
    stats.memoryCount = db.prepare(`SELECT COUNT(*) AS c FROM memories WHERE 1=1${memScope.clause}`).get(...memScope.params).c || 0
  } catch {}
  return { ...state, stats }
}

function getIndustryDiagnostics() {
  const state = getIndustryState()
  const packs = Array.isArray(state.allPacks) ? state.allPacks : []
  const db = getDB()
  const countMemoriesForIndustry = (industryId) => {
    const row = db.prepare("SELECT COUNT(*) AS c FROM memories WHERE tags LIKE ?").get(`%industry:${industryId}%`)
    return row?.c || 0
  }
  const globalMemories = db.prepare("SELECT COUNT(*) AS c FROM memories WHERE tags IS NULL OR tags NOT LIKE '%industry:%'").get()?.c || 0
  return {
    active: state.active,
    enabled: state.enabled,
    global: {
      memoryCount: globalMemories,
    },
    industries: packs.map((pack) => ({
      id: pack.id,
      name: pack.name,
      icon: pack.icon,
      enabled: state.enabled.includes(pack.id),
      active: state.active === pack.id,
      customerCount: listCustomers({ industryId: pack.id, includeGlobal: false }).length,
      memoryCount: countMemoriesForIndustry(pack.id),
      knowledgeCount: pack.knowledgeCount || 0,
    })),
  }
}

function contentTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.ico':
      return 'image/x-icon'
    case '.html':
      return 'text/html; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

function getAgentName() {
  if (!getActivePack()) return DEFAULT_AGENT_NAME
  return (getConfig('agent_name') || '').trim() || DEFAULT_AGENT_NAME
}

function stripAssistantHistoryLabels(content) {
  return String(content || '')
    .trim()
    .replace(/^(?:\s*\[assistant(?:\s+to\s+[^\]\r\n]+)?(?:\s+\d{4}-\d{2}-\d{2}T[^\]\r\n]+)?\]\s*)+/giu, '')
    .trim()
}

function extractAgentRename(content) {
  const text = String(content || '').trim()
  if (!text) return null

  const questionPatterns = [
    /你叫什么(?:名字)?[？?]?\s*$/i,
    /你叫啥[？?]?\s*$/i,
    /你叫\.{0,3}什么[？?]?\s*$/i,
    /请问你叫什么(?:名字)?[？?]?\s*$/i,
    /what(?:'s| is)\s+your\s+name\??\s*$/i,
    /who\s+are\s+you\??\s*$/i,
  ]
  if (questionPatterns.some((pattern) => pattern.test(text))) return null

  const hasQuestionTone =
    /[？?]/.test(text) ||
    /(^|[，,。.!！\s])(什么|啥|几|吗|么|哪一个|哪个|是不是)($|[，,。.!！\s])/.test(text)
  const renameVerbHit =
    /(改成|改为|换成|换做|叫做|叫|自称|称呼你|管你叫|call you|rename you|name is now)/i.test(text)
  if (hasQuestionTone && !/(从.+起|以后|之后|现在起|改成|改为|换成|换做|rename|name is now)/i.test(text)) {
    return null
  }

  const intentPatterns = [
    /叫你/i,
    /你.*叫/i,
    /改名/i,
    /改个?名字/i,
    /换个?名字/i,
    /名字.*改/i,
    /name\s+is\s+now/i,
    /call\s+you/i,
    /rename\s+you/i,
    /自称/i,
    /对外.*叫/i,
    /别叫/i,
    /不要叫/i,
    /换个称呼/i,
    /给你.*起个?名字/i,
    /给你.*换个?名字/i,
  ]
  if (!intentPatterns.some((pattern) => pattern.test(text))) return null
  if (/^你.*叫/i.test(text) && !renameVerbHit && hasQuestionTone) return null

  const normalizeName = (raw) => {
    const cleaned = String(raw || "")
      .trim()
      .replace(/^[“"'`「『【（(]+/, "")
      .replace(/[”"'`」』】）),。.!！？；;：:\s]+$/g, "")
      .replace(/\s+/g, " ")

    if (!cleaned) return null
    if (cleaned.length > 32) return null
    if (/^(你|我|我们|以后|之后|现在|一下|一个|这个|那个|名字|名称|称呼)$/i.test(cleaned)) return null
    if (!/^[\u4e00-\u9fa5A-Za-z0-9 _-]+$/.test(cleaned)) return null
    return cleaned
  }

  const rejectName = (name) => {
    const lowered = String(name || '').toLowerCase()
    return (
      /^(一下|一个|这个|那个|以后|现在|名字|名称|称呼|自己|原来|之前|刚才|以后吧)$/.test(name) ||
      /^(name|called|call|rename|my|your|you|me|it)$/.test(lowered)
    )
  }

  const tryName = (raw) => {
    const normalized = normalizeName(raw)
    if (!normalized || rejectName(normalized)) return null
    return normalized
  }

  const capturePatterns = [
    /(?:以后|之后|从现在起|从今以后)?(?:你|你以后|以后你)(?:就|还是|直接)?叫(?:做)?\s*[“"'`「『【（(]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
    /(?:把你|给你|帮你)(?:的名字|名字)?(?:改成|改为|换成|换做)\s*[“"'`「『【（(]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
    /(?:以后)?(?:我|我们)(?:就)?叫你\s*[“"'`「『【（(]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
    /(?:你的名字|你名字)(?:是|叫|改成|改为)\s*[“"'`「『【（(]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
    /(?:以后|之后|从现在起)?(?:称呼你|管你叫)\s*[“"'`「『【（(]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
    /(?:以后|之后)?(?:你)?(?:对外|今后)?(?:就)?自称\s*[“"'`「『【（(]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
    /(?:以后|之后)?(?:别|不要)(?:再)?叫(?:自己)?\s*[“"'`「『【（(]?\s*[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31}[”"'`」』】）)]?\s*(?:了)?[，,。.!！？；;\s]*(?:以后|现在|之后)?(?:就)?叫(?:自己|你)?\s*[“"'`「『【（(]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
    /(?:我想|我想要|我准备|我要)?(?:给你|帮你)(?:重新|再)?(?:起|取|换)(?:个)?名字(?:叫|是|为)?\s*[“"'`「『【（(]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
    /(?:把|将)(?:你的名字|你)(?:从)?\s*[“"'`「『【（(]?\s*[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31}[”"'`」』】）)]?\s*(?:改|换)(?:成|为)\s*[“"'`「『【（(]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
    /(?:以后|之后|从现在起)?(?:对外)?(?:你|你自己)?(?:就)?叫\s*[“"'`「『【（(]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
    /your name is now\s+[“"'`(]?\s*([A-Za-z][A-Za-z0-9 _-]{0,31})/i,
    /i(?:'ll| will)? call you\s+[“"'`(]?\s*([A-Za-z][A-Za-z0-9 _-]{0,31})/i,
    /rename you to\s+[“"'`(]?\s*([A-Za-z][A-Za-z0-9 _-]{0,31})/i,
    /don't call yourself\s+[“"'`]?[A-Za-z][A-Za-z0-9 _-]{0,31}[”"'`]?\s*(?:anymore)?[, ]*(?:call yourself|be)\s+[“"'`]?\s*([A-Za-z][A-Za-z0-9 _-]{0,31})/i,
  ]

  for (const pattern of capturePatterns) {
    const match = text.match(pattern)
    if (!match) continue
    const nextName = tryName(match[1])
    if (nextName) return nextName
  }

  const colonMatch = text.match(/(?:名字|名称|称呼)[是为:：]\s*[“"'`「『【（(]?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i)
  if (colonMatch) {
    const nextName = tryName(colonMatch[1])
    if (nextName) return nextName
  }

  const quotedNames = [...text.matchAll(/[“"'`「『【（(]\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})\s*[”"'`」』】）)]/g)]
    .map((match) => tryName(match[1]))
    .filter(Boolean)
  if (quotedNames.length === 1) return quotedNames[0]

  const semanticWindows = [
    /(?:改名|换名字|换个名字|换个称呼|起个名字|取个名字|自称|对外叫)\s*(?:叫|成|为|是)?\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
    /(?:以后|之后|从现在起).{0,12}?(?:叫|自称|称呼).{0,4}?([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 _-]{0,31})/i,
  ]
  for (const pattern of semanticWindows) {
    const match = text.match(pattern)
    if (!match) continue
    const nextName = tryName(match[1])
    if (nextName) return nextName
  }

  return null
}

export function startAPI(port = 3721, { getStateSnapshot = null, onActivated = null } = {}) {
  const onActivatedCallback = onActivated
  const host = getApiHost()
  const server = http.createServer(async (req, res) => {
    const base = `http://localhost:${port}`
    const url = new URL(req.url, base)
    const origin = req.headers.origin

    // GET /social/wechat-clawbot/qr — 获取当前二维码状态和 URL
    if (req.method === 'GET' && url.pathname === '/social/wechat-clawbot/qr') {
      if (!hasAllowedAccess(req, url)) return jsonResponse(res, 403, { ok: false, error: 'forbidden' })
      return jsonResponse(res, 200, { ok: true, ...getClawbotQR() })
    }

    // POST /social/wechat-clawbot/logout — 清除凭证并断开连接
    if (req.method === 'POST' && url.pathname === '/social/wechat-clawbot/logout') {
      if (!requireLocalOrToken(req, res, url)) return
      logoutClawbot()
      emitEvent('social_status', { platform: 'wechat-clawbot', status: 'idle' })
      return jsonResponse(res, 200, { ok: true })
    }

    // POST /social/wechat-clawbot/connect — 启动个人微信扫码连接器
    if (req.method === 'POST' && url.pathname === '/social/wechat-clawbot/connect') {
      if (!requireLocalOrToken(req, res, url)) return
      restartConnector('wechat-clawbot', { pushMessage, emitEvent }).then(result => {
        if (result && result.ok === false) {
          return jsonResponse(res, 500, { ok: false, error: result.error || '微信连接器启动失败' })
        }
        return jsonResponse(res, 200, { ok: true, ...getClawbotQR() })
      }).catch(err => {
        return jsonResponse(res, 500, { ok: false, error: err?.message || '微信连接器启动失败' })
      })
      return
    }

    if (isSocialWebhookPath(url.pathname)) {
      return handleSocialWebhook(req, res, url)
    }

    if (origin && !isAllowedOrigin(origin)) {
      return jsonResponse(res, 403, { ok: false, error: 'forbidden origin' })
    }

    if (!hasAllowedAccess(req, url)) {
      return jsonResponse(res, 403, { ok: false, error: 'forbidden' })
    }

    if (isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || 'null')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method !== 'OPTIONS' && isSensitivePath(url.pathname) && !requireLocalOrToken(req, res, url)) return

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if ((req.method === 'GET' || req.method === 'POST') && (url.pathname === '/nimo' || url.pathname === '/nimo/' || url.pathname === '/xiaozhi/ota' || url.pathname === '/xiaozhi/ota/' || url.pathname === '/xz' || url.pathname === '/xz/')) {
      jsonResponse(res, 200, buildXiaozhiOtaResponse({ port }))
      return
    }

    if (req.method === 'POST' && (url.pathname === '/nimo/activate' || url.pathname === '/xiaozhi/activate')) {
      jsonResponse(res, 200, { ok: true, message: 'Nimo local bridge does not require activation.' })
      return
    }
    if (req.method === 'POST' && url.pathname === '/device/register') {
      readJsonBody(req)
        .then((body = {}) => {
          const device = normalizeDeviceRecord(body, req)
          emitEvent('device_changed', { action: 'registered', device })
          emitDeviceEvent('device_registered', device)
          jsonResponse(res, 200, { ok: true, device, server: getDeviceServerInfo(port) })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/info') {
      jsonResponse(res, 200, {
        ok: true,
        server: getDeviceServerInfo(port),
        devices: listDeviceRecords(),
        voiceCapture: getHardwareVoiceControl(),
        voiceStats: getHardwareVoiceStats(),
        protocol: {
          register: 'POST /device/register',
          heartbeat: 'POST /device/heartbeat',
          config: 'GET /device/config?deviceId=...',
          status: 'GET /device/status',
          screenStatus: 'GET /device/screen-status?deviceId=...',
          speechNext: 'GET /device/speech/next?deviceId=...',
          speechAudio: 'GET /device/speech/audio?id=...',
          speechAck: 'POST /device/speech/ack',
          voiceCapture: 'GET/POST /device/voice/capture',
          nextReminder: 'GET /device/next-reminder?deviceId=...',
          complete: 'POST /device/complete',
          snooze: 'POST /device/snooze',
          testPush: 'POST /device/test-push',
          stream: 'GET /device/stream?deviceId=...',
        },
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/status') {
      const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('id')
      if (deviceId) touchDevice(deviceId, req)
      jsonResponse(res, 200, { ok: true, server: getDeviceServerInfo(port), devices: listDeviceRecords() })
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/screen-status') {
      const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('id')
      jsonResponse(res, 200, buildDeviceScreenStatus({ port, deviceId, req }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/speech/next') {
      const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('id')
      if (deviceId) touchDevice(deviceId, req)
      const speech = getNextDeviceSpeech({ deviceId, port })
      jsonResponse(res, 200, { ok: true, speech, queue: getDeviceSpeechQueueStatus() })
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/voice/capture') {
      jsonResponse(res, 200, { ok: true, capture: getHardwareVoiceControl() })
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/voice/capture') {
      readJsonBody(req)
        .then((body = {}) => {
          const rawEnabled = body.enabled ?? body.captureEnabled ?? body.capture ?? body.listening
          if (rawEnabled === undefined) {
            jsonResponse(res, 400, { ok: false, error: 'missing enabled' })
            return
          }
          const enabled = rawEnabled === true || /^(1|true|yes|on|open|enable|enabled|start)$/i.test(String(rawEnabled).trim())
          const deviceId = body.deviceId || body.id || body.device_id
          if (deviceId) touchDevice(deviceId, req)
          const capture = setHardwareVoiceCapture(enabled, deviceId ? `device:${deviceId}` : 'api')
          jsonResponse(res, 200, { ok: true, capture })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/voice/trigger') {
      readJsonBody(req)
        .then((body = {}) => {
          const deviceId = body.deviceId || body.id || body.device_id
          if (deviceId) touchDevice(deviceId, req)
          const text = body.text || 'I am here. Voice capture is waking up.'
          const item = enqueueDeviceSpeech({ text, source: 'device_voice_trigger', deviceId })
          jsonResponse(res, 200, {
            ok: true,
            state: 'speaking',
            line1: 'I am here',
            line2: 'Voice link is ready',
            line3: 'Next: real microphone',
            line4: 'Press KEY1 again',
            speechId: item?.id || null,
            queue: getDeviceSpeechQueueStatus(),
          })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/voice/pcm') {
      const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('id') || 'nimo-esp32s3-001'
      const sampleRate = Math.max(8000, Math.min(48000, Number(url.searchParams.get('sampleRate') || 16000)))
      const peak = Number(url.searchParams.get('peak') || 0)
      if (deviceId) touchDevice(deviceId, req)
      readBinaryBody(req, 512 * 1024)
        .then(async (pcm) => {
          const transcript = await recognizeDevicePcm(pcm, { deviceId, sampleRate })
          jsonResponse(res, 200, {
            ok: true,
            state: 'thinking',
            transcript,
            line1: 'You said:',
            line2: transcript.slice(0, 80),
            line3: `Peak ${peak || ''}`.trim(),
            line4: 'Thinking...',
            speechId: null,
            queue: getDeviceSpeechQueueStatus(),
          })
        })
        .catch((err) => {
          const message = makeXiaozhiLine(err.message || 'ASR failed', 120)
          jsonResponse(res, 500, {
            ok: false,
            error: message,
            state: 'error',
            line1: 'ASR failed',
            line2: message,
            line3: peak ? `Peak ${peak}` : '',
            line4: 'Check voice settings',
          })
        })
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/speech/ack') {
      readJsonBody(req)
        .then((body = {}) => {
          const deviceId = body.deviceId || body.id || body.device_id
          const speechId = body.speechId || body.speech_id || body.id
          if (deviceId) touchDevice(deviceId, req)
          const item = ackDeviceSpeech({ id: speechId, deviceId })
          jsonResponse(res, item ? 200 : 404, item ? { ok: true, speechId: item.id } : { ok: false, error: 'speech not found' })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/speech/test') {
      readJsonBody(req)
        .then((body = {}) => {
          const text = body.text || '你好，我是 Nimo。现在硬件语音队列已经连通。'
          const item = enqueueDeviceSpeech({ text, source: 'manual_test', deviceId: body.deviceId || body.id })
          jsonResponse(res, item ? 200 : 400, item ? { ok: true, speechId: item.id, queue: getDeviceSpeechQueueStatus() } : { ok: false, error: 'text required' })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/speech/status') {
      jsonResponse(res, 200, { ok: true, queue: getDeviceSpeechQueueStatus() })
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/speech/audio') {
      const speechId = url.searchParams.get('id') || url.searchParams.get('speechId')
      const format = String(url.searchParams.get('format') || '').trim().toLowerCase()
      const item = getDeviceSpeechById(speechId)
      if (!item) {
        jsonResponse(res, 404, { ok: false, error: 'speech not found' })
        return
      }
      if (format === 'pcm' && deviceSpeechAudioCache.has(speechId)) {
        try {
          const buf = await deviceSpeechAudioCache.get(speechId)
          deviceSpeechAudioCache.delete(speechId)
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'X-Audio-Format': 'pcm_s16le',
            'X-Audio-Sample-Rate': '16000',
            'X-Audio-Channels': '1',
            'Content-Length': String(buf.length),
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(buf)
          return
        } catch {}
      }
      try {
        const audioStream = (format === 'pcm' || format === 'wav')
          ? await createConvertedDeviceSpeechStream(item, format)
          : await (async () => {
              const creds = getTTSCredentials()
              return streamTTS({
                text: item.text,
                provider: creds.provider,
                voiceId: creds.voiceId || undefined,
                keys: {
                  doubaoKey: creds.doubaoKey,
                  doubaoAppId: creds.doubaoAppId,
                  doubaoAccessKey: creds.doubaoAccessKey,
                  doubaoResourceId: creds.doubaoResourceId,
                  minimaxKey: creds.minimaxKey,
                  openaiKey: creds.openaiKey,
                  openaiBaseURL: creds.openaiBaseURL,
                  elevenLabsKey: creds.elevenLabsKey,
                  volcanoAppId: creds.volcanoAppId,
                  volcanoToken: creds.volcanoToken,
                },
              })
            })()
        res.writeHead(200, {
          'Content-Type': format === 'pcm' ? 'application/octet-stream' : (format === 'wav' ? 'audio/wav' : 'audio/mpeg'),
          ...(format === 'pcm' ? { 'X-Audio-Format': 'pcm_s16le', 'X-Audio-Sample-Rate': '16000', 'X-Audio-Channels': '1' } : {}),
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        })
        audioStream.pipe(res)
        audioStream.on('error', () => { try { res.end() } catch {} })
      } catch (err) {
        console.warn('[device speech] audio stream failed:', err.message)
        if (!res.headersSent) jsonResponse(res, 500, { ok: false, error: err.message })
        else try { res.end() } catch {}
      }
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/heartbeat') {
      readJsonBody(req)
        .then((body = {}) => {
          const deviceId = body.deviceId || body.id || body.device_id
          if (!deviceId) return jsonResponse(res, 400, { ok: false, error: 'deviceId required' })
          const device = touchDevice(deviceId, req) || normalizeDeviceRecord(body, req)
          emitEvent('device_changed', { action: 'heartbeat', device })
          jsonResponse(res, 200, { ok: true, device, serverTime: new Date().toISOString() })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/config') {
      const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('id')
      if (deviceId) touchDevice(deviceId, req)
      jsonResponse(res, 200, {
        ok: true,
        server: getDeviceServerInfo(port),
        config: {
          pollIntervalSeconds: 15,
          heartbeatSeconds: 30,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
          actions: ['complete', 'snooze'],
          snoozeMinutes: [10, 60],
        },
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/next-reminder') {
      const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('id')
      if (deviceId) touchDevice(deviceId, req)
      const next = listActiveReminders(1)[0] || null
      jsonResponse(res, 200, { ok: true, reminder: next ? normalizeReminderRow(next) : null })
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/complete') {
      readJsonBody(req)
        .then((body = {}) => {
          if (body.deviceId || body.id) touchDevice(body.deviceId || body.id, req)
          const reminderId = Number(body.reminderId || body.reminder_id)
          if (!reminderId) return jsonResponse(res, 400, { ok: false, error: 'reminderId required' })
          const r = completeReminder(reminderId)
          const reminder = getReminderById(reminderId)
          const normalized = reminder ? normalizeReminderRow(reminder) : null
          emitEvent('reminder_changed', { action: 'completed', id: reminderId, source: 'device', reminder: normalized })
          jsonResponse(res, 200, { ok: true, changes: r?.changes || 0, reminder: normalized })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/snooze') {
      readJsonBody(req)
        .then((body = {}) => {
          if (body.deviceId || body.id) touchDevice(body.deviceId || body.id, req)
          const reminderId = Number(body.reminderId || body.reminder_id)
          if (!reminderId) return jsonResponse(res, 400, { ok: false, error: 'reminderId required' })
          const minutes = Math.max(1, Math.min(24 * 60, Number(body.minutes || 10)))
          const next = new Date(Date.now() + minutes * 60 * 1000).toISOString()
          const r = snoozeReminder(reminderId, next)
          const reminder = getReminderById(reminderId)
          const normalized = reminder ? normalizeReminderRow(reminder) : null
          emitEvent('reminder_changed', { action: 'snoozed', id: reminderId, source: 'device', dueAt: next, minutes, reminder: normalized })
          jsonResponse(res, 200, { ok: true, changes: r?.changes || 0, dueAt: next, minutes, reminder: normalized })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/test-push') {
      readJsonBody(req)
        .catch(() => ({}))
        .then((body = {}) => {
          const deviceId = body.deviceId || body.id || body.device_id || null
          if (deviceId) touchDevice(deviceId, req)
          const payload = {
            deviceId,
            title: body.title || 'Nimo 测试提醒',
            task: body.task || '硬件到手前的软件模拟推送已准备好。',
            dueAt: new Date().toISOString(),
          }
          emitDeviceEvent('device_test_push', payload)
          emitEvent('device_changed', { action: 'test_push', deviceId, payload })
          jsonResponse(res, 200, { ok: true, pushed: true, payload })
        })
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/stream') {
      const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('id')
      if (deviceId) touchDevice(deviceId, req)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      res.write(`data: ${JSON.stringify({ type: 'device_connected', data: { deviceId: deviceId || null, devices: listDeviceRecords() }, ts: new Date().toISOString() })}\n\n`)
      addDeviceSSEClient(res)
      const keepAlive = setInterval(() => {
        try {
          if (deviceId) touchDevice(deviceId, req)
          res.write(': ping\n\n')
        } catch (_) {
          clearInterval(keepAlive)
          removeDeviceSSEClient(res)
        }
      }, 15000)
      req.on('close', () => {
        clearInterval(keepAlive)
        removeDeviceSSEClient(res)
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/cloud/device') {
      jsonResponse(res, 200, getCloudDeviceIdentity())
      return
    }

    if (req.method === 'GET' && url.pathname === '/cloud/config') {
      jsonResponse(res, 200, getCloudConfig())
      return
    }

    if (req.method === 'GET' && url.pathname === '/activity/status') {
      jsonResponse(res, 200, getActivityTrackerStatus())
      return
    }

    if (req.method === 'POST' && url.pathname === '/activity/config') {
      readJsonBody(req)
        .then((body) => jsonResponse(res, 200, setActivityTrackerConfig(body || {})))
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/activity/sample') {
      Promise.resolve()
        .then(() => runActivitySample())
        .then((sample) => jsonResponse(res, 200, { ok: true, sample, status: getActivityTrackerStatus() }))
        .catch((err) => jsonResponse(res, 500, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/activity/screen-analysis') {
      Promise.resolve()
        .then(() => runScreenAnalysisSample({ force: true }))
        .then((analysis) => jsonResponse(res, 200, { ok: true, analysis, status: getActivityTrackerStatus() }))
        .catch((err) => jsonResponse(res, 500, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/activity/summary') {
      const date = url.searchParams.get('date') || todayDateString()
      const employeeId = url.searchParams.get('employee') || 'local'
      jsonResponse(res, 200, getActivitySummary({ date, employeeId }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/activity/timeline') {
      const date = url.searchParams.get('date') || todayDateString()
      const employeeId = url.searchParams.get('employee') || 'local'
      jsonResponse(res, 200, getActivityTimeline({ date, employeeId }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/reading/documents') {
      const limit = Number(url.searchParams.get('limit') || 20)
      jsonResponse(res, 200, { ok: true, documents: listReadingDocuments(limit).map((row) => normalizeReadingDocumentRow(row)) })
      return
    }

    if (req.method === 'POST' && url.pathname === '/reading/documents/extract') {
      readJsonBody(req)
        .then((body) => {
          const extracted = extractReadingOfficeDocument({ sourceName: body.sourceName || '', dataBase64: body.dataBase64 || '' })
          jsonResponse(res, 200, { ok: true, sourceName: body.sourceName || '', sourceType: extracted.sourceType, content: extracted.content })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/reading/documents') {
      readJsonBody(req)
        .then(async (body) => {
          assertReadingImportSupported({ content: body.content || '', sourceName: body.sourceName || body.title || '', sourceType: body.sourceType || '' })
          const content = normalizeImportedText(body.content || '')
          if (!content) throw new Error('文档内容不能为空')
          if (content.length > 500000) throw new Error('文档过长，请先拆成小段导入')
          const doc = createReadingDocument({
            title: body.title,
            content,
            sourceType: body.sourceType || 'paste',
            sourceName: body.sourceName || '',
            summary: buildReadingSummaryFallback(content),
          })
          const summarized = body.summarize === false ? doc : await generateReadingDocumentSummary(doc)
          emitEvent('reading_document_changed', { action: 'created', id: summarized.id, title: summarized.title })
          jsonResponse(res, 200, { ok: true, document: normalizeReadingDocumentRow(summarized, { includeContent: true }) })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'DELETE' && /^\/reading\/documents\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/').pop())
      const doc = getReadingDocument(id)
      if (!doc) {
        jsonResponse(res, 404, { ok: false, error: '文档不存在' })
        return
      }
      const result = deleteReadingDocument(id)
      emitEvent('reading_document_changed', { action: 'deleted', id, title: doc.title })
      jsonResponse(res, 200, { ok: true, deleted: result?.changes || 0, id })
      return
    }

    if (req.method === 'GET' && /^\/reading\/documents\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/').pop())
      const doc = touchReadingDocument(id)
      if (!doc) {
        jsonResponse(res, 404, { ok: false, error: '文档不存在' })
        return
      }
      jsonResponse(res, 200, { ok: true, document: normalizeReadingDocumentRow(doc, { includeContent: true }) })
      return
    }

    if (req.method === 'POST' && /^\/reading\/documents\/\d+\/summary$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[3])
      const doc = getReadingDocument(id)
      if (!doc) {
        jsonResponse(res, 404, { ok: false, error: '文档不存在' })
        return
      }
      readJsonBody(req)
        .catch(() => ({}))
        .then((body) => generateReadingDocumentSummary(doc, { force: body.force === true }))
        .then((updated) => {
          emitEvent('reading_document_changed', { action: 'summarized', id: updated.id, title: updated.title })
          jsonResponse(res, 200, { ok: true, document: normalizeReadingDocumentRow(updated, { includeContent: true }) })
        })
        .catch((err) => jsonResponse(res, 500, { ok: false, error: err.message }))
      return
    }

    if (url.pathname === '/daily-summary/ai' && (req.method === 'GET' || req.method === 'POST')) {
      const run = async () => {
        const body = req.method === 'POST' ? await readJsonBody(req).catch(() => ({})) : {}
        const date = body.date || url.searchParams.get('date') || todayDateString()
        const force = body.force === true || url.searchParams.get('force') === '1'
        return generateNimoDailyAiSummary({ date, force })
      }
      run()
        .then((summary) => jsonResponse(res, 200, summary))
        .catch((err) => jsonResponse(res, 500, { ok: false, error: err.message }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/daily-summary/history') {
      const date = url.searchParams.get('date') || todayDateString()
      const summary = getDailySummary(date)
      jsonResponse(res, 200, {
        ok: true,
        date,
        exists: !!summary,
        summary: summary ? {
          source: summary.source,
          text: summary.summary,
          fallback: summary.fallback,
          data: summary.data,
          error: summary.error || '',
          generatedAt: summary.generated_at,
          updatedAt: summary.updated_at,
        } : null,
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/activity/events') {
      const date = url.searchParams.get('date') || todayDateString()
      const employeeId = url.searchParams.get('employee') || 'local'
      const limit = Number(url.searchParams.get('limit') || 200)
      jsonResponse(res, 200, listActivityEvents({ date, employeeId, limit }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/activity/catalog') {
      jsonResponse(res, 200, {
        ok: true,
        idleRule: '鼠标 + 键盘连续 5 分钟（默认 idleThresholdSeconds=300）无操作时，当前事件标记为空闲；空闲不计入"有效工作"，会单独统计。',
        sampleRule: '每 sampleIntervalMs（默认 5 秒）调用一次 Windows 系统 API 获取前台窗口；同一应用持续期间合并为一条记录，应用切换时落库。',
        screenRule: 'AI 屏幕分类默认关闭。开启且配好 OpenAI 兼容 vision Key 时，按 aiIntervalMs（默认 2 分钟）截一次屏，调用视觉模型只返回结构化 JSON（活动类型/工作相关/风险等级/简述），不长期保存高清原图。',
        privacy: [
          '不记录键盘输入内容',
          '不读取微信 / 飞书等聊天正文',
          '截图临时用于 AI 分析后立即丢弃，仅保存结构化结论',
          '员工端可见采集状态，UI 不提供删除原始记录的按钮',
        ],
        categories: listCatalogByCategory(),
        meta: CATEGORY_META,
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/activity/screen-analyses') {
      const date = url.searchParams.get('date') || todayDateString()
      const employeeId = url.searchParams.get('employee') || 'local'
      const limit = Number(url.searchParams.get('limit') || 100)
      jsonResponse(res, 200, listScreenAnalyses({ date, employeeId, limit }))
      return
    }

    // POST /message — 发消息给意识体
    if (req.method === 'POST' && url.pathname === '/message') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8')
          const { from_id = 'ID:000001', content, channel = 'API', thread_id = 'main' } = JSON.parse(body)
          if (!content?.trim()) return jsonResponse(res, 400, { error: 'content required' })
          const trimmed = content.trim()
          const threadKey = String(thread_id || 'main').trim() || 'main'
          const renamedTo = extractAgentRename(trimmed)
          if (renamedTo) {
            setConfig('agent_name', renamedTo)
            emitEvent('agent_name_updated', { name: renamedTo })
          }
          pushMessage(from_id, trimmed, channel, { threadId: threadKey })
          try { touchChatThread(threadKey) } catch {}
          emitEvent('message_in', { from_id, content: trimmed, channel, thread_id: threadKey, timestamp: new Date().toISOString() })
          jsonResponse(res, 200, { ok: true, agent_name: getAgentName() })
        } catch (e) {
          jsonResponse(res, 400, { error: e.message })
        }
      })
      return
    }

    // GET /events — SSE 实时事件流（双向通讯的出口）
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      res.write(`data: ${JSON.stringify({ type: 'connected', ts: new Date().toISOString() })}\n\n`)
      flushStickyEvents(res)
      addSSEClient(res)
      const keepAlive = setInterval(() => {
        try { res.write(': ping\n\n') } catch (_) { clearInterval(keepAlive); removeSSEClient(res) }
      }, 15000)
      req.on('close', () => {
        clearInterval(keepAlive)
        removeSSEClient(res)
      })
      return
    }

    // GET /memories?limit=20&search=keyword
    if (req.method === 'GET' && url.pathname === '/memories') {
      const db = getDB()
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100)
      const search = url.searchParams.get('search')
      const scopeWhere = memoryScopeWhereFromUrl(url)
      const ftsScopeWhere = memoryScopeWhereFromUrl(url, 'm')
      let rows
      if (search) {
        try {
          rows = db.prepare(`
            SELECT m.* FROM memories m
            JOIN memories_fts ON memories_fts.rowid = m.id
            WHERE memories_fts MATCH ?
            ${ftsScopeWhere.clause}
            ORDER BY bm25(memories_fts), m.created_at DESC LIMIT ?
          `).all(search, ...ftsScopeWhere.params, limit)
        } catch {
          rows = db.prepare(`
            SELECT * FROM memories
            WHERE (content LIKE ? OR detail LIKE ?)
            ${scopeWhere.clause}
            ORDER BY created_at DESC LIMIT ?
          `).all(`%${search}%`, `%${search}%`, ...scopeWhere.params, limit)
        }
      } else {
        rows = db.prepare(`
          SELECT * FROM memories
          WHERE 1=1
          ${scopeWhere.clause}
          ORDER BY created_at DESC LIMIT ?
        `).all(...scopeWhere.params, limit)
      }
      jsonResponse(res, 200, rows)
      return
    }

    // GET /conversations?limit=60&thread_id=main — 按会话线程拉取聊天记录
    if (req.method === 'GET' && url.pathname === '/conversations') {
      const db = getDB()
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '60'), 500)
      const threadKey = String(url.searchParams.get('thread_id') || 'main').trim() || 'main'
      const rows = db.prepare(`
        SELECT id, role, from_id, to_id, content, timestamp, thread_id as threadId
        FROM conversations
        WHERE thread_id = ?
        ORDER BY id DESC
        LIMIT ?
      `).all(threadKey, limit)
      jsonResponse(res, 200, rows.reverse().map(row => (
        row.role === 'pulse'
          ? { ...row, content: stripAssistantHistoryLabels(row.content) }
          : row
      )))
      return
    }

    if (req.method === 'DELETE' && url.pathname === '/conversations') {
      const threadKey = String(url.searchParams.get('thread_id') || 'main').trim() || 'main'
      jsonResponse(res, 200, clearChatThreadConversations(threadKey))
      return
    }

    // GET /chat-threads — 会话线程列表（多窗口聊天）
    if (req.method === 'GET' && url.pathname === '/chat-threads') {
      jsonResponse(res, 200, listChatThreads())
      return
    }

    // POST /chat-threads — 新建会话 { title?, customer_id?, id? }
    if (req.method === 'POST' && url.pathname === '/chat-threads') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8')
          const parsed = JSON.parse(body || '{}')
          const title = parsed.title ?? '新会话'
          const customer_id = parsed.customer_id ?? ''
          const id = parsed.id ? String(parsed.id).trim() : null
          const tid = createChatThread({ id, title, customer_id })
          jsonResponse(res, 200, { ok: true, id: tid })
        } catch (e) {
          jsonResponse(res, 400, { ok: false, error: String(e.message || e) })
        }
      })
      return
    }

    const chatThreadPatch = req.method === 'PATCH' && url.pathname.startsWith('/chat-threads/')
    const chatThreadDel = req.method === 'DELETE' && url.pathname.startsWith('/chat-threads/')
    if (chatThreadPatch || chatThreadDel) {
      const tid = decodeURIComponent(url.pathname.slice('/chat-threads/'.length).split('/')[0] || '')
      if (!tid) {
        jsonResponse(res, 400, { ok: false, error: 'thread id required' })
        return
      }
      if (chatThreadDel) {
        const r = deleteChatThread(tid)
        jsonResponse(res, r.ok ? 200 : 400, r)
        return
      }
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8')
          const parsed = JSON.parse(body || '{}')
          const ok = updateChatThread(tid, {
            title: parsed.title,
            customer_id: parsed.customer_id,
          })
          jsonResponse(res, ok ? 200 : 404, { ok })
        } catch (e) {
          jsonResponse(res, 400, { ok: false, error: String(e.message || e) })
        }
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      const db = getDB()
      const { n } = db.prepare('SELECT COUNT(*) as n FROM memories').get()
      jsonResponse(res, 200, { ok: true, memory_count: n, running: isRunning() })
      return
    }

    // GET /persona — 用户画像聚合（person_000001 根记忆 + 关联子记忆）
    if (req.method === 'GET' && url.pathname === '/persona') {
      const db = getDB()
      const root = db.prepare(`SELECT * FROM memories WHERE mem_id = ? LIMIT 1`).get('person_000001')
      let children = []
      if (root) {
        children = db.prepare(`
          SELECT * FROM memories
          WHERE parent_id = ?
             OR entities LIKE ?
             OR tags LIKE ?
          ORDER BY COALESCE(timestamp, created_at) DESC
          LIMIT 40
        `).all(root.id, `%ID:000001%`, `%identity%`)
      } else {
        children = db.prepare(`
          SELECT * FROM memories
          WHERE entities LIKE ?
             OR tags LIKE ?
          ORDER BY COALESCE(timestamp, created_at) DESC
          LIMIT 40
        `).all(`%ID:000001%`, `%identity%`)
      }
      // 去重 + 排除 root 自身
      const seen = new Set()
      const dedup = []
      for (const r of children) {
        if (root && r.id === root.id) continue
        if (seen.has(r.id)) continue
        seen.add(r.id)
        dedup.push(r)
      }
      jsonResponse(res, 200, { ok: true, root: root || null, children: dedup })
      return
    }

    // GET /task — 当前进行中的任务（用于前端初始化进度条）
    if (req.method === 'GET' && url.pathname === '/task') {
      const task = getConfig('current_task') || ''
      let steps = []
      try {
        const raw = getConfig('current_task_steps')
        if (raw) steps = JSON.parse(raw)
      } catch {}
      jsonResponse(res, 200, { ok: true, task: task || null, steps: Array.isArray(steps) ? steps : [] })
      return
    }

    // GET /quota
    if (req.method === 'GET' && url.pathname === '/quota') {
      jsonResponse(res, 200, getQuotaStatus())
      return
    }

    // GET /hotspots — 统一热点数据，默认 30 分钟缓存
    if (req.method === 'GET' && url.pathname === '/hotspots') {
      getHotspots({
        force: /^(1|true|yes)$/i.test(url.searchParams.get('refresh') || ''),
        viewed: /^(1|true|yes)$/i.test(url.searchParams.get('viewed') || ''),
        industryId: url.searchParams.get('industry') || getActiveIndustry() || null,
      })
        .then((hotspots) => jsonResponse(res, 200, hotspots))
        .catch((err) => jsonResponse(res, 502, {
          ok: false,
          error: err.message,
          refreshMinutes: 30,
          platforms: {},
        }))
      return
    }

    // GET /industry-radar — 行业雷达（热点 / 商机 / 趋势 / 竞品 4 块）
    if (req.method === 'GET' && url.pathname === '/industry-radar') {
      const industryId = url.searchParams.get('industry') || getActiveIndustry() || null
      const force = /^(1|true|yes)$/i.test(url.searchParams.get('refresh') || '')
      getIndustryRadar({ industryId, force })
        .then((data) => jsonResponse(res, 200, data))
        .catch((err) => jsonResponse(res, 502, {
          ok: false,
          error: err.message,
          industry: null,
          hotspots: [],
          opportunities: [],
          trends: [],
          competitors: null,
        }))
      return
    }

    if (url.pathname === '/hotspot-state') {
      if (req.method === 'GET') {
        jsonResponse(res, 200, { ok: true, state: getHotspotPanelState() })
        return
      }
      if (req.method === 'POST') {
        readJsonBody(req)
          .then((body) => {
            const active = typeof body.active === 'boolean'
              ? body.active
              : /^(1|true|yes|open|show)$/i.test(String(body.active || ''))
            const state = setHotspotPanelState({ active, source: body.source || 'brain-ui' })
            jsonResponse(res, 200, { ok: true, state })
          })
          .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
        return
      }
    }

    // GET /doc-panel-state — 文档面板状态
    // POST /doc-panel-state — 设置文档面板状态 { active, topicId, source }
    if (url.pathname === '/doc-panel-state') {
      if (req.method === 'GET') {
        jsonResponse(res, 200, { ok: true, state: getDocPanelState() })
        return
      }
      if (req.method === 'POST') {
        readJsonBody(req)
          .then((body) => {
            const active = typeof body.active === 'boolean'
              ? body.active
              : /^(1|true|yes|open|show)$/i.test(String(body.active || ''))
            const state = setDocPanelState({ active, topicId: body.topicId || null, source: body.source || 'brain-ui' })
            jsonResponse(res, 200, { ok: true, state })
          })
          .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
        return
      }
    }

    // GET /docs/:topicId — 获取指定文档主题内容
    if (req.method === 'GET' && url.pathname.startsWith('/docs/')) {
      const topicId = url.pathname.slice(6)
      const doc = DOC_TOPICS[topicId]
      if (!doc) {
        jsonResponse(res, 404, { ok: false, error: `unknown topic: ${topicId}` })
        return
      }
      jsonResponse(res, 200, { ok: true, doc })
      return
    }

    // GET /docs — 所有文档主题列表
    if (req.method === 'GET' && url.pathname === '/docs') {
      const topics = Object.values(DOC_TOPICS).map(({ id, title, subtitle, icon, summary }) => ({ id, title, subtitle, icon, summary }))
      jsonResponse(res, 200, { ok: true, topics })
      return
    }

    // ─── 行业包 API ───────────────────────────────────────────
    // GET /industry — 返回行业包全部状态
    if (req.method === 'GET' && url.pathname === '/industry') {
      jsonResponse(res, 200, { ok: true, ...getIndustryStateWithStats(url) })
      return
    }

    // GET /industry/diagnostics — 返回各行业数据隔离统计（只读）
    if (req.method === 'GET' && url.pathname === '/industry/diagnostics') {
      try {
        jsonResponse(res, 200, { ok: true, ...getIndustryDiagnostics() })
      } catch (e) {
        jsonResponse(res, 500, { ok: false, error: e.message })
      }
      return
    }

    // POST /industry/active — 切换当前活跃行业 { id }
    if (req.method === 'POST' && url.pathname === '/industry/active') {
      readJsonBody(req)
        .then((body) => {
          const nextId = body.id || null
          setActiveIndustry(nextId)
          if (!nextId) setEnabledIndustries([])
          clearIndustryRadarCache()
          jsonResponse(res, 200, { ok: true, ...getIndustryStateWithStats(url) })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    // POST /industry/enabled — 设置启用的行业列表 { ids: [] }
    if (req.method === 'POST' && url.pathname === '/industry/enabled') {
      readJsonBody(req)
        .then((body) => {
          setEnabledIndustries(body.ids || [])
          jsonResponse(res, 200, { ok: true, ...getIndustryStateWithStats(url) })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    // GET /industry/prompts — 返回当前活跃行业的话术模板
    if (req.method === 'GET' && url.pathname === '/industry/prompts') {
      const pack = getActivePack()
      jsonResponse(res, 200, {
        ok: true,
        industry: pack ? { id: pack.id, name: pack.name, icon: pack.icon } : null,
        prompts: pack?.prompts || [],
      })
      return
    }

    // ─── 客户档案 API ─────────────────────────────────────────
    // GET /customers — 客户列表（默认按当前行业过滤，?all=1 跨行业，?industry=xxx 指定行业）
    if (req.method === 'GET' && url.pathname === '/customers') {
      const opts = customerListOptionsFromUrl(url)
      jsonResponse(res, 200, { ok: true, customers: opts ? listCustomers(opts) : listCustomers() })
      return
    }

    // GET /biz/today — 业务面板首屏关键指标
    if (req.method === 'GET' && url.pathname === '/biz/today') {
      try {
        const opts = customerListOptionsFromUrl(url)
        const customers = opts ? listCustomers(opts) : listCustomers()
        const now = Date.now()
        const DAY = 24 * 3600 * 1000
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
        const todayMs = todayStart.getTime()
        const weekAgoMs = now - 7 * DAY
        const todayContacted = customers.filter(c => {
          const t = c.updatedAt ? new Date(c.updatedAt).getTime() : 0
          return t >= todayMs
        }).length
        const weekNew = customers.filter(c => {
          const t = c.createdAt ? new Date(c.createdAt).getTime() : 0
          return t >= weekAgoMs
        }).length
        // 待跟进：updatedAt > 3 天没动且 stage 不在终态
        const TERMINAL = new Set(['签约', '长期合作', '已签约', '丢单', '关闭'])
        const followups = customers
          .filter(c => !TERMINAL.has(c.fields?.stage))
          .map(c => {
            const staleDays = c.updatedAt ? Math.floor((now - new Date(c.updatedAt).getTime()) / DAY) : 999
            const stage = c.fields?.stage || ''
            return {
              id: c.id,
              name: c.displayName || c.fields?.shop_name || c.fields?.company_name || '未命名',
              stage,
              updatedAt: c.updatedAt,
              staleDays,
              health: customerHealthSignal({ stage, staleDays }),
              industryIcon: c.industryIcon || '',
            }
          })
          .sort((a, b) => b.staleDays - a.staleDays)
          .slice(0, 5)
        let totalMemories = 0
        try {
          const db = getDB()
          const memScope = memoryScopeWhereFromUrl(url)
          totalMemories = db.prepare(`SELECT COUNT(*) AS c FROM memories WHERE 1=1${memScope.clause}`).get(...memScope.params).c || 0
        } catch {}
        jsonResponse(res, 200, {
          ok: true,
          todayContacted,
          weekNew,
          totalCustomers: customers.length,
          totalMemories,
          followups,
        })
      } catch (e) {
        jsonResponse(res, 500, { ok: false, error: e.message })
      }
      return
    }

    // GET /biz/followups — 跟进分组（今日 / 逾期 / 本周 / 长期未跟进）
    if (req.method === 'GET' && url.pathname === '/biz/followups') {
      try {
        const opts = customerListOptionsFromUrl(url)
        const customers = opts ? listCustomers(opts) : listCustomers()
        const now = Date.now()
        const DAY = 24 * 3600 * 1000
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayMs = todayStart.getTime()
        const tomorrowMs = todayMs + DAY
        const weekEndMs = todayMs + 7 * DAY

        const TERMINAL = new Set(['签约', '长期合作', '已签约', '丢单', '关闭'])
        const STALE_THRESHOLD_DAYS = 7

        const parseDate = (s) => {
          if (!s) return NaN
          const t = new Date(s).getTime()
          return Number.isFinite(t) ? t : NaN
        }

        const buildItem = (c) => {
          const upd = c.updatedAt ? new Date(c.updatedAt).getTime() : 0
          const staleDays = upd ? Math.floor((now - upd) / DAY) : 999
          return {
            id: c.id,
            name: c.displayName || c.fields?.company_name || c.fields?.shop_name || c.fields?.contact_person || '未命名',
            stage: c.fields?.stage || '',
            contact: c.fields?.contact_person || '',
            phone: c.fields?.contact_phone || '',
            industryName: c.industryName || '',
            industryIcon: c.industryIcon || '',
            nextFollowAt: c.fields?.next_follow_at || '',
            updatedAt: c.updatedAt || '',
            staleDays,
          }
        }

        const overdue = []
        const today_due = []
        const this_week = []
        const stale = []

        for (const c of customers) {
          if (TERMINAL.has(c.fields?.stage)) continue
          const item = buildItem(c)
          const nfa = parseDate(c.fields?.next_follow_at)
          if (Number.isFinite(nfa)) {
            if (nfa < todayMs) overdue.push(item)
            else if (nfa < tomorrowMs) today_due.push(item)
            else if (nfa < weekEndMs) this_week.push(item)
          } else if (item.staleDays >= STALE_THRESHOLD_DAYS) {
            stale.push(item)
          }
        }

        overdue.sort((a, b) => parseDate(a.nextFollowAt) - parseDate(b.nextFollowAt))
        today_due.sort((a, b) => a.name.localeCompare(b.name))
        this_week.sort((a, b) => parseDate(a.nextFollowAt) - parseDate(b.nextFollowAt))
        stale.sort((a, b) => b.staleDays - a.staleDays)

        jsonResponse(res, 200, {
          ok: true,
          generatedAt: new Date().toISOString(),
          counts: {
            today: today_due.length,
            overdue: overdue.length,
            week: this_week.length,
            stale: stale.length,
          },
          today: today_due,
          overdue,
          week: this_week,
          stale,
        })
      } catch (e) {
        jsonResponse(res, 500, { ok: false, error: e.message })
      }
      return
    }

    // POST /customers/:id/follow-up — 写一次跟进记录
    // body: { note?: string, nextFollowAt?: 'YYYY-MM-DD', stage?: string }
    // 把跟进备注追加到客户的 follow_log 字段，并自动更新 updatedAt 与 next_follow_at
    if (req.method === 'POST' && url.pathname.startsWith('/customers/') && url.pathname.endsWith('/follow-up')) {
      const id = decodeURIComponent(url.pathname.slice('/customers/'.length, -('/follow-up'.length)))
      readJsonBody(req)
        .then((body) => {
          const target = getCustomer(id)
          if (!target) {
            jsonResponse(res, 404, { ok: false, error: '客户不存在' })
            return
          }
          const note = String(body.note || '').trim()
          const nextFollowAt = String(body.nextFollowAt || '').trim()
          const stage = String(body.stage || '').trim()
          const log = Array.isArray(target.fields?.follow_log) ? [...target.fields.follow_log] : []
          if (note) {
            log.unshift({ at: new Date().toISOString(), note })
          }
          const nextFields = { ...(target.fields || {}) }
          if (note) nextFields.follow_log = log.slice(0, 50)  // 最多保留 50 条
          if (nextFollowAt) nextFields.next_follow_at = nextFollowAt
          if (stage) nextFields.stage = stage
          const nextFieldLabels = { ...(target.fieldLabels || {}) }
          if (note && !nextFieldLabels.follow_log) nextFieldLabels.follow_log = '跟进记录'
          if (nextFollowAt && !nextFieldLabels.next_follow_at) nextFieldLabels.next_follow_at = '下次跟进日期'

          const saved = saveCustomer({
            id: target.id,
            industryId: target.industryId || '',
            industryName: target.industryName,
            industryIcon: target.industryIcon,
            displayName: target.displayName,
            fields: nextFields,
            fieldLabels: nextFieldLabels,
          }, { setCurrent: false })
          jsonResponse(res, 200, { ok: true, customer: saved })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    // GET /biz/distribution — 客户阶段分布
    if (req.method === 'GET' && url.pathname === '/biz/distribution') {
      try {
        const opts = customerListOptionsFromUrl(url)
        const customers = opts ? listCustomers(opts) : listCustomers()
        const stageCounts = {}
        for (const c of customers) {
          const stage = c.fields?.stage || '未分类'
          stageCounts[stage] = (stageCounts[stage] || 0) + 1
        }
        const items = Object.entries(stageCounts)
          .map(([stage, count]) => ({ stage, count }))
          .sort((a, b) => b.count - a.count)
        jsonResponse(res, 200, { ok: true, total: customers.length, items })
      } catch (e) {
        jsonResponse(res, 500, { ok: false, error: e.message })
      }
      return
    }

    // POST /customers — 新建/更新客户 { id?, industryName, industryIcon, fields: {...}, fieldLabels: {...} }
    if (req.method === 'POST' && url.pathname === '/customers') {
      readJsonBody(req)
        .then((body) => {
          const saved = saveCustomer({
            id: body.id || null,
            industryId: body.industryId || getActiveIndustry() || '',
            industryName: body.industryName || '',
            industryIcon: body.industryIcon || '',
            fields: body.fields || {},
            fieldLabels: body.fieldLabels || {},
            displayName: body.displayName || '',
          }, { setCurrent: body.setCurrent !== false })
          jsonResponse(res, 200, { ok: true, customer: saved })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    // GET /org/company — 公司资料
    if (req.method === 'GET' && url.pathname === '/org/company') {
      jsonResponse(res, 200, { ok: true, company: getCompanyProfile(orgIndustryOptionsFromUrl(url)) })
      return
    }

    // POST /org/company — 保存公司资料
    if (req.method === 'POST' && url.pathname === '/org/company') {
      readJsonBody(req)
        .then((body) => {
          const company = saveCompanyProfile(body || {}, orgIndustryOptionsFromUrl(url))
          jsonResponse(res, 200, { ok: true, company })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    // GET /org/employees — 员工列表
    if (req.method === 'GET' && url.pathname === '/org/employees') {
      jsonResponse(res, 200, { ok: true, employees: listEmployees(orgIndustryOptionsFromUrl(url)) })
      return
    }

    // POST /org/employees — 新建/更新员工
    if (req.method === 'POST' && url.pathname === '/org/employees') {
      readJsonBody(req)
        .then((body) => {
          const employee = saveEmployee(body || {}, orgIndustryOptionsFromUrl(url))
          jsonResponse(res, 200, { ok: true, employee })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    // DELETE /org/employees/:id — 删除员工
    if (req.method === 'DELETE' && url.pathname.startsWith('/org/employees/')) {
      const id = decodeURIComponent(url.pathname.slice('/org/employees/'.length))
      deleteEmployee(id, orgIndustryOptionsFromUrl(url))
      jsonResponse(res, 200, { ok: true })
      return
    }

    // DELETE /customers/:id — 删除
    if (req.method === 'DELETE' && url.pathname.startsWith('/customers/')) {
      const id = url.pathname.slice('/customers/'.length)
      deleteCustomer(id, customerListOptionsFromUrl(url))
      jsonResponse(res, 200, { ok: true })
      return
    }

    // GET /customer/current — 当前客户
    if (req.method === 'GET' && url.pathname === '/customer/current') {
      jsonResponse(res, 200, { ok: true, customer: getCurrentCustomer() })
      return
    }

    // POST /customer/current — 设置当前客户 { id: string | null }
    if (req.method === 'POST' && url.pathname === '/customer/current') {
      readJsonBody(req)
        .then((body) => {
          setCurrentCustomerId(body.id || null)
          jsonResponse(res, 200, { ok: true, customer: getCurrentCustomer() })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    // POST /industry/onboarded — 标记已完成首次引导（body 可带 { value: false } 重置）
    if (req.method === 'POST' && url.pathname === '/industry/onboarded') {
      readJsonBody(req)
        .then((body) => {
          if (body && body.value === false) {
            setOnboarded(false)
          } else {
            markOnboarded()
          }
          jsonResponse(res, 200, { ok: true })
        })
        .catch(() => {
          // 无 body 也按标记为已完成处理
          markOnboarded()
          jsonResponse(res, 200, { ok: true })
        })
      return
    }

    if (req.method === 'GET' && url.pathname === '/person-card') {
      const name = url.searchParams.get('name') || url.searchParams.get('q') || ''
      jsonResponse(res, 200, { ok: true, card: getPersonCard(name) })
      return
    }

    if (url.pathname === '/person-card-state') {
      if (req.method === 'GET') {
        jsonResponse(res, 200, { ok: true, state: getPersonCardPanelState() })
        return
      }
      if (req.method === 'POST') {
        readJsonBody(req)
          .then((body) => {
            const active = typeof body.active === 'boolean'
              ? body.active
              : /^(1|true|yes|open|show)$/i.test(String(body.active || ''))
            const state = setPersonCardPanelState({
              active,
              source: body.source || 'brain-ui',
              card: body.card || null,
              name: body.name || '',
            })
            jsonResponse(res, 200, { ok: true, state })
          })
          .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
        return
      }
    }

    if (req.method === 'GET' && url.pathname === '/system-prompt-preview') {
      Promise.resolve()
        .then(() => buildHeartbeatSystemPromptPreview({
          stateSnapshot: typeof getStateSnapshot === 'function' ? getStateSnapshot() : {},
        }))
        .then((preview) => jsonResponse(res, 200, preview))
        .catch((err) => jsonResponse(res, 500, { error: err.message }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/agent-profile') {
      jsonResponse(res, 200, { name: getAgentName() })
      return
    }

    // POST /agent-profile — { name } 直接设助手名（前端按行业自动同步用）
    if (req.method === 'POST' && url.pathname === '/agent-profile') {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8') || '{}'
          const { name } = JSON.parse(body)
          const next = String(name || '').trim()
          if (!next) {
            jsonResponse(res, 400, { ok: false, error: 'name required' })
            return
          }
          if (next.length > 24) {
            jsonResponse(res, 400, { ok: false, error: 'name too long' })
            return
          }
          setConfig('agent_name', next)
          emitEvent('agent_name_updated', { name: next })
          jsonResponse(res, 200, { ok: true, name: next })
        } catch (e) {
          jsonResponse(res, 400, { ok: false, error: e.message })
        }
      })
      return
    }

    // GET /reminders — 列出当前用户的待办提醒（按 due_at 升序）
    if (req.method === 'GET' && url.pathname === '/reminders') {
      try {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500)
        const items = listActiveReminders(limit).map((row) => normalizeReminderRow(row))
        jsonResponse(res, 200, { ok: true, reminders: items })
      } catch (e) {
        jsonResponse(res, 500, { ok: false, error: e.message })
      }
      return
    }

    if (req.method === 'GET' && url.pathname === '/reminders/stats') {
      try {
        const date = url.searchParams.get('date') || todayDateString()
        const stats = getReminderStats({ date })
        jsonResponse(res, 200, { ...stats, next: stats.next ? normalizeReminderRow(stats.next) : null })
      } catch (e) {
        jsonResponse(res, 500, { ok: false, error: e.message })
      }
      return
    }

    if (req.method === 'GET' && url.pathname === '/reminders/completed') {
      try {
        const date = url.searchParams.get('date') || null
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)
        const reminders = listCompletedReminders({ date, limit }).map((row) => normalizeReminderRow(row))
        jsonResponse(res, 200, { ok: true, date, reminders })
      } catch (e) {
        jsonResponse(res, 500, { ok: false, error: e.message })
      }
      return
    }

    // POST /reminders — 创建提醒 { task, dueAt(ISO 或 yyyy-MM-ddTHH:mm), systemMessage?, source?, recurrenceType?, recurrenceConfig? }
    if (req.method === 'POST' && url.pathname === '/reminders') {
      readJsonBody(req)
        .then((body = {}) => {
          const task = String(body.task || '').trim()
          if (!task) return jsonResponse(res, 400, { ok: false, error: 'task required' })
          const dueAt = parseIncomingDueAt(body.dueAt)
          if (!dueAt) return jsonResponse(res, 400, { ok: false, error: 'dueAt invalid' })
          const systemMessage = String(body.systemMessage || '').trim() || `到时间了，提醒你：${task}`
          const source = String(body.source || 'nimo-ui').slice(0, 120)
          const recurrenceType = body.recurrenceType ? String(body.recurrenceType).slice(0, 32) : null
          const recurrenceConfig = body.recurrenceConfig && typeof body.recurrenceConfig === 'object' ? body.recurrenceConfig : null
          const r = createReminder({
            userId: 'ID:000001',
            dueAt,
            task,
            systemMessage,
            source,
            recurrenceType,
            recurrenceConfig,
          })
          const id = r?.lastInsertRowid
          const row = id ? getReminderById(id) : null
          const reminder = row ? normalizeReminderRow(row) : null
          emitEvent('reminder_changed', { action: 'created', id, reminder })
          jsonResponse(res, 200, { ok: true, id, reminder })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    // POST /reminders/:id/complete — 标记已完成
    if (req.method === 'POST' && /^\/reminders\/(\d+)\/complete$/.test(url.pathname)) {
      const id = Number(url.pathname.match(/^\/reminders\/(\d+)\/complete$/)[1])
      try {
        const r = completeReminder(id)
        const reminder = getReminderById(id)
        emitEvent('reminder_changed', { action: 'completed', id, reminder: reminder ? normalizeReminderRow(reminder) : null })
        jsonResponse(res, 200, { ok: true, changes: r?.changes || 0, reminder: reminder ? normalizeReminderRow(reminder) : null })
      } catch (e) {
        jsonResponse(res, 500, { ok: false, error: e.message })
      }
      return
    }

    // POST /reminders/:id/snooze — body { minutes=10 } 稍后再提醒
    if (req.method === 'POST' && /^\/reminders\/(\d+)\/snooze$/.test(url.pathname)) {
      const id = Number(url.pathname.match(/^\/reminders\/(\d+)\/snooze$/)[1])
      readJsonBody(req)
        .then((body = {}) => {
          const minutes = Math.max(1, Math.min(24 * 60, Number(body.minutes || 10)))
          const next = new Date(Date.now() + minutes * 60 * 1000).toISOString()
          const r = snoozeReminder(id, next)
          const reminder = getReminderById(id)
          emitEvent('reminder_changed', { action: 'snoozed', id, dueAt: next, minutes, reminder: reminder ? normalizeReminderRow(reminder) : null })
          jsonResponse(res, 200, { ok: true, changes: r?.changes || 0, dueAt: next, minutes, reminder: reminder ? normalizeReminderRow(reminder) : null })
        })
        .catch((err) => jsonResponse(res, 400, { ok: false, error: err.message }))
      return
    }

    // POST /reminders/:id/cancel — 取消/删除
    if (req.method === 'POST' && /^\/reminders\/(\d+)\/cancel$/.test(url.pathname)) {
      const id = Number(url.pathname.match(/^\/reminders\/(\d+)\/cancel$/)[1])
      try {
        const r = cancelReminder(id)
        emitEvent('reminder_changed', { action: 'cancelled', id })
        jsonResponse(res, 200, { ok: true, changes: r?.changes || 0 })
      } catch (e) {
        jsonResponse(res, 500, { ok: false, error: e.message })
      }
      return
    }

    // GET /media/history?limit=30
    if (req.method === 'GET' && url.pathname === '/media/history') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100)
      jsonResponse(res, 200, getMediaHistory(limit))
      return
    }

    // POST /media/history — { kind, url, title, videoId, platform }
    if (req.method === 'POST' && url.pathname === '/media/history') {
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString())
          if (!body.url || !body.kind) return jsonResponse(res, 400, { ok: false, error: 'url and kind required' })
          upsertMediaHistory(body)
          jsonResponse(res, 200, { ok: true })
        } catch (e) {
          jsonResponse(res, 400, { ok: false, error: e.message })
        }
      })
      return
    }

    // GET /favicon.ico ? silence the browser's automatic favicon request
    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      res.writeHead(204)
      res.end()
      return
    }

    // DELETE /memories/by-type/:event_type — 批量删除某类记忆（清理系统副产物）
    if (req.method === 'DELETE' && url.pathname.startsWith('/memories/by-type/')) {
      const type = decodeURIComponent(url.pathname.slice('/memories/by-type/'.length))
      if (!type) return jsonResponse(res, 400, { ok: false, error: 'type required' })
      const ALLOWED = new Set(['hotspot_event', 'system', 'tick', 'task_complete'])
      if (!ALLOWED.has(type)) return jsonResponse(res, 400, { ok: false, error: `type ${type} not allowed for batch delete` })
      const db = getDB()
      const r = db.prepare('DELETE FROM memories WHERE event_type = ?').run(type)
      jsonResponse(res, 200, { ok: true, deleted: r.changes })
      return
    }

    // POST /memories — 手动新建记忆（UI: 记忆管理面板"新建"按钮）
    if (req.method === 'POST' && url.pathname === '/memories') {
      readJsonBody(req)
        .then((body = {}) => {
          const content = String(body.content || '').trim()
          if (!content) return jsonResponse(res, 400, { ok: false, error: 'content is required' })
          const allowedTypes = ['person', 'object', 'article', 'knowledge', 'fact']
          const event_type = allowedTypes.includes(body.event_type) ? body.event_type : 'fact'
          const memory = {
            event_type,
            content,
            detail: String(body.detail || ''),
            title: String(body.title || ''),
            entities: Array.isArray(body.entities) ? body.entities : [],
            concepts: Array.isArray(body.concepts) ? body.concepts : [],
            tags: Array.isArray(body.tags) ? [...body.tags, 'manual'] : ['manual'],
            timestamp: new Date().toISOString(),
          }
          if (body.mem_id) memory.mem_id = String(body.mem_id)
          const result = insertMemory(memory)
          emitEvent('memories_written', {
            count: 1,
            memories: [{
              id: result?.id,
              mem_id: memory.mem_id || null,
              action: result?.updated ? 'updated' : 'inserted',
              type: event_type,
              title: memory.title,
              content: memory.content,
            }],
          })
          jsonResponse(res, 200, { ok: true, id: result?.id, updated: !!result?.updated })
        })
        .catch((e) => jsonResponse(res, 400, { ok: false, error: e.message }))
      return
    }

    // DELETE /memories/:id — 删除记忆
    if (req.method === 'DELETE' && url.pathname.startsWith('/memories/')) {
      const id = parseInt(url.pathname.split('/')[2])
      if (!id) return jsonResponse(res, 400, { error: 'invalid id' })
      const db = getDB()
      db.prepare('DELETE FROM memories WHERE id = ?').run(id)
      jsonResponse(res, 200, { ok: true })
      return
    }

    // PATCH /memories/:id — 修改记忆 content/detail
    if (req.method === 'PATCH' && url.pathname.startsWith('/memories/')) {
      const id = parseInt(url.pathname.split('/')[2])
      if (!id) return jsonResponse(res, 400, { error: 'invalid id' })
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const { content, detail } = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
          const db = getDB()
          if (content !== undefined) db.prepare('UPDATE memories SET content = ? WHERE id = ?').run(content, id)
          if (detail !== undefined) db.prepare('UPDATE memories SET detail = ? WHERE id = ?').run(detail, id)
          jsonResponse(res, 200, { ok: true })
        } catch (e) {
          jsonResponse(res, 400, { error: e.message })
        }
      })
      return
    }

    // GET /media/music/:filename — 提供 musicDir 音频文件（避免 file:// 跨源限制）
    if (req.method === 'GET' && url.pathname.startsWith('/media/music/')) {
      const raw = url.pathname.slice('/media/music/'.length)
      const filename = path.basename(decodeURIComponent(raw))
      const filePath = path.join(paths.musicDir, filename)
      const resolvedFile = path.resolve(filePath)
      const resolvedDir  = path.resolve(paths.musicDir)
      if (!resolvedFile.startsWith(resolvedDir + path.sep) && resolvedFile !== resolvedDir) {
        res.writeHead(403); res.end('forbidden'); return
      }
      const mimeMap = {
        '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav',
        '.aac': 'audio/aac',  '.ogg': 'audio/ogg',   '.m4a': 'audio/mp4',
        '.opus': 'audio/ogg; codecs=opus',
      }
      const contentType = mimeMap[path.extname(filename).toLowerCase()] || 'audio/mpeg'
      try {
        const stat = fs.statSync(filePath)
        const total = stat.size
        const rangeHeader = req.headers.range
        if (rangeHeader) {
          const m = rangeHeader.match(/bytes=(\d*)-(\d*)/)
          const start = m[1] ? parseInt(m[1]) : 0
          const end   = m[2] ? parseInt(m[2]) : total - 1
          res.writeHead(206, {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Cache-Control': 'no-cache',
          })
          fs.createReadStream(filePath, { start, end }).pipe(res)
        } else {
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': total,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
          })
          fs.createReadStream(filePath).pipe(res)
        }
      } catch {
        res.writeHead(404); res.end('music file not found')
      }
      return
    }

    // GET /audio/:filename — 提供 sandbox 音频文件
    if (req.method === 'GET' && url.pathname.startsWith('/audio/')) {
      const filename = path.basename(url.pathname)
      const filePath = path.join(SANDBOX_PATH, 'audio', filename)
      try {
        const stat = fs.statSync(filePath)
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': stat.size,
          'Cache-Control': 'no-cache',
        })
        fs.createReadStream(filePath).pipe(res)
      } catch {
        res.writeHead(404)
        res.end('audio not found')
      }
      return
    }

    // GET /activation-status — 查询是否已经激活
    if (req.method === 'GET' && url.pathname === '/activation-status') {
      jsonResponse(res, 200, getActivationStatus())
      return
    }

    // POST /activate — 填入 API Key 完成激活
    if (req.method === 'POST' && url.pathname === '/activate') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', async () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8')
          const { apiKey, model, provider, baseURL } = JSON.parse(body || '{}')
          const info = await activateLLM({ provider, apiKey, model, baseURL })
          emitEvent('activated', info)
          // 通知 index.js 启动主循环
          if (typeof onActivatedCallback === 'function') {
            try { onActivatedCallback() } catch (err) { console.error('[API] onActivated 回调出错:', err) }
          }
          jsonResponse(res, 200, { ok: true, ...info })
        } catch (err) {
          jsonResponse(res, 400, { ok: false, error: err.message })
        }
      })
      return
    }

    // GET /settings — 返回当前 LLM + MiniMax 配置状态
    if (req.method === 'GET' && url.pathname === '/settings') {
      const status = getActivationStatus()
      const minimaxKey = getMinimaxKey()
      jsonResponse(res, 200, {
        llm: {
          activated: status.activated,
          provider: status.provider,
          model: status.model,
          baseURL: status.baseURL,
          models: status.models,
          temperature: config.temperature,
        },
        providers: getProviderSummaries(),
        minimax: {
          configured: !!(globalThis.process?.env?.MINIMAX_API_KEY || minimaxKey),
        },
      })
      return
    }

    // POST /settings/model — 仅切换模型（不需重新输入 Key）
    if (req.method === 'POST' && url.pathname === '/settings/model') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const { model } = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
          const result = switchModel(model)
          emitEvent('model_switched', result)
          jsonResponse(res, 200, { ok: true, ...result })
        } catch (err) {
          jsonResponse(res, 400, { ok: false, error: err.message })
        }
      })
      return
    }

    // POST /settings/temperature — 设置 LLM temperature
    if (req.method === 'POST' && url.pathname === '/settings/temperature') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const { temperature } = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
          const result = setTemperature(temperature)
          jsonResponse(res, 200, { ok: true, ...result })
        } catch (err) {
          jsonResponse(res, 400, { ok: false, error: err.message })
        }
      })
      return
    }

    // GET /settings/social — 读取各平台配置状态（不返回明文 key）
    if (req.method === 'GET' && url.pathname === '/settings/social') {
      jsonResponse(res, 200, { ok: true, social: getSocialConfig() })
      return
    }

    // POST /settings/social — 保存平台凭证，并热重启受影响的连接器
    if (req.method === 'POST' && url.pathname === '/settings/social') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', async () => {
        try {
          const updates = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
          setSocialConfig(updates)
          // 哪些平台的 key 被更新了，就重启对应连接器
          const PLATFORM_KEYS = {
            discord: ['DISCORD_BOT_TOKEN'],
          }
          for (const [platform, keys] of Object.entries(PLATFORM_KEYS)) {
            if (keys.some(k => updates[k])) {
              restartConnector(platform, { pushMessage, emitEvent }).catch(err =>
                console.warn(`[social] restart ${platform} failed:`, err.message)
              )
            }
          }
          // 用户点击「连接微信」时触发 ClawBot 连接器重启
          if (updates._clawbot_connect) {
            const result = await restartConnector('wechat-clawbot', { pushMessage, emitEvent })
            if (result && result.ok === false) {
              return jsonResponse(res, 500, { ok: false, error: result.error || '微信连接器启动失败' })
            }
          }
          jsonResponse(res, 200, { ok: true, social: getSocialConfig() })
        } catch (err) {
          jsonResponse(res, 400, { ok: false, error: err.message })
        }
      })
      return
    }

    // POST /settings/minimax — 设置 MiniMax API Key
    if (req.method === 'POST' && url.pathname === '/settings/minimax') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const { apiKey } = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
          const trimmed = String(apiKey || '').trim()
          if (!trimmed) throw new Error('API Key 不能为空')
          setMinimaxKey(trimmed)
          replaceProvider(new MinimaxProvider({ apiKey: trimmed }))
          jsonResponse(res, 200, { ok: true, configured: true })
        } catch (err) {
          jsonResponse(res, 400, { ok: false, error: err.message })
        }
      })
      return
    }

    // GET /onboarding — 三步引导页（欢迎 / 配 API Keys / 选行业）
    if (req.method === 'GET' && (url.pathname === '/onboarding' || url.pathname === '/onboarding.html')) {
      try {
        const html = fs.readFileSync(ONBOARDING_PATH, 'utf-8')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(html)
      } catch {
        res.writeHead(404)
        res.end('onboarding.html not found')
      }
      return
    }

    // GET /activation — 激活引导页（保留：兼容老链接和单独激活场景）
    if (req.method === 'GET' && (url.pathname === '/activation' || url.pathname === '/activation.html')) {
      try {
        const html = fs.readFileSync(ACTIVATION_PATH, 'utf-8')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      } catch {
        res.writeHead(404)
        res.end('activation.html not found')
      }
      return
    }

    // GET / — 未激活或未完成首次引导时进入引导页，已完成时进入 brain-ui
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      if (config.needsActivation || !isOnboarded()) {
        res.writeHead(302, { Location: '/onboarding' })
        res.end()
        return
      }
      try {
        let html = fs.readFileSync(INDEX_PATH, 'utf-8')
        // Cache-bust：给所有 ./src/ui/brain-ui/* 资源加版本号，避免 WebView 缓存
        html = html.replace(/(["'])(\.\/src\/ui\/brain-ui\/[^"']+?)(["'])/g, (_, q1, asset, q2) => `${q1}${asset}?v=${ASSET_VERSION}${q2}`)
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(html)
      } catch {
        // 没有 index.html 时，直接去 brain-ui
        res.writeHead(302, { Location: '/brain-ui' })
        res.end()
      }
      return
    }

    if (req.method === 'GET' && url.pathname === '/dashboard.html') {
      try {
        const html = fs.readFileSync(DASHBOARD_PATH, 'utf-8')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      } catch {
        res.writeHead(404)
        res.end('dashboard.html not found')
      }
      return
    }

    // GET /brain.html — Brain Monitor
    if (req.method === 'GET' && url.pathname === '/brain.html') {
      try {
        const html = fs.readFileSync(BRAIN_PATH, 'utf-8')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      } catch {
        res.writeHead(404)
        res.end('brain.html not found')
      }
      return
    }

    // GET /brain-ui — Brain UI（记忆图谱 + 思考流 + 聊天）
    if (req.method === 'GET' && (url.pathname === '/site' || url.pathname === '/site.html')) {
      try {
        const html = fs.readFileSync(WEBSITE_PATH, 'utf-8')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      } catch {
        res.writeHead(404)
        res.end('website.html not found')
      }
      return
    }

    if (req.method === 'GET' && (url.pathname === '/brain-ui' || url.pathname === '/brain-ui.html')) {
      if (config.needsActivation) {
        res.writeHead(302, { Location: '/activation' })
        res.end()
        return
      }
      try {
        let html = fs.readFileSync(BRAIN_UI_PATH, 'utf-8')
        // Cache-bust：给所有相对路径的 brain-ui 资源加上启动时间戳版本号，
        // 避免 Electron webContents 缓存住旧的 styles.css / app.js
        html = html.replace(/(["'])(\.\/src\/ui\/brain-ui\/[^"']+?)(["'])/g, (_, q1, asset, q2) => `${q1}${asset}?v=${ASSET_VERSION}${q2}`)
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(html)
      } catch {
        res.writeHead(404)
        res.end('brain-ui.html not found')
      }
      return
    }

    if (req.method === 'GET' && url.pathname === '/systemPrompt.html') {
      try {
        const html = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      } catch {
        res.writeHead(404)
        res.end('systemPrompt.html not found')
      }
      return
    }

    // /build/* 静态资源（图标、logo、构建素材等）
    if (req.method === 'GET' && url.pathname.startsWith('/build/')) {
      const rel = decodeURIComponent(url.pathname.slice('/build/'.length))
      const buildRoot = path.resolve(paths.resourcesDir, 'build')
      const target = path.resolve(buildRoot, rel)
      if (!isPathInside(buildRoot, target)) {
        res.writeHead(403)
        res.end('forbidden')
        return
      }
      try {
        const stat = fs.statSync(target)
        if (!stat.isFile()) throw new Error('not a file')
        res.writeHead(200, {
          'Content-Type': contentTypeFor(target),
          'Content-Length': stat.size,
          'Cache-Control': 'public, max-age=3600',
        })
        fs.createReadStream(target).pipe(res)
      } catch {
        res.writeHead(404)
        res.end('not found')
      }
      return
    }

    if (req.method === 'GET' && url.pathname === '/vendor/d3/d3.min.js') {
      try {
        const stat = fs.statSync(D3_VENDOR_PATH)
        res.writeHead(200, {
          'Content-Type': contentTypeFor(D3_VENDOR_PATH),
          'Content-Length': stat.size,
          'Cache-Control': 'public, max-age=31536000, immutable',
        })
        fs.createReadStream(D3_VENDOR_PATH).pipe(res)
      } catch {
        res.writeHead(404)
        res.end('d3.min.js not found')
      }
      return
    }

    if (req.method === 'GET' && url.pathname.startsWith('/src/ui/brain-ui/')) {
      const relativePath = decodeURIComponent(url.pathname.slice('/src/ui/brain-ui/'.length))
      const assetRoot = path.resolve(BRAIN_UI_ASSET_ROOT)
      const assetPath = path.resolve(BRAIN_UI_ASSET_ROOT, relativePath)

      if (!isPathInside(assetRoot, assetPath)) {
        res.writeHead(403)
        res.end('forbidden')
        return
      }

      try {
        const stat = fs.statSync(assetPath)
        if (!stat.isFile()) {
          res.writeHead(404)
          res.end('asset not found')
          return
        }

        res.writeHead(200, {
          'Content-Type': contentTypeFor(assetPath),
          'Content-Length': stat.size,
          'Cache-Control': 'no-cache',
        })
        fs.createReadStream(assetPath).pipe(res)
      } catch {
        res.writeHead(404)
        res.end('asset not found')
      }
      return
    }

    // POST /admin/stop — 暂停意识循环（保留 HTTP 服务）
    if (req.method === 'POST' && url.pathname === '/admin/stop') {
      stopLoop()
      emitEvent('admin', { action: 'stop', running: false })
      jsonResponse(res, 200, { ok: true, running: false })
      return
    }

    // POST /admin/start — 恢复意识循环
    if (req.method === 'POST' && url.pathname === '/admin/start') {
      startLoop()
      emitEvent('admin', { action: 'start', running: true })
      jsonResponse(res, 200, { ok: true, running: true })
      return
    }

    // POST /admin/restart — 重启 Pulse 进程（spawn 新进程后退出）
    if (req.method === 'POST' && url.pathname === '/admin/restart') {
      jsonResponse(res, 200, { ok: true, message: '正在重启…' })
      setTimeout(() => {
        const child = spawn('npm', ['start'], {
          cwd: path.join(__dirname, '../'),
          detached: true,
          stdio: 'ignore',
          shell: true,
        })
        child.unref()
        process.exit(0)
      }, 500)
      return
    }

    // POST /admin/reset-memories — 清除所有记忆和对话
    if (req.method === 'POST' && url.pathname === '/admin/reset-memories') {
      const db = getDB()
      db.prepare('DELETE FROM memories').run()
      db.prepare('DELETE FROM conversations').run()
      db.prepare("DELETE FROM config WHERE key != 'birth_time'").run()
      db.prepare('DELETE FROM entities').run()
      db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')")
      emitEvent('admin', { action: 'reset-memories' })
      jsonResponse(res, 200, { ok: true })
      return
    }

    // POST /admin/reset-files — 清除 sandbox 用户文件（保留 readme.txt、world.txt）
    if (req.method === 'POST' && url.pathname === '/admin/reset-files') {
      const sandboxPath = SANDBOX_PATH
      const KEEP = new Set(['readme.txt', 'world.txt'])
      function clearDir(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            clearDir(full)
            try { fs.rmdirSync(full) } catch (_) {}
          } else if (!KEEP.has(entry.name.toLowerCase())) {
            fs.unlinkSync(full)
          }
        }
      }
      try { clearDir(sandboxPath) } catch (_) {}
      emitEvent('admin', { action: 'reset-files' })
      jsonResponse(res, 200, { ok: true })
      return
    }

    // GET /settings/voice — 读取语音配置（凭证只返回 configured 状态）
    if (req.method === 'GET' && url.pathname === '/settings/voice') {
      jsonResponse(res, 200, { ok: true, voice: getVoiceConfig() })
      return
    }

    // POST /settings/voice — 保存语音配置 { whisperModel?, aliyunApiKey?, ... }
    if (req.method === 'POST' && url.pathname === '/settings/voice') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
          setVoiceConfig(body)
          jsonResponse(res, 200, { ok: true, voice: getVoiceConfig() })
        } catch (err) {
          jsonResponse(res, 400, { ok: false, error: err.message })
        }
      })
      return
    }

    // GET /voice/local/status — 本地 Whisper 语音服务状态
    if (req.method === 'GET' && url.pathname === '/voice/local/status') {
      jsonResponse(res, 200, { ok: true, voice: getVoiceStatus() })
      return
    }

    // POST /voice/local/start — 启动本地 Whisper 语音服务
    if (req.method === 'POST' && url.pathname === '/voice/local/start') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
          const model = String(body.model || 'small').trim() || 'small'
          jsonResponse(res, 200, { ok: true, voice: startVoiceServer({ model }) })
        } catch (err) {
          jsonResponse(res, 400, { ok: false, error: err.message })
        }
      })
      return
    }

    // POST /voice/local/stop — 停止本地 Whisper 语音服务
    if (req.method === 'POST' && url.pathname === '/voice/local/stop') {
      jsonResponse(res, 200, { ok: true, voice: stopVoiceServer() })
      return
    }

    // POST /voice/local/restart — 重启本地 Whisper 语音服务
    if (req.method === 'POST' && url.pathname === '/voice/local/restart') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
          const model = String(body.model || 'small').trim() || 'small'
          jsonResponse(res, 200, { ok: true, voice: restartVoiceServer(model) })
        } catch (err) {
          jsonResponse(res, 400, { ok: false, error: err.message })
        }
      })
      return
    }

    // GET /capabilities/roadmap — 当前已落地 + 计划接入的本地能力扩展
    if (req.method === 'GET' && url.pathname === '/capabilities/roadmap') {
      jsonResponse(res, 200, getCapabilityRoadmap())
      return
    }

    // GET /settings/tts — 读取 TTS 配置状态（不返回明文密钥）
    if (req.method === 'GET' && url.pathname === '/settings/tts') {
      jsonResponse(res, 200, { ok: true, tts: getTTSConfig(), providers: TTS_PROVIDERS, voices: TTS_VOICES })
      return
    }

    // POST /settings/tts — 保存 TTS 配置
    if (req.method === 'POST' && url.pathname === '/settings/tts') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
          setTTSConfig(body)
          jsonResponse(res, 200, { ok: true, tts: getTTSConfig() })
        } catch (err) {
          jsonResponse(res, 400, { ok: false, error: err.message })
        }
      })
      return
    }

    // POST /tts/stream — 流式 TTS 合成，返回 audio/mpeg 流
    if (req.method === 'POST' && url.pathname === '/tts/stream') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
          const { text } = body
          if (!text?.trim()) { jsonResponse(res, 400, { ok: false, error: '缺少 text 参数' }); return }
          const creds = getTTSCredentials()
          const audioStream = await streamTTS({
            text: text.slice(0, 800),
            provider: creds.provider,
            voiceId:  body.voiceId || creds.voiceId || undefined,
            keys: {
              doubaoKey:     creds.doubaoKey,
              doubaoAppId:   creds.doubaoAppId,
              doubaoAccessKey: creds.doubaoAccessKey,
              doubaoResourceId: creds.doubaoResourceId,
              minimaxKey:    creds.minimaxKey,
              openaiKey:     creds.openaiKey,
              openaiBaseURL: creds.openaiBaseURL,
              elevenLabsKey: creds.elevenLabsKey,
              volcanoAppId:  creds.volcanoAppId,
              volcanoToken:  creds.volcanoToken,
            },
          })
          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
          })
          audioStream.pipe(res)
          audioStream.on('error', () => { try { res.end() } catch {} })
        } catch (err) {
          console.warn('[TTS] 流式合成失败:', err.message)
          if (!res.headersSent) jsonResponse(res, 500, { ok: false, error: err.message })
          else try { res.end() } catch {}
        }
      })
      return
    }

    jsonResponse(res, 404, { error: 'not found' })
  })

  // Cloud ASR ws 通道：前端 PCM → 后端代理 → 云端 ASR
  const xiaozhiWss = new WebSocketServer({ noServer: true })
  xiaozhiWss.on('connection', (ws, req) => handleXiaozhiWsConnection(ws, req, { port }))

  const cloudWss = new WebSocketServer({ noServer: true })
  cloudWss.on('connection', (ws) => {
    let session = null
    let configured = false

    ws.on('message', (raw) => {
      // 第一帧必须是 JSON config 帧
      if (!configured) {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.type !== 'config') return
          // 从 config.json 读取凭证原始值
          let rawCfg = {}
          try { rawCfg = JSON.parse(fs.readFileSync(paths.configFile, 'utf-8'))?.voice || {} } catch {}
          session = createCloudASRSession(
            { provider: msg.provider || 'aliyun', lang: msg.lang || 'zh', ...rawCfg },
            (text, isFinal) => {
              try { ws.send(JSON.stringify({ type: 'transcript', text, is_final: isFinal })) } catch {}
            },
            (errMsg) => {
              try { ws.send(JSON.stringify({ type: 'error', message: errMsg })) } catch {}
            },
            () => { try { ws.close() } catch {} }
          )
          configured = true
        } catch {}
        return
      }
      // 后续帧为 PCM 二进制
      if (raw instanceof Buffer) {
        session?.sendAudio(raw)
      } else {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.type === 'flush') session?.flush()
        } catch {}
      }
    })

    ws.on('close', () => { session?.close(); session = null })
    ws.on('error', () => { session?.close(); session = null })
  })

  // ACUI ws 通道：双向控制 + 感知
  const acuiWss = new WebSocketServer({ noServer: true })
  acuiWss.on('connection', (ws) => {
    addACUIClient(ws)
    try { ws.send(JSON.stringify({ v: 1, kind: 'acui:hello' })) } catch {}

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg?.kind === 'ui.signal') {
          const id = insertUISignal({
            type: msg.type,
            target: msg.target || null,
            payload: msg.payload || {},
            ts: msg.ts || Date.now(),
          })
          emitEvent('ui_signal', { id, type: msg.type, target: msg.target, payload: msg.payload })
          // card.mounted：检查 render_preview，CSS/HTML 泄漏时才通知 agent
          if (msg.type === 'card.mounted') {
            const preview = msg.payload?.render_preview || ''
            if (preview && /font-size|rgba\(|<span|<\/[a-z]|px;|z-index|text-shadow/.test(preview)) {
              pushMessage('SYSTEM',
                `[Render anomaly app=${msg.target || 'unknown'}]\nAfter mounting, the component text appears to contain unrendered HTML/CSS. Check the code immediately, then regenerate it with ui_hide + ui_show_inline:\n${preview.slice(0, 200)}`,
                'APP_SIGNAL')
            }
          }
          // card.dismissed：从服务端存活表移除
          if (msg.type === 'card.dismissed') {
            removeActiveUICard(msg.target)
          }
          // 只有用户主动交互（card.action）才推入 agent 队列
          // card.dismissed 等其他生命周期信号不触发 agent
          if (msg.type === 'card.action') {
            const appId = msg.target || 'ui'
            const action = msg.payload?.action || 'unknown'
            const payload = msg.payload?.payload || msg.payload || {}
            // app:saveState 是组件自动上报的状态快照，直接落盘，不触发 agent
            if (action === 'app:saveState') {
              persistAppState(appId, payload)
            } else {
              const signalContent = `[App信号 app=${appId} action=${action}]\n${JSON.stringify(payload, null, 2)}`
              pushMessage(`APP:${appId}`, signalContent, 'APP_SIGNAL')
            }
          }
        } else if (msg?.kind === 'pong') {
          // ignore
        }
      } catch (e) {
        // 拒绝非 JSON 帧
      }
    })

    ws.on('close', () => removeACUIClient(ws))
    ws.on('error', () => removeACUIClient(ws))
  })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    if (url.pathname === '/acui') {
      const origin = req.headers.origin
      if (origin && !isAllowedOrigin(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
        socket.destroy()
        return
      }
      if (!hasAllowedAccess(req, url)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
        socket.destroy()
        return
      }
      acuiWss.handleUpgrade(req, socket, head, (ws) => acuiWss.emit('connection', ws, req))
    } else if (url.pathname === '/voice/cloud') {
      cloudWss.handleUpgrade(req, socket, head, (ws) => cloudWss.emit('connection', ws, req))
    } else if (url.pathname === '/nimo/ws' || url.pathname === '/xiaozhi/ws') {
      if (!hasAllowedAccess(req, url)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
        socket.destroy()
        return
      }
      xiaozhiWss.handleUpgrade(req, socket, head, (ws) => xiaozhiWss.emit('connection', ws, req))
    } else {
      socket.destroy()
    }
  })

  // 心跳：每 30s 给所有 ACUI 客户端发 ping
  const acuiHeartbeat = setInterval(() => {
    for (const client of acuiWss.clients) {
      try { client.send(JSON.stringify({ v: 1, kind: 'ping' })) } catch {}
    }
  }, 30000)
  acuiHeartbeat.unref?.()

  server.listen(port, host, () => {
    console.log(`[API] 监听 http://${host}:${port}`)
    console.log(`[API]   POST /message  — 发消息给意识体`)
    console.log(`[API]   GET  /events   — SSE 实时流（接收意识体消息）`)
    console.log(`[API]   GET  /memories — 查询记忆`)
    console.log(`[API]   GET  /status   — 状态`)
    console.log(`[API]   WS   /acui     — ACUI 双向通道（控制 + 感知）`)
  })

  return server
}
