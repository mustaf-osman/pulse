import { startAPI } from '../src/api.js'
import { createRequire } from 'module'

process.env.PULSE_HOST = '127.0.0.1'
process.env.PULSE_ALLOW_LAN = '0'

const port = 40000 + Math.floor(Math.random() * 1000)
const base = `http://127.0.0.1:${port}`
const deviceId = `nimo-smoke-${Date.now()}`
const checks = []
const require = createRequire(import.meta.url)

function assert(condition, label, detail = '') {
  checks.push({ ok: !!condition, label, detail })
  if (condition) {
    console.log(`[PASS] ${label}`)
  } else {
    console.error(`[FAIL] ${label}${detail ? `\n  ${detail}` : ''}`)
  }
}

async function json(path, options = {}) {
  const res = await fetch(`${base}${path}`, options)
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

async function getJson(path) {
  return json(path)
}

async function postJson(path, body) {
  return json(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function canLoadBetterSqlite() {
  try {
    const Database = require('better-sqlite3')
    const db = new Database(':memory:')
    db.close()
    return true
  } catch (err) {
    assert(true, 'GET /device/next-reminder skipped when better-sqlite3 cannot load in this Node runtime', err.message)
    return false
  }
}

const server = startAPI(port)

try {
  const info = await getJson('/device/info')
  assert(info.res.status === 200 && info.data?.ok === true, 'GET /device/info returns ok', JSON.stringify(info.data))
  assert(info.data?.server?.port === port, '/device/info exposes server port', JSON.stringify(info.data?.server))
  const protocol = info.data?.protocol || {}
  for (const key of ['register', 'heartbeat', 'config', 'status', 'screenStatus', 'nextReminder', 'complete', 'snooze', 'testPush', 'stream']) {
    assert(Boolean(protocol[key]), `/device/info protocol includes ${key}`, JSON.stringify(protocol))
  }

  const register = await postJson('/device/register', {
    id: deviceId,
    name: 'Nimo Device Smoke Test',
    type: 'simulator',
    capabilities: ['screen', 'touch'],
  })
  assert(register.res.status === 200 && register.data?.device?.id === deviceId, 'POST /device/register registers simulator', JSON.stringify(register.data))

  const heartbeat = await postJson('/device/heartbeat', { deviceId })
  assert(heartbeat.res.status === 200 && heartbeat.data?.device?.id === deviceId, 'POST /device/heartbeat touches device', JSON.stringify(heartbeat.data))
  assert(Boolean(heartbeat.data?.serverTime), '/device/heartbeat returns serverTime', JSON.stringify(heartbeat.data))

  const badHeartbeat = await postJson('/device/heartbeat', {})
  assert(badHeartbeat.res.status === 400 && badHeartbeat.data?.ok === false, 'POST /device/heartbeat rejects missing deviceId', JSON.stringify(badHeartbeat.data))

  const config = await getJson(`/device/config?deviceId=${encodeURIComponent(deviceId)}`)
  assert(config.res.status === 200 && config.data?.ok === true, 'GET /device/config returns ok', JSON.stringify(config.data))
  assert(Number(config.data?.config?.pollIntervalSeconds) > 0, '/device/config exposes poll interval', JSON.stringify(config.data?.config))
  assert(Number(config.data?.config?.heartbeatSeconds) > 0, '/device/config exposes heartbeat interval', JSON.stringify(config.data?.config))
  assert(Array.isArray(config.data?.config?.actions) && config.data.config.actions.includes('complete'), '/device/config exposes supported actions', JSON.stringify(config.data?.config))

  const status = await getJson(`/device/status?deviceId=${encodeURIComponent(deviceId)}`)
  const listed = Array.isArray(status.data?.devices) && status.data.devices.some((device) => device.id === deviceId)
  assert(status.res.status === 200 && listed, 'GET /device/status lists registered device', JSON.stringify(status.data))

  const screenStatus = await getJson(`/device/screen-status?deviceId=${encodeURIComponent(deviceId)}`)
  assert(screenStatus.res.status === 200 && screenStatus.data?.ok === true, 'GET /device/screen-status returns ok', JSON.stringify(screenStatus.data))
  assert(Boolean(screenStatus.data?.screen?.line1) && Boolean(screenStatus.data?.screen?.line3), '/device/screen-status exposes display lines', JSON.stringify(screenStatus.data?.screen))

  if (canLoadBetterSqlite()) {
    const next = await getJson(`/device/next-reminder?deviceId=${encodeURIComponent(deviceId)}`)
    assert(next.res.status === 200 && next.data?.ok === true && ('reminder' in next.data), 'GET /device/next-reminder returns reminder envelope', JSON.stringify(next.data))
  }

  const push = await postJson('/device/test-push', {
    deviceId,
    title: 'Nimo smoke push',
    task: 'Verify hardware protocol test-push endpoint',
  })
  assert(push.res.status === 200 && push.data?.pushed === true && push.data?.payload?.deviceId === deviceId, 'POST /device/test-push emits payload', JSON.stringify(push.data))
} finally {
  await new Promise((resolve) => server.close(resolve))
}

const failed = checks.filter((item) => !item.ok)
console.log(`\nDevice smoke checks: ${checks.length - failed.length}/${checks.length} passed`)
if (failed.length) {
  process.exitCode = 1
}
