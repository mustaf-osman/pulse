import { getDB } from '../db.js'
import { COLLECTION_STATUS_PROCESS_PREFIX, getCollectionStatusLabel } from './window-sampler.js'

function pad(n) {
  return String(n).padStart(2, '0')
}

export function todayDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function dateRangeForLocalDay(dateText = todayDateString()) {
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(String(dateText || '')) ? String(dateText) : todayDateString()
  const startDate = new Date(`${safe}T00:00:00`)
  const endDate = new Date(startDate.getTime() + 24 * 3600 * 1000)
  return { date: safe, start: startDate.toISOString(), end: endDate.toISOString() }
}

function secondsToText(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}小时${m}分钟`
  if (m > 0) return `${m}分钟`
  return `${total}秒`
}

function normalizeRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    seconds: Number(row.seconds || row.duration_seconds || 0),
    durationText: secondsToText(row.seconds || row.duration_seconds || 0),
  }))
}

function isCollectionStatusRow(row = {}) {
  const processName = String(row.processName || row.process_name || '').toLowerCase()
  const appName = String(row.appName || row.app_name || '').trim()
  return processName.startsWith(COLLECTION_STATUS_PROCESS_PREFIX)
    || processName === 'collector-error'
    || processName === 'idle'
    || processName === 'idle.exe'
    || appName === '采集失败'
    || appName === '空闲'
    || appName === 'Idle'
}

function collectionReasonFromRow(row = {}) {
  const processName = String(row.processName || row.process_name || '')
  const lower = processName.toLowerCase()
  const appName = String(row.appName || row.app_name || '').trim()
  if (lower.startsWith(COLLECTION_STATUS_PROCESS_PREFIX)) return processName.slice(COLLECTION_STATUS_PROCESS_PREFIX.length) || 'collector_error'
  if (lower === 'collector-error' || appName === '采集失败') {
    const title = String(row.windowTitle || row.window_title || '')
    if (/timed?\s*out|timeout|ETIMEDOUT/i.test(title)) return 'timeout'
    if (/access is denied|ACCESS_DENIED|权限/i.test(title)) return 'permission_denied'
    if (/lock|screen|熄屏|锁屏/i.test(title)) return 'screen_locked'
    return 'collector_error'
  }
  if (lower === 'idle.exe' || appName === 'Idle') return 'system_idle'
  if (lower === 'idle' || appName === '空闲') return 'user_idle'
  return 'collector_error'
}

function withCollectionStatus(row = {}) {
  const isStatus = isCollectionStatusRow(row)
  const reason = isStatus ? collectionReasonFromRow(row) : ''
  const label = isStatus ? getCollectionStatusLabel(reason) : null
  return {
    ...row,
    isCollectionStatus: isStatus,
    collectionReason: reason,
    collectionReasonLabel: label?.name || '',
    collectionReasonDetail: label?.detail || '',
  }
}

const COLLECTION_STATUS_WHERE = `(
  instr(lower(process_name), '${COLLECTION_STATUS_PROCESS_PREFIX}') = 1
  OR lower(process_name) IN ('collector-error', 'idle', 'idle.exe')
  OR app_name IN ('采集失败', '空闲', 'Idle')
  OR idle = 1
)`

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))))
}

function scoreGrade(score) {
  if (score >= 90) return { grade: 'A', level: 'excellent', label: '高效稳定' }
  if (score >= 75) return { grade: 'B', level: 'good', label: '状态良好' }
  if (score >= 60) return { grade: 'C', level: 'watch', label: '需要关注' }
  return { grade: 'D', level: 'risk', label: '风险偏高' }
}

function buildActivityIntelligence({ totalSeconds, workSeconds, idleSeconds, nonIdleStatusSeconds, appTotalSeconds, apps, aiRows, collectionStatus, eventCount }) {
  const alerts = []
  const aiTotal = aiRows.reduce((sum, row) => sum + Number(row.count || 0), 0)
  const aiWork = aiRows.filter((row) => row.workRelated === 1).reduce((sum, row) => sum + Number(row.count || 0), 0)
  const aiNonWork = aiRows.filter((row) => row.workRelated === 0).reduce((sum, row) => sum + Number(row.count || 0), 0)
  const aiHighRisk = aiRows.filter((row) => row.riskLevel === 'high').reduce((sum, row) => sum + Number(row.count || 0), 0)
  const switches = apps.reduce((sum, row) => sum + Number(row.switches || 0), 0)
  const workRatio = totalSeconds > 0 ? workSeconds / totalSeconds : 0
  const idleRatio = totalSeconds > 0 ? idleSeconds / totalSeconds : 0
  const statusRatio = totalSeconds > 0 ? nonIdleStatusSeconds / totalSeconds : 0
  const aiNonWorkRatio = aiTotal > 0 ? aiNonWork / aiTotal : 0
  const aiHighRiskRatio = aiTotal > 0 ? aiHighRisk / aiTotal : 0
  const switchPressure = appTotalSeconds > 0 ? switches / Math.max(1, appTotalSeconds / 3600) : 0
  const topApp = apps[0] || null
  const topAppRatio = appTotalSeconds > 0 && topApp ? Number(topApp.seconds || 0) / appTotalSeconds : 0

  if (eventCount <= 0) {
    alerts.push({
      level: 'info',
      title: '今天还没有监督数据',
      detail: '开启软件时长统计后，系统会自动生成工作状态评分和老板日报。',
      action: '先打开「软件时长统计」，等待几分钟后刷新。',
    })
  }
  if (idleRatio >= 0.35 && idleSeconds >= 30 * 60) {
    alerts.push({
      level: 'high',
      title: '空闲时长偏高',
      detail: `今天空闲 ${secondsToText(idleSeconds)}，占在线时长 ${Math.round(idleRatio * 100)}%。`,
      action: '建议确认是否外出、开会或忘记锁屏，必要时补充说明。',
    })
  } else if (idleRatio >= 0.2 && idleSeconds >= 15 * 60) {
    alerts.push({
      level: 'medium',
      title: '存在较长空闲',
      detail: `今天空闲 ${secondsToText(idleSeconds)}，需要留意连续离开电脑的情况。`,
      action: '建议员工自查是否有会议、线下沟通等未被软件记录的工作。',
    })
  }
  if (aiHighRisk > 0) {
    alerts.push({
      level: 'high',
      title: 'AI 识别到高风险场景',
      detail: `今天出现 ${aiHighRisk} 次高风险分类结果，仅保存结构化结论。`,
      action: '建议老板只看趋势和类型，不直接用单次结果做处罚依据。',
    })
  }
  if (aiNonWorkRatio >= 0.3 && aiNonWork >= 3) {
    alerts.push({
      level: 'medium',
      title: '非工作类场景占比较高',
      detail: `AI 分类里非工作结果约 ${Math.round(aiNonWorkRatio * 100)}%。`,
      action: '建议结合岗位规则和当天任务判断，不单看软件名称。',
    })
  }
  if (switchPressure >= 90 && switches >= 30) {
    alerts.push({
      level: 'medium',
      title: '软件切换较频繁',
      detail: `今天累计切换约 ${switches} 次，可能存在频繁打断。`,
      action: '建议安排连续专注时段，减少多任务来回切换。',
    })
  }
  if (statusRatio >= 0.15 && nonIdleStatusSeconds >= 10 * 60) {
    const leadStatus = collectionStatus.find((row) => row.seconds > 0) || collectionStatus[0]
    alerts.push({
      level: 'low',
      title: '采集状态需要确认',
      detail: leadStatus ? `${leadStatus.label}累计 ${leadStatus.durationText}。` : '今天存在采集状态记录。',
      action: '建议确认权限、熄屏或网络状态，避免影响报表准确性。',
    })
  }

  let score = 100
  if (eventCount <= 0) score = 0
  else {
    score -= Math.max(0, 0.65 - workRatio) * 55
    score -= Math.min(32, idleRatio * 55)
    score -= Math.min(18, statusRatio * 45)
    score -= Math.min(18, aiNonWorkRatio * 30)
    score -= Math.min(18, aiHighRiskRatio * 70)
    if (switchPressure > 70) score -= Math.min(10, (switchPressure - 70) / 5)
    if (topAppRatio >= 0.45 && topApp) score += 5
  }
  const finalScore = clampScore(score)
  const grade = scoreGrade(finalScore)
  const focusText = topApp
    ? `主要投入在「${topApp.appName || '未知软件'}」，占软件时长 ${Math.round(topAppRatio * 100)}%。`
    : '暂无主要投入软件。'
  const bossSummary = eventCount <= 0
    ? '今天还没有形成可分析的工作数据。'
    : `今日在线 ${secondsToText(totalSeconds)}，有效工作 ${secondsToText(workSeconds)}，空闲 ${secondsToText(idleSeconds)}，整体为「${grade.label}」。`
  const nextActions = alerts.length
    ? alerts.slice(0, 3).map((item) => item.action)
    : ['继续保持当前节奏，明天重点观察有效工作时长和高频软件变化。']

  return {
    score: finalScore,
    grade: grade.grade,
    level: grade.level,
    label: grade.label,
    headline: eventCount <= 0 ? '等待采集数据' : `${grade.label} · ${finalScore} 分`,
    metrics: {
      workRatio: Math.round(workRatio * 100),
      idleRatio: Math.round(idleRatio * 100),
      aiWork,
      aiNonWork,
      aiHighRisk,
      switches,
      topAppName: topApp?.appName || '',
      topAppRatio: Math.round(topAppRatio * 100),
    },
    bossBrief: {
      title: '老板日报摘要',
      summary: bossSummary,
      bullets: [
        `有效工作：${secondsToText(workSeconds)}，占在线 ${Math.round(workRatio * 100)}%。`,
        `空闲/离开：${secondsToText(idleSeconds)}，占在线 ${Math.round(idleRatio * 100)}%。`,
        focusText,
      ],
      nextActions,
    },
    alerts,
  }
}

export function getActivitySummary({ date = todayDateString(), employeeId = 'local' } = {}) {
  const db = getDB()
  const range = dateRangeForLocalDay(date)
  const params = [employeeId, range.start, range.end]
  const totalRow = db.prepare(`
    SELECT
      COALESCE(SUM(duration_seconds), 0) AS totalSeconds,
      COALESCE(SUM(CASE WHEN idle = 1 THEN duration_seconds ELSE 0 END), 0) AS idleSeconds,
      COALESCE(SUM(CASE WHEN ${COLLECTION_STATUS_WHERE} THEN duration_seconds ELSE 0 END), 0) AS collectionStatusSeconds,
      COALESCE(SUM(CASE WHEN ${COLLECTION_STATUS_WHERE} AND idle != 1 THEN duration_seconds ELSE 0 END), 0) AS nonIdleStatusSeconds,
      COUNT(*) AS eventCount
    FROM activity_events
    WHERE employee_id = ? AND started_at >= ? AND started_at < ?
  `).get(...params) || {}

  const appRowsRaw = db.prepare(`
    SELECT
      app_name AS appName,
      process_name AS processName,
      COALESCE(SUM(duration_seconds), 0) AS seconds,
      COUNT(*) AS switches,
      MAX(ended_at) AS lastSeenAt,
      MAX(ai_activity_type) AS aiActivityType,
      MAX(ai_risk_level) AS aiRiskLevel,
      MAX(ai_summary) AS aiSummary
    FROM activity_events
    WHERE employee_id = ? AND started_at >= ? AND started_at < ?
      AND NOT ${COLLECTION_STATUS_WHERE}
    GROUP BY app_name, process_name
    ORDER BY seconds DESC
    LIMIT 100
  `).all(...params)

  const statusRowsRaw = db.prepare(`
    SELECT
      app_name AS appName,
      process_name AS processName,
      MAX(window_title) AS windowTitle,
      COALESCE(SUM(duration_seconds), 0) AS seconds,
      COUNT(*) AS count
    FROM activity_events
    WHERE employee_id = ? AND started_at >= ? AND started_at < ?
      AND ${COLLECTION_STATUS_WHERE}
    GROUP BY app_name, process_name
    ORDER BY seconds DESC
    LIMIT 100
  `).all(...params)

  const aiNetworkErrorRow = db.prepare(`
    SELECT COUNT(*) AS count, MAX(summary) AS lastSummary
    FROM activity_screen_analysis
    WHERE employee_id = ? AND captured_at >= ? AND captured_at < ?
      AND raw_json LIKE '%network_offline%'
  `).get(...params) || {}

  // 同一进程不同 app_name（历史数据用 Weixin，新数据用 微信）的合并
  const appMap = new Map()
  for (const row of appRowsRaw) {
    const key = String(row.processName || row.appName || '').toLowerCase()
    if (appMap.has(key)) {
      const exist = appMap.get(key)
      exist.seconds += Number(row.seconds || 0)
      exist.switches += Number(row.switches || 0)
      // 优先选含中文/更友好的 appName
      if (/[\u4e00-\u9fa5]/.test(row.appName) && !/[\u4e00-\u9fa5]/.test(exist.appName)) {
        exist.appName = row.appName
      }
    } else {
      appMap.set(key, { ...row, seconds: Number(row.seconds || 0), switches: Number(row.switches || 0) })
    }
  }
  const appRows = [...appMap.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 30)

  const aiRows = db.prepare(`
    SELECT
      activity_type AS activityType,
      work_related AS workRelated,
      risk_level AS riskLevel,
      COUNT(*) AS count,
      AVG(confidence) AS avgConfidence
    FROM activity_screen_analysis
    WHERE employee_id = ? AND captured_at >= ? AND captured_at < ?
    GROUP BY activity_type, work_related, risk_level
    ORDER BY count DESC
    LIMIT 20
  `).all(...params)

  const totalSeconds = Number(totalRow.totalSeconds || 0)
  const idleSeconds = Number(totalRow.idleSeconds || 0)
  const collectionStatusSeconds = Number(totalRow.collectionStatusSeconds || 0)
  const nonIdleStatusSeconds = Number(totalRow.nonIdleStatusSeconds || 0)
  const appTotalSeconds = appRows.reduce((sum, row) => sum + Number(row.seconds || 0), 0)
  const statusMap = new Map()
  for (const row of statusRowsRaw.map(withCollectionStatus)) {
    const reason = row.collectionReason || 'collector_error'
    const label = getCollectionStatusLabel(reason)
    const exist = statusMap.get(reason) || {
      reason,
      label: row.collectionReasonLabel || label.name,
      detail: row.collectionReasonDetail || label.detail,
      seconds: 0,
      count: 0,
      examples: [],
    }
    exist.seconds += Number(row.seconds || 0)
    exist.count += Number(row.count || 0)
    if (row.windowTitle && exist.examples.length < 2) exist.examples.push(row.windowTitle)
    statusMap.set(reason, exist)
  }
  if (Number(aiNetworkErrorRow.count || 0) > 0) {
    const label = getCollectionStatusLabel('network_offline')
    statusMap.set('network_offline', {
      reason: 'network_offline',
      label: label.name,
      detail: label.detail,
      seconds: 0,
      count: Number(aiNetworkErrorRow.count || 0),
      examples: aiNetworkErrorRow.lastSummary ? [aiNetworkErrorRow.lastSummary] : [],
    })
  }
  const collectionStatus = normalizeRows([...statusMap.values()].sort((a, b) => {
    if (b.seconds !== a.seconds) return b.seconds - a.seconds
    return b.count - a.count
  }))
  const apps = normalizeRows(appRows).map((row) => ({
    ...row,
    percent: appTotalSeconds > 0 ? Math.round((row.seconds / appTotalSeconds) * 1000) / 10 : 0,
  }))
  const workSeconds = Math.max(0, totalSeconds - idleSeconds - nonIdleStatusSeconds)
  const intelligence = buildActivityIntelligence({
    totalSeconds,
    workSeconds,
    idleSeconds,
    nonIdleStatusSeconds,
    appTotalSeconds,
    apps,
    aiRows,
    collectionStatus,
    eventCount: Number(totalRow.eventCount || 0),
  })

  return {
    ok: true,
    date: range.date,
    employeeId,
    generatedAt: new Date().toISOString(),
    totalSeconds,
    totalText: secondsToText(totalSeconds),
    workSeconds,
    workText: secondsToText(workSeconds),
    idleSeconds,
    idleText: secondsToText(idleSeconds),
    appTotalSeconds,
    appTotalText: secondsToText(appTotalSeconds),
    collectionStatusSeconds,
    collectionStatusText: secondsToText(collectionStatusSeconds),
    collectionStatus,
    eventCount: Number(totalRow.eventCount || 0),
    intelligence,
    apps,
    ai: aiRows.map((row) => ({
      activityType: row.activityType || '未分类',
      workRelated: row.workRelated === null || row.workRelated === undefined ? null : Boolean(row.workRelated),
      riskLevel: row.riskLevel || 'low',
      count: Number(row.count || 0),
      avgConfidence: Math.round(Number(row.avgConfidence || 0) * 100) / 100,
    })),
  }
}

export function getActivityTimeline({ date = todayDateString(), employeeId = 'local' } = {}) {
  const db = getDB()
  const range = dateRangeForLocalDay(date)
  const rows = db.prepare(`
    SELECT started_at AS startedAt, ended_at AS endedAt, app_name AS appName, process_name AS processName,
           window_title AS windowTitle, duration_seconds AS durationSeconds, idle,
           ai_work_related AS aiWorkRelated, ai_activity_type AS aiActivityType, ai_risk_level AS aiRiskLevel
    FROM activity_events
    WHERE employee_id = ? AND started_at >= ? AND started_at < ?
    ORDER BY started_at ASC
    LIMIT 1000
  `).all(employeeId, range.start, range.end)

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, seconds: 0, idleSeconds: 0, apps: {} }))
  for (const rawRow of rows) {
    const row = withCollectionStatus(rawRow)
    const d = new Date(row.startedAt)
    const hour = Number.isFinite(d.getTime()) ? d.getHours() : 0
    const bucket = hourly[hour] || hourly[0]
    const seconds = Number(row.durationSeconds || 0)
    if (row.isCollectionStatus) {
      bucket.idleSeconds += seconds
      continue
    }
    bucket.seconds += seconds
    if (row.idle) bucket.idleSeconds += seconds
    const app = row.appName || '未知软件'
    bucket.apps[app] = (bucket.apps[app] || 0) + seconds
  }

  return {
    ok: true,
    date: range.date,
    employeeId,
    hourly: hourly.map((bucket) => ({
      hour: bucket.hour,
      seconds: bucket.seconds,
      idleSeconds: bucket.idleSeconds,
      topApps: Object.entries(bucket.apps)
        .map(([appName, seconds]) => ({ appName, seconds, durationText: secondsToText(seconds) }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 5),
    })),
    events: rows.map((row) => {
      const event = withCollectionStatus(row)
      return {
        ...event,
        idle: Boolean(row.idle || event.isCollectionStatus),
        aiWorkRelated: row.aiWorkRelated === null || row.aiWorkRelated === undefined ? null : Boolean(row.aiWorkRelated),
        durationText: secondsToText(row.durationSeconds),
      }
    }),
  }
}

export function listActivityEvents({ date = todayDateString(), employeeId = 'local', limit = 200 } = {}) {
  const db = getDB()
  const range = dateRangeForLocalDay(date)
  const rows = db.prepare(`
    SELECT id, started_at AS startedAt, ended_at AS endedAt, app_name AS appName, process_name AS processName,
           window_title AS windowTitle, duration_seconds AS durationSeconds, idle,
           ai_work_related AS aiWorkRelated, ai_activity_type AS aiActivityType, ai_confidence AS aiConfidence,
           ai_risk_level AS aiRiskLevel, ai_summary AS aiSummary
    FROM activity_events
    WHERE employee_id = ? AND started_at >= ? AND started_at < ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(employeeId, range.start, range.end, Math.max(1, Math.min(1000, Number(limit || 200))))
  return {
    ok: true,
    date: range.date,
    employeeId,
    events: rows.map((row) => {
      const event = withCollectionStatus(row)
      return {
        ...event,
        idle: Boolean(row.idle || event.isCollectionStatus),
        aiWorkRelated: row.aiWorkRelated === null || row.aiWorkRelated === undefined ? null : Boolean(row.aiWorkRelated),
        durationText: secondsToText(row.durationSeconds),
      }
    }),
  }
}

export function listScreenAnalyses({ date = todayDateString(), employeeId = 'local', limit = 100 } = {}) {
  const db = getDB()
  const range = dateRangeForLocalDay(date)
  const rows = db.prepare(`
    SELECT id, captured_at AS capturedAt, app_name AS appName, process_name AS processName,
           window_title AS windowTitle, work_related AS workRelated, activity_type AS activityType,
           confidence, risk_level AS riskLevel, summary, sensitive_detected AS sensitiveDetected, model
    FROM activity_screen_analysis
    WHERE employee_id = ? AND captured_at >= ? AND captured_at < ?
    ORDER BY captured_at DESC
    LIMIT ?
  `).all(employeeId, range.start, range.end, Math.max(1, Math.min(500, Number(limit || 100))))
  return {
    ok: true,
    date: range.date,
    employeeId,
    analyses: rows.map((row) => ({
      ...row,
      workRelated: row.workRelated === null || row.workRelated === undefined ? null : Boolean(row.workRelated),
      sensitiveDetected: Boolean(row.sensitiveDetected),
      confidence: Math.round(Number(row.confidence || 0) * 100) / 100,
    })),
  }
}
