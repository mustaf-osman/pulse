import { getDB, getConfig, setConfig } from '../db.js'
import { emitEvent } from '../events.js'
import { COLLECTION_STATUS_PROCESS_PREFIX, getForegroundWindowInfo, getSystemIdleSeconds } from './window-sampler.js'
import { analyzeCurrentScreen, heuristicScreenAnalysis } from './screen-analyzer.js'

const CONFIG_KEYS = {
  trackingEnabled: 'activity_tracking_enabled',
  aiScreenEnabled: 'activity_ai_screen_enabled',
  sampleIntervalMs: 'activity_sample_interval_ms',
  aiIntervalMs: 'activity_ai_interval_ms',
  idleThresholdSeconds: 'activity_idle_threshold_seconds',
  employeeId: 'activity_employee_id',
}

const DEFAULT_CONFIG = {
  trackingEnabled: false,
  aiScreenEnabled: false,
  sampleIntervalMs: 5000,
  aiIntervalMs: 120000,
  idleThresholdSeconds: 300,
  employeeId: 'local',
}

let timer = null
let aiTimer = null
let currentEvent = null
let lastSample = null
let lastAnalysis = null
let sampling = false
let analyzing = false

function toBool(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback
  return /^(1|true|yes|on)$/i.test(String(value).trim())
}

function toInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function nowIso() {
  return new Date().toISOString()
}

export function getActivityTrackerConfig() {
  return {
    trackingEnabled: toBool(getConfig(CONFIG_KEYS.trackingEnabled), DEFAULT_CONFIG.trackingEnabled),
    aiScreenEnabled: toBool(getConfig(CONFIG_KEYS.aiScreenEnabled), DEFAULT_CONFIG.aiScreenEnabled),
    sampleIntervalMs: toInt(getConfig(CONFIG_KEYS.sampleIntervalMs), DEFAULT_CONFIG.sampleIntervalMs, 1000, 60000),
    aiIntervalMs: toInt(getConfig(CONFIG_KEYS.aiIntervalMs), DEFAULT_CONFIG.aiIntervalMs, 30000, 1800000),
    idleThresholdSeconds: toInt(getConfig(CONFIG_KEYS.idleThresholdSeconds), DEFAULT_CONFIG.idleThresholdSeconds, 60, 3600),
    employeeId: String(getConfig(CONFIG_KEYS.employeeId) || DEFAULT_CONFIG.employeeId).trim() || DEFAULT_CONFIG.employeeId,
  }
}

export function setActivityTrackerConfig(updates = {}) {
  const current = getActivityTrackerConfig()
  const next = {
    ...current,
    ...updates,
  }
  next.trackingEnabled = Boolean(next.trackingEnabled)
  next.aiScreenEnabled = Boolean(next.aiScreenEnabled)
  next.sampleIntervalMs = toInt(next.sampleIntervalMs, DEFAULT_CONFIG.sampleIntervalMs, 1000, 60000)
  next.aiIntervalMs = toInt(next.aiIntervalMs, DEFAULT_CONFIG.aiIntervalMs, 30000, 1800000)
  next.idleThresholdSeconds = toInt(next.idleThresholdSeconds, DEFAULT_CONFIG.idleThresholdSeconds, 60, 3600)
  next.employeeId = String(next.employeeId || DEFAULT_CONFIG.employeeId).trim() || DEFAULT_CONFIG.employeeId

  setConfig(CONFIG_KEYS.trackingEnabled, next.trackingEnabled ? '1' : '0')
  setConfig(CONFIG_KEYS.aiScreenEnabled, next.aiScreenEnabled ? '1' : '0')
  setConfig(CONFIG_KEYS.sampleIntervalMs, String(next.sampleIntervalMs))
  setConfig(CONFIG_KEYS.aiIntervalMs, String(next.aiIntervalMs))
  setConfig(CONFIG_KEYS.idleThresholdSeconds, String(next.idleThresholdSeconds))
  setConfig(CONFIG_KEYS.employeeId, next.employeeId)

  if (next.trackingEnabled) startActivityTracker()
  else stopActivityTracker()

  return getActivityTrackerStatus()
}

