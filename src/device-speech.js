import crypto from 'crypto'

const DEFAULT_DEVICE_ID = 'nimo-esp32s3-001'
const LEASE_MS = 90 * 1000
const MAX_TEXT_LENGTH = 800
const MAX_QUEUE_SIZE = 20

const speechItems = []

let speechPregenHook = null

export function setSpeechPregenHook(fn) {
  speechPregenHook = typeof fn === 'function' ? fn : null
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeDeviceId(value = '') {
  const cleaned = String(value || '').trim().replace(/[^\w.-]/g, '').slice(0, 64)
  return cleaned || DEFAULT_DEVICE_ID
}

function normalizeText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH)
}

function publicItem(item, port) {
  return {
    id: item.id,
    text: item.text,
    source: item.source,
    createdAt: item.createdAt,
    audioPath: `/device/speech/audio?id=${encodeURIComponent(item.id)}`,
    ackPath: '/device/speech/ack',
    streamUrl: port ? `http://127.0.0.1:${port}/device/speech/audio?id=${encodeURIComponent(item.id)}` : undefined,
  }
}

function trimQueue() {
  const pending = speechItems.filter((item) => item.status !== 'done')
  speechItems.length = 0
  speechItems.push(...pending.slice(-MAX_QUEUE_SIZE))
}

export function enqueueDeviceSpeech({ text, source = 'voice_reply', deviceId = DEFAULT_DEVICE_ID } = {}) {
  const plain = normalizeText(text)
  if (!plain) return null
  const item = {
    id: `speech_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    deviceId: normalizeDeviceId(deviceId),
    text: plain,
    source: String(source || 'voice_reply').slice(0, 40),
    status: 'pending',
    createdAt: nowIso(),
    leasedBy: '',
    leaseUntil: 0,
    ackedAt: '',
  }
  speechItems.push(item)
  trimQueue()
  try { speechPregenHook?.(item) } catch {}
  return item
}

export function getNextDeviceSpeech({ deviceId = DEFAULT_DEVICE_ID, port = 52557 } = {}) {
  const id = normalizeDeviceId(deviceId)
  const now = Date.now()
  const item = speechItems.find((entry) => {
    if (entry.status === 'done') return false
    if (entry.deviceId !== id && entry.deviceId !== DEFAULT_DEVICE_ID) return false
    return entry.status === 'pending' || entry.leaseUntil <= now
  })
  if (!item) return null
  item.status = 'leased'
  item.leasedBy = id
  item.leaseUntil = now + LEASE_MS
  return publicItem(item, port)
}

export function getDeviceSpeechById(id = '') {
  const key = String(id || '').trim()
  if (!key) return null
  return speechItems.find((item) => item.id === key && item.status !== 'done') || null
}

export function ackDeviceSpeech({ id = '', deviceId = DEFAULT_DEVICE_ID } = {}) {
  const item = getDeviceSpeechById(id)
  if (!item) return null
  item.status = 'done'
  item.leasedBy = normalizeDeviceId(deviceId)
  item.ackedAt = nowIso()
  return item
}

export function getDeviceSpeechQueueStatus() {
  trimQueue()
  return {
    pending: speechItems.filter((item) => item.status === 'pending').length,
    leased: speechItems.filter((item) => item.status === 'leased' && item.leaseUntil > Date.now()).length,
    total: speechItems.length,
    latest: speechItems.slice(-5).map((item) => ({
      id: item.id,
      source: item.source,
      status: item.status,
      createdAt: item.createdAt,
      ackedAt: item.ackedAt,
      textPreview: item.text.slice(0, 60),
    })),
  }
}
