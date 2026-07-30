// Nimo Hub — standalone reminder + device API (protocol v2 compatible with desktop Nimo)
// Node >= 18, no external dependencies. Storage: JSON file.
import http from 'http'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HOST = process.env.NIMO_BIND_HOST || '127.0.0.1'
const PORT = Number(process.env.NIMO_PORT || 3721)
const API_KEY = String(process.env.NIMO_API_KEY || '').trim()
const PUBLIC_URL = String(process.env.NIMO_PUBLIC_URL || '').trim().replace(/\/$/, '')
const DATA_DIR = process.env.NIMO_DATA_DIR || path.join(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'hub.json')
const DEFAULT_AGENT_NAME = 'Nimo 提醒助手'

fs.mkdirSync(DATA_DIR, { recursive: true })

let state = { nextId: 1, reminders: [] }
try {
  state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  if (!Number.isFinite(state.nextId)) state.nextId = 1
  if (!Array.isArray(state.reminders)) state.reminders = []
} catch {}

let saveTimer = null
function save() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(state))
      fs.renameSync(DATA_FILE + '.tmp', DATA_FILE)
    } catch (e) { console.warn('[hub] save failed:', e.message) }
  }, 200)
}

const deviceRegistry = new Map()

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Nimo-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  res.end(JSON.stringify(body))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8').replace(/^\uFEFF/, '')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) { reject(err) }
    })
    req.on('error', reject)
  })
}

function getServerInfo() {
  return {
    name: DEFAULT_AGENT_NAME,
    host: HOST,
    port: PORT,
    lanEnabled: true,
    localUrl: `http://127.0.0.1:${PORT}`,
    lanAddresses: [],
    lanUrls: [],
    recommendedUrl: PUBLIC_URL || `http://127.0.0.1:${PORT}`,
    protocolVersion: 2,
    cloud: true,
  }
}

// ---- devices (in-memory registry, same shape as desktop) ----
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
    capabilities: Array.isArray(input.capabilities)
      ? input.capabilities.slice(0, 20).map((item) => String(item).slice(0, 40))
      : (existing.capabilities || []),
    remoteAddress: String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || existing.remoteAddress || '').split(',')[0].trim(),
    registeredAt: existing.registeredAt || now,
    lastSeenAt: now,
    online: true,
  }
  deviceRegistry.set(id, record)
  return record
}

function touchDevice(id, req = null) {
  if (!id) return null
  const key = normalizeDeviceId(id)
  const existing = deviceRegistry.get(key)
  if (!existing) return null
  const record = {
    ...existing,
    remoteAddress: String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || existing.remoteAddress || '').split(',')[0].trim(),
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

// ---- reminders ----
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
    recurrenceConfig: row.recurrence_config || null,
  }
}

function listActiveReminders(limit = 200) {
  return state.reminders
    .filter((r) => r.status === 'pending' || r.status === 'fired')
    .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))
    .slice(0, limit)
}

function listCompletedReminders({ date = null, limit = 100 } = {}) {
  return state.reminders
    .filter((r) => r.status === 'completed' && (!date || String(r.completed_at || '').slice(0, 10) === date))
    .sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')))
    .slice(0, limit)
}

function getReminderById(id) {
  return state.reminders.find((r) => r.id === Number(id)) || null
}

function createReminder({ userId, dueAt, task, systemMessage, source }) {
  const row = {
    id: state.nextId++,
    user_id: userId || 'ID:000001',
    task,
    system_message: systemMessage,
    due_at: dueAt,
    status: 'pending',
    created_at: new Date().toISOString(),
    fired_at: null,
    completed_at: null,
    cancelled_at: null,
    source: source || 'nimo-hub',
    snooze_count: 0,
    recurrence_type: null,
    recurrence_config: null,
  }
  state.reminders.push(row)
  save()
  return { lastInsertRowid: row.id }
}

function completeReminder(id) {
  const row = getReminderById(id)
  if (!row || row.status === 'completed') return { changes: 0 }
  row.status = 'completed'
  row.completed_at = new Date().toISOString()
  save()
  return { changes: 1 }
}

function snoozeReminder(id, nextDueAt) {
  const row = getReminderById(id)
  if (!row) return { changes: 0 }
  row.status = 'pending'
  row.due_at = nextDueAt
  row.fired_at = null
  row.snooze_count = Number(row.snooze_count || 0) + 1
  save()
  return { changes: 1 }
}

function cancelReminder(id) {
  const row = getReminderById(id)
  if (!row || row.status === 'cancelled') return { changes: 0 }
  row.status = 'cancelled'
  row.cancelled_at = new Date().toISOString()
  save()
  return { changes: 1 }
}