function eventKey(sample) {
  if (isCollectionStatus(sample)) return [sample.processName, sample.collectionReason || '', sample.idle ? 'idle' : 'active'].join('\u0001')
  return [sample.appName, sample.processName, sample.windowTitle, sample.idle ? 'idle' : 'active'].join('\u0001')
}

function buildIdleSample(idleSeconds, threshold) {
  return {
    ok: true,
    platform: process.platform,
    appName: '空闲',
    processName: `${COLLECTION_STATUS_PROCESS_PREFIX}user_idle`,
    windowTitle: `鼠标键盘超过 ${threshold} 秒无操作`,
    processId: 0,
    idle: true,
    idleSeconds,
    capturedAt: nowIso(),
    isCollectionStatus: true,
    collectionReason: 'user_idle',
    collectionReasonLabel: '空闲',
    collectionReasonDetail: `鼠标键盘超过 ${threshold} 秒无操作`,
  }
}

function isCollectionStatus(sample = {}) {
  return Boolean(sample.isCollectionStatus) || String(sample.processName || '').startsWith(COLLECTION_STATUS_PROCESS_PREFIX)
}

function currentEventFromSample(sample, cfg, capturedAt) {
  return {
    employeeId: cfg.employeeId,
    appName: sample.appName || '未知软件',
    processName: sample.processName || '',
    windowTitle: sample.windowTitle || '',
    startedAt: capturedAt,
    lastSeenAt: capturedAt,
    idle: Boolean(sample.idle || isCollectionStatus(sample)),
    aiWorkRelated: null,
    isCollectionStatus: isCollectionStatus(sample),
    collectionReason: sample.collectionReason || '',
  }
}

function attachAnalysisToCurrent(analysis) {
  if (!currentEvent || !analysis) return
  currentEvent.aiWorkRelated = typeof analysis.workRelated === 'boolean' ? analysis.workRelated : null
  currentEvent.aiActivityType = analysis.activityType || ''
  currentEvent.aiConfidence = Number.isFinite(Number(analysis.confidence)) ? Number(analysis.confidence) : null
  currentEvent.aiRiskLevel = analysis.riskLevel || ''
  currentEvent.aiSummary = analysis.summary || ''
}

function insertActivityEvent(event) {
  if (!event?.startedAt || !event?.endedAt) return null
  const durationSeconds = Math.max(1, Math.floor((new Date(event.endedAt).getTime() - new Date(event.startedAt).getTime()) / 1000))
  const db = getDB()
  return db.prepare(`
    INSERT INTO activity_events (
      employee_id, source, app_name, process_name, window_title, browser, domain, url,
      started_at, ended_at, duration_seconds, idle,
      ai_work_related, ai_activity_type, ai_confidence, ai_risk_level, ai_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.employeeId || 'local',
    'foreground',
    event.appName || '未知软件',
    event.processName || '',
    event.windowTitle || '',
    event.browser || '',
    event.domain || '',
    event.url || '',
    event.startedAt,
    event.endedAt,
    durationSeconds,
    event.idle ? 1 : 0,
    event.aiWorkRelated === null || event.aiWorkRelated === undefined ? null : (event.aiWorkRelated ? 1 : 0),
    event.aiActivityType || '',
    event.aiConfidence === null || event.aiConfidence === undefined ? null : Number(event.aiConfidence),
    event.aiRiskLevel || '',
    event.aiSummary || '',
  ).lastInsertRowid
}

function insertScreenAnalysis(foreground, analysis, employeeId) {
  const db = getDB()
  return db.prepare(`
    INSERT INTO activity_screen_analysis (
      employee_id, captured_at, app_name, process_name, window_title,
      work_related, activity_type, confidence, risk_level, summary,
      sensitive_detected, model, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    employeeId || 'local',
    nowIso(),
    foreground?.appName || '',
    foreground?.processName || '',
    foreground?.windowTitle || '',
    analysis?.workRelated === null || analysis?.workRelated === undefined ? null : (analysis.workRelated ? 1 : 0),
    analysis?.activityType || '',
    analysis?.confidence === null || analysis?.confidence === undefined ? null : Number(analysis.confidence),
    analysis?.riskLevel || '',
    analysis?.summary || '',
    analysis?.sensitiveDetected ? 1 : 0,
    analysis?.model || analysis?.provider || '',
    JSON.stringify(analysis?.raw || {}),
  ).lastInsertRowid
}

function finalizeCurrentEvent(endedAt = nowIso()) {
  if (!currentEvent) return null
  const event = { ...currentEvent, endedAt }
  currentEvent = null
  if (new Date(event.endedAt).getTime() <= new Date(event.startedAt).getTime()) return null
  const id = insertActivityEvent(event)
  emitEvent('activity_event_saved', { id, appName: event.appName, durationSeconds: Math.max(1, Math.floor((new Date(event.endedAt).getTime() - new Date(event.startedAt).getTime()) / 1000)) })
  return id
}

export async function runActivitySample() {
  if (sampling) return lastSample
  sampling = true
  try {
    const cfg = getActivityTrackerConfig()
    const capturedAt = nowIso()
    const idleSeconds = await getSystemIdleSeconds()
    const foreground = idleSeconds >= cfg.idleThresholdSeconds
      ? buildIdleSample(idleSeconds, cfg.idleThresholdSeconds)
      : { ...(await getForegroundWindowInfo()), idle: false, idleSeconds }
    const sample = {
      ...foreground,
      employeeId: cfg.employeeId,
      capturedAt,
    }
    lastSample = sample

    if (!currentEvent) {
      currentEvent = currentEventFromSample(sample, cfg, capturedAt)
    } else if (eventKey(currentEvent) !== eventKey(sample)) {
      finalizeCurrentEvent(capturedAt)
      currentEvent = currentEventFromSample(sample, cfg, capturedAt)
    } else {
      currentEvent.lastSeenAt = capturedAt
    }

    emitEvent('activity_sample', {
      appName: sample.appName,
      processName: sample.processName,
      windowTitle: sample.windowTitle,
      idle: Boolean(sample.idle),
      idleSeconds,
      isCollectionStatus: isCollectionStatus(sample),
      collectionReason: sample.collectionReason || '',
      collectionReasonLabel: sample.collectionReasonLabel || '',
      tracking: Boolean(timer),
    })
    return sample
  } finally {
    sampling = false
  }
}

export async function runScreenAnalysisSample({ force = false } = {}) {
  if (analyzing) return lastAnalysis
  const cfg = getActivityTrackerConfig()
  if (!force && !cfg.aiScreenEnabled) return lastAnalysis
  analyzing = true
  try {
    const foreground = lastSample || await runActivitySample()
    if (isCollectionStatus(foreground)) {
      const analysis = {
        provider: 'collection-status',
        model: 'local-status',
        workRelated: false,
        activityType: foreground.collectionReasonLabel || '采集状态',
        confidence: 1,
        riskLevel: foreground.collectionReason === 'timeout' || foreground.collectionReason === 'permission_denied' ? 'medium' : 'low',
        summary: foreground.collectionReasonDetail || foreground.windowTitle || '当前不是可采集的软件窗口',
        sensitiveDetected: false,
        raw: { reason: foreground.collectionReason || 'collection_status' },
      }
      lastAnalysis = {
        ...analysis,
        capturedAt: nowIso(),
        foreground,
      }
      attachAnalysisToCurrent(analysis)
      const id = insertScreenAnalysis(foreground, analysis, cfg.employeeId)
      emitEvent('activity_screen_analysis', {
        id,
        appName: foreground?.appName || '',
        activityType: analysis.activityType,
        workRelated: analysis.workRelated,
        riskLevel: analysis.riskLevel,
        confidence: analysis.confidence,
        summary: analysis.summary,
      })
      return lastAnalysis
    }
    const analysis = cfg.aiScreenEnabled
      ? await analyzeCurrentScreen({ foreground })
      : heuristicScreenAnalysis(foreground)
    lastAnalysis = {
      ...analysis,
      capturedAt: nowIso(),
      foreground,
    }
    attachAnalysisToCurrent(analysis)
    const id = insertScreenAnalysis(foreground, analysis, cfg.employeeId)
    emitEvent('activity_screen_analysis', {
      id,
      appName: foreground?.appName || '',
      activityType: analysis.activityType,
      workRelated: analysis.workRelated,
      riskLevel: analysis.riskLevel,
      confidence: analysis.confidence,
      summary: analysis.summary,
    })
    return lastAnalysis
  } finally {
    analyzing = false
  }
}

function clearTimers() {
  if (timer) clearInterval(timer)
  if (aiTimer) clearInterval(aiTimer)
  timer = null
  aiTimer = null
}

export function startActivityTracker() {
  const cfg = getActivityTrackerConfig()
  if (timer) return getActivityTrackerStatus()
  setConfig(CONFIG_KEYS.trackingEnabled, '1')
  runActivitySample().catch((err) => emitEvent('activity_error', { stage: 'sample', error: err?.message || String(err) }))
  timer = setInterval(() => {
    runActivitySample().catch((err) => emitEvent('activity_error', { stage: 'sample', error: err?.message || String(err) }))
  }, cfg.sampleIntervalMs)
  timer.unref?.()
  if (cfg.aiScreenEnabled) {
    runScreenAnalysisSample().catch((err) => emitEvent('activity_error', { stage: 'screen_analysis', error: err?.message || String(err) }))
    aiTimer = setInterval(() => {
      runScreenAnalysisSample().catch((err) => emitEvent('activity_error', { stage: 'screen_analysis', error: err?.message || String(err) }))
    }, cfg.aiIntervalMs)
    aiTimer.unref?.()
  }
  emitEvent('activity_tracking_started', { config: safeConfigForClient(getActivityTrackerConfig()) })
  return getActivityTrackerStatus()
}

export function stopActivityTracker() {
  clearTimers()
  finalizeCurrentEvent(nowIso())
  setConfig(CONFIG_KEYS.trackingEnabled, '0')
  emitEvent('activity_tracking_stopped', {})
  return getActivityTrackerStatus()
}

export function ensureActivityTrackerFromConfig() {
  const cfg = getActivityTrackerConfig()
  if (cfg.trackingEnabled) startActivityTracker()
  return getActivityTrackerStatus()
}

function safeConfigForClient(cfg) {
  return {
    trackingEnabled: Boolean(cfg.trackingEnabled),
    aiScreenEnabled: Boolean(cfg.aiScreenEnabled),
    sampleIntervalMs: cfg.sampleIntervalMs,
    aiIntervalMs: cfg.aiIntervalMs,
    idleThresholdSeconds: cfg.idleThresholdSeconds,
    employeeId: cfg.employeeId,
  }
}

export function getActivityTrackerStatus() {
  const cfg = getActivityTrackerConfig()
  return {
    ok: true,
    running: Boolean(timer),
    aiRunning: Boolean(aiTimer),
    config: safeConfigForClient(cfg),
    current: currentEvent ? {
      appName: currentEvent.appName,
      processName: currentEvent.processName,
      windowTitle: currentEvent.windowTitle,
      startedAt: currentEvent.startedAt,
      idle: Boolean(currentEvent.idle),
      aiWorkRelated: currentEvent.aiWorkRelated,
      aiActivityType: currentEvent.aiActivityType || '',
      aiRiskLevel: currentEvent.aiRiskLevel || '',
      aiSummary: currentEvent.aiSummary || '',
    } : null,
    lastSample,
    lastAnalysis: lastAnalysis ? {
      capturedAt: lastAnalysis.capturedAt,
      activityType: lastAnalysis.activityType,
      workRelated: lastAnalysis.workRelated,
      confidence: lastAnalysis.confidence,
      riskLevel: lastAnalysis.riskLevel,
      summary: lastAnalysis.summary,
      provider: lastAnalysis.provider,
      model: lastAnalysis.model,
    } : null,
  }
}