function parseIncomingDueAt(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const raw = String(value).trim()
  if (!raw) return null
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

// fire pending reminders when due
setInterval(() => {
  const now = Date.now()
  let changed = false
  for (const row of state.reminders) {
    if (row.status === 'pending' && new Date(row.due_at).getTime() <= now) {
      row.status = 'fired'
      row.fired_at = new Date().toISOString()
      changed = true
    }
  }
  if (changed) save()
}, 10 * 1000)

// ---- device screen status ----
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

function buildDeviceScreenStatus({ deviceId = '', req = null } = {}) {
  const device = deviceId ? (touchDevice(deviceId, req) || null) : null
  const activeRows = listActiveReminders(50)
  const picked = pickDeviceScreenReminder(activeRows)
  const reminder = picked.row ? normalizeReminderRow(picked.row) : null
  const clock = formatDeviceTime(new Date())
  const dueLabel = reminder ? formatDeviceDueLabel(reminder.dueAt) : ''
  const task = reminder ? toDeviceTaskLabel(reminder.task, 'Open Nimo') : ''
  const modeLabel = picked.mode === 'due' ? 'Due' : picked.mode === 'upcoming' ? 'Next' : picked.mode === 'pending' ? 'Later' : 'No active'
  return {
    ok: true,
    server: getServerInfo(),
    serverTime: new Date().toISOString(),
    device,
    reminder,
    screen: {
      state: 'Online',
      line1: 'Nimo Online',
      line2: `Time ${clock} | ${activeRows.length} active`,
      line3: reminder ? `${modeLabel} ${dueLabel}` : 'No active reminder',
      line4: reminder ? `#${reminder.id} ${task}` : 'Create one in Nimo',
      dueLabel,
      mode: picked.mode,
      pollIntervalSeconds: 10,
    },
  }
}

// ---- auth ----
function isAuthorized(req, url) {
  if (!API_KEY) return true
  const header = String(req.headers['x-nimo-key'] || '').trim()
  if (header && header === API_KEY) return true
  const auth = String(req.headers['authorization'] || '').trim()
  if (auth.toLowerCase().startsWith('bearer ') && auth.slice(7).trim() === API_KEY) return true
  const q = String(url.searchParams.get('key') || '').trim()
  if (q && q === API_KEY) return true
  return false
}

// ---- server ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Nimo-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    })
    res.end()
    return
  }

  if (url.pathname === '/api/health' || url.pathname === '/api/ping') {
    jsonResponse(res, 200, { ok: true, name: 'nimo-hub', at: new Date().toISOString() })
    return
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/app' || url.pathname === '/app/' || url.pathname === '/mobile.html')) {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'mobile.html'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
      res.end(html)
    } catch {
      jsonResponse(res, 404, { ok: false, error: 'app page not installed' })
    }
    return
  }

  if (!isAuthorized(req, url)) {
    jsonResponse(res, 401, { ok: false, error: 'unauthorized: missing or invalid API key' })
    return
  }

  try {
    // ---- device protocol ----
    if (req.method === 'POST' && url.pathname === '/device/register') {
      const body = await readJsonBody(req).catch(() => ({}))
      const device = normalizeDeviceRecord(body, req)
      jsonResponse(res, 200, { ok: true, device, server: getServerInfo() })
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/info') {
      jsonResponse(res, 200, {
        ok: true,
        server: getServerInfo(),
        devices: listDeviceRecords(),
        protocol: {
          register: 'POST /device/register',
          heartbeat: 'POST /device/heartbeat',
          config: 'GET /device/config?deviceId=...',
          status: 'GET /device/status',
          screenStatus: 'GET /device/screen-status?deviceId=...',
          nextReminder: 'GET /device/next-reminder?deviceId=...',
          complete: 'POST /device/complete',
          snooze: 'POST /device/snooze',
          testPush: 'POST /device/test-push',
        },
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/status') {
      const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('id')
      if (deviceId) touchDevice(deviceId, req)
      jsonResponse(res, 200, { ok: true, server: getServerInfo(), devices: listDeviceRecords() })
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/screen-status') {
      const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('id')
      jsonResponse(res, 200, buildDeviceScreenStatus({ deviceId, req }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/heartbeat') {
      const body = await readJsonBody(req).catch(() => ({}))
      const deviceId = body.deviceId || body.id || body.device_id
      if (!deviceId) return jsonResponse(res, 400, { ok: false, error: 'deviceId required' })
      const device = touchDevice(deviceId, req) || normalizeDeviceRecord(body, req)
      jsonResponse(res, 200, { ok: true, device, serverTime: new Date().toISOString() })
      return
    }

    if (req.method === 'GET' && url.pathname === '/device/config') {
      const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('id')
      if (deviceId) touchDevice(deviceId, req)
      jsonResponse(res, 200, {
        ok: true,
        server: getServerInfo(),
        config: {
          pollIntervalSeconds: 15,
          heartbeatSeconds: 30,
          timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
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
      const body = await readJsonBody(req).catch(() => ({}))
      if (body.deviceId || body.id) touchDevice(body.deviceId || body.id, req)
      const reminderId = Number(body.reminderId || body.reminder_id)
      if (!reminderId) return jsonResponse(res, 400, { ok: false, error: 'reminderId required' })
      const r = completeReminder(reminderId)
      const reminder = getReminderById(reminderId)
      jsonResponse(res, 200, { ok: true, changes: r?.changes || 0, reminder: reminder ? normalizeReminderRow(reminder) : null })
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/snooze') {
      const body = await readJsonBody(req).catch(() => ({}))
      if (body.deviceId || body.id) touchDevice(body.deviceId || body.id, req)
      const reminderId = Number(body.reminderId || body.reminder_id)
      if (!reminderId) return jsonResponse(res, 400, { ok: false, error: 'reminderId required' })
      const minutes = Math.max(1, Math.min(24 * 60, Number(body.minutes || 10)))
      const next = new Date(Date.now() + minutes * 60 * 1000).toISOString()
      const r = snoozeReminder(reminderId, next)
      const reminder = getReminderById(reminderId)
      jsonResponse(res, 200, { ok: true, changes: r?.changes || 0, dueAt: next, minutes, reminder: reminder ? normalizeReminderRow(reminder) : null })
      return
    }

    if (req.method === 'POST' && url.pathname === '/device/test-push') {
      const body = await readJsonBody(req).catch(() => ({}))
      const deviceId = body.deviceId || body.id || body.device_id || null
      if (deviceId) touchDevice(deviceId, req)
      const payload = {
        deviceId,
        title: body.title || 'Nimo 测试提醒',
        task: body.task || '云端推送链路已连通。',
        dueAt: new Date().toISOString(),
      }
      jsonResponse(res, 200, { ok: true, pushed: true, payload })
      return
    }

    // ---- reminders ----
    if (req.method === 'GET' && url.pathname === '/reminders') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500)
      const items = listActiveReminders(limit).map((row) => normalizeReminderRow(row))
      jsonResponse(res, 200, { ok: true, reminders: items })
      return
    }

    if (req.method === 'GET' && url.pathname === '/reminders/completed') {
      const date = url.searchParams.get('date') || null
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)
      const reminders = listCompletedReminders({ date, limit }).map((row) => normalizeReminderRow(row))
      jsonResponse(res, 200, { ok: true, date, reminders })
      return
    }

    if (req.method === 'POST' && url.pathname === '/reminders') {
      const body = await readJsonBody(req)
      const task = String(body.task || '').trim()
      if (!task) return jsonResponse(res, 400, { ok: false, error: 'task required' })
      const dueAt = parseIncomingDueAt(body.dueAt)
      if (!dueAt) return jsonResponse(res, 400, { ok: false, error: 'dueAt invalid' })
      const systemMessage = String(body.systemMessage || '').trim() || `到时间了，提醒你：${task}`
      const source = String(body.source || 'nimo-mobile').slice(0, 120)
      const r = createReminder({ userId: 'ID:000001', dueAt, task, systemMessage, source })
      const id = r?.lastInsertRowid
      const row = id ? getReminderById(id) : null
      jsonResponse(res, 200, { ok: true, id, reminder: row ? normalizeReminderRow(row) : null })
      return
    }

    let m = url.pathname.match(/^\/reminders\/(\d+)\/complete$/)
    if (req.method === 'POST' && m) {
      const id = Number(m[1])
      const r = completeReminder(id)
      const reminder = getReminderById(id)
      jsonResponse(res, 200, { ok: true, changes: r?.changes || 0, reminder: reminder ? normalizeReminderRow(reminder) : null })
      return
    }

    m = url.pathname.match(/^\/reminders\/(\d+)\/snooze$/)
    if (req.method === 'POST' && m) {
      const id = Number(m[1])
      const body = await readJsonBody(req).catch(() => ({}))
      const minutes = Math.max(1, Math.min(24 * 60, Number(body.minutes || 10)))
      const next = new Date(Date.now() + minutes * 60 * 1000).toISOString()
      const r = snoozeReminder(id, next)
      const reminder = getReminderById(id)
      jsonResponse(res, 200, { ok: true, changes: r?.changes || 0, dueAt: next, minutes, reminder: reminder ? normalizeReminderRow(reminder) : null })
      return
    }

    m = url.pathname.match(/^\/reminders\/(\d+)\/cancel$/)
    if (req.method === 'POST' && m) {
      const id = Number(m[1])
      const r = cancelReminder(id)
      jsonResponse(res, 200, { ok: true, changes: r?.changes || 0 })
      return
    }

    jsonResponse(res, 404, { ok: false, error: `not found: ${req.method} ${url.pathname}` })
  } catch (err) {
    jsonResponse(res, 500, { ok: false, error: err.message })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[nimo-hub] listening on http://${HOST}:${PORT} (auth: ${API_KEY ? 'API key required' : 'OPEN — set NIMO_API_KEY!'})`)
})
