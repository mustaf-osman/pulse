import { API } from './api-client.js'

function $(id) { return document.getElementById(id) }

function todayDate() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(value, keyword) {
  const safe = escapeHtml(value)
  const key = String(keyword || '').trim()
  if (!key) return safe
  return safe.replace(new RegExp(`(${escapeRegExp(escapeHtml(key))})`, 'ig'), '<mark>$1</mark>')
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API}${path}`, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function statusToHero(status) {
  const cfg = status?.config || {}
  const dot = $('ar-status-dot')
  const text = $('ar-status-text')
  const pill = $('ar-status-pill')
  if (!dot || !text || !pill) return

  if (cfg.trackingEnabled && status?.running) {
    pill.dataset.state = 'running'
    text.textContent = cfg.aiScreenEnabled ? '采集中 · AI 已启用' : '采集中 · 系统 API 模式'
  } else {
    pill.dataset.state = 'paused'
    text.textContent = '采集已关闭 · 不会记录任何数据'
  }
}

function renderStatus(status) {
  const tracking = $('activity-tracking-toggle')
  const ai = $('activity-ai-toggle')
  if (tracking) tracking.checked = Boolean(status?.config?.trackingEnabled)
  if (ai) ai.checked = Boolean(status?.config?.aiScreenEnabled)

  statusToHero(status)

  const current = status?.current || status?.lastSample || null
  const cur = $('activity-kpi-current')
  const curSub = $('activity-kpi-current-sub')
  if (cur) cur.textContent = current?.appName || '—'
  if (curSub) curSub.textContent = current?.collectionReasonDetail || current?.windowTitle || current?.processName || '—'
}

const APP_COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#a3a3a3']

function appColor(index) { return APP_COLORS[index % APP_COLORS.length] }

function collectionIcon(reason = '') {
  const key = String(reason || '')
  if (key === 'screen_locked') return '🌙'
  if (key === 'user_idle' || key === 'system_idle') return '💤'
  if (key === 'timeout') return '⏳'
  if (key === 'permission_denied') return '🔒'
  if (key === 'network_offline') return '🌐'
  if (key === 'no_foreground') return '🖥️'
  if (key === 'system_process') return '⚙️'
  return '⚠️'
}

function alertIcon(level = '') {
  if (level === 'high') return '🚨'
  if (level === 'medium') return '⚠️'
  if (level === 'low') return 'ℹ️'
  return '✅'
}

function renderIntelligence(summary) {
  const intelligence = summary?.intelligence || {}
  const metrics = intelligence.metrics || {}
  const score = Number(intelligence.score || 0)
  const level = intelligence.level || 'watch'
  const scoreCard = $('activity-score-card')
  const scoreValue = $('activity-score-value')
  const headline = $('activity-score-headline')
  const label = $('activity-score-label')
  const metricBox = $('activity-score-metrics')
  if (scoreCard) scoreCard.dataset.level = level
  if (scoreValue) scoreValue.textContent = String(score)
  if (headline) headline.textContent = intelligence.headline || '等待采集数据'
  if (label) label.textContent = `评级 ${intelligence.grade || '-'} · ${intelligence.label || '暂无判断'}`
  if (metricBox) {
    metricBox.innerHTML = `
      <span>有效 ${Number(metrics.workRatio || 0)}%</span>
      <span>空闲 ${Number(metrics.idleRatio || 0)}%</span>
      <span>切换 ${Number(metrics.switches || 0)} 次</span>
      <span>高风险 ${Number(metrics.aiHighRisk || 0)} 次</span>
    `
  }

  const brief = intelligence.bossBrief || {}
  const bossTitle = $('activity-boss-title')
  const bossSummary = $('activity-boss-summary')
  const bossBullets = $('activity-boss-bullets')
  const bossActions = $('activity-boss-actions')
  if (bossTitle) bossTitle.textContent = brief.title || '老板日报摘要'
  if (bossSummary) bossSummary.textContent = brief.summary || '暂无可分析数据。'
  if (bossBullets) {
    const rows = Array.isArray(brief.bullets) ? brief.bullets : []
    bossBullets.innerHTML = rows.map((item) => `<div class="ar-boss-bullet">${escapeHtml(item)}</div>`).join('')
  }
  if (bossActions) {
    const rows = Array.isArray(brief.nextActions) ? brief.nextActions : []
    bossActions.innerHTML = rows.map((item) => `<div class="ar-boss-action">${escapeHtml(item)}</div>`).join('')
  }

  const alertList = $('activity-alert-list')
  if (alertList) {
    const alerts = Array.isArray(intelligence.alerts) ? intelligence.alerts : []
    alertList.innerHTML = alerts.length ? alerts.map((item) => `
      <div class="ar-alert-item ar-alert-${escapeHtml(item.level || 'info')}">
        <div class="ar-alert-icon">${alertIcon(item.level)}</div>
        <div class="ar-alert-body">
          <strong>${escapeHtml(item.title || '提醒')}</strong>
          <p>${escapeHtml(item.detail || '')}</p>
          <span>${escapeHtml(item.action || '')}</span>
        </div>
      </div>
    `).join('') : `
      <div class="ar-alert-empty">
        <strong>暂无明显异常</strong>
        <span>继续观察有效工作时长、空闲比例和高风险分类变化。</span>
      </div>
    `
  }
}

function renderSummary(summary) {
  $('activity-kpi-total').textContent = summary?.totalText || '0秒'
  $('activity-kpi-work').textContent = summary?.workText || '0秒'
  $('activity-kpi-idle').textContent = summary?.idleText || '0秒'
  $('activity-kpi-events').textContent = `${summary?.eventCount || 0} 条原始记录`
  const totalSeconds = Number(summary?.totalSeconds || 0)
  const workSeconds = Number(summary?.workSeconds || 0)
  const ratio = totalSeconds > 0 ? Math.round((workSeconds / totalSeconds) * 100) : 0
  const ring = $('nimo-screen-ring')
  if (ring) ring.style.setProperty('--ratio', `${Math.max(0, Math.min(100, ratio))}%`)
  const ratioEl = $('nimo-screen-ratio')
  if (ratioEl) ratioEl.textContent = `${ratio}%`
  renderIntelligence(summary)
  const meta = $('activity-apps-meta')
  if (meta) meta.textContent = `${summary?.apps?.length || 0} 个软件 · 按累计时长排序`

  const apps = $('activity-app-list')
  if (apps) {
    const items = summary?.apps || []
    apps.innerHTML = items.length ? items.map((item, index) => `
      <div class="ar-app-row">
        <div class="ar-app-rank" style="background:${appColor(index)}1a;color:${appColor(index)}">${index + 1}</div>
        <div class="ar-app-main">
          <div class="ar-app-head">
            <span class="ar-app-name">${escapeHtml(item.appName || '未知软件')}</span>
            <span class="ar-app-time">${escapeHtml(item.durationText || '0秒')}</span>
          </div>
          <div class="ar-app-meta">
            <span>${escapeHtml(item.processName || '')}</span>
            <span>·</span>
            <span>${item.switches || 0} 次切换</span>
            <span>·</span>
            <strong>${item.percent || 0}%</strong>
          </div>
          <div class="ar-app-bar">
            <span style="width:${Math.max(2, Math.min(100, item.percent || 0))}%; background:${appColor(index)}"></span>
          </div>
        </div>
      </div>
    `).join('') : `
      <div class="ar-empty">
        <div class="ar-empty-icon">⏱</div>
        <div class="ar-empty-title">还没有软件使用记录</div>
        <div class="ar-empty-sub">开启「软件时长统计」后，切换几个软件，30 秒内会出现在排行榜里。</div>
      </div>
    `
  }

  const statusMeta = $('activity-status-meta')
  if (statusMeta) {
    statusMeta.textContent = `${summary?.collectionStatusText || '0秒'} · 熄屏、锁屏、采集异常等不计入软件排行`
  }
  const statusList = $('activity-status-list')
  if (statusList) {
    const rows = summary?.collectionStatus || []
    statusList.innerHTML = rows.length ? rows.map((row) => `
      <div class="ar-collect-row ar-collect-${escapeHtml(row.reason || 'collector_error')}">
        <div class="ar-collect-icon">${collectionIcon(row.reason)}</div>
        <div class="ar-collect-main">
          <div class="ar-collect-head">
            <span class="ar-collect-name">${escapeHtml(row.label || row.collectionReasonLabel || '采集状态')}</span>
            <span class="ar-collect-time">${escapeHtml(row.durationText || '0秒')}</span>
          </div>
          <div class="ar-collect-detail">${escapeHtml(row.detail || row.collectionReasonDetail || '非真实软件，不计入软件排行')}</div>
          ${(row.examples || []).length ? `<div class="ar-collect-example">${escapeHtml(row.examples[0])}</div>` : ''}
        </div>
        <div class="ar-collect-count">${row.count || 0} 次</div>
      </div>
    `).join('') : `
      <div class="ar-empty ar-empty-inline">
        <div class="ar-empty-title">今天没有采集异常</div>
        <div class="ar-empty-sub">如果电脑锁屏、熄屏、权限不足或调用超时，会在这里单独说明原因。</div>
      </div>
    `
  }

  const ai = $('activity-ai-list')
  const aiSum = $('activity-ai-summary')
  if (ai) {
    const rows = summary?.ai || []
    if (!rows.length) {
      ai.innerHTML = ''
      if (aiSum) aiSum.innerHTML = `
        <div class="ar-empty ar-empty-inline">
          <div class="ar-empty-title">还没有 AI 分类结果</div>
          <div class="ar-empty-sub">点上面「AI 检测一次」立刻试一次，或开启「AI 屏幕分类」自动跑。</div>
        </div>
      `
      return
    }
    const totalCount = rows.reduce((acc, row) => acc + (row.count || 0), 0)
    ai.innerHTML = rows.map((row) => {
      const ratio = totalCount ? Math.round((row.count / totalCount) * 100) : 0
      const risk = row.riskLevel || 'low'
      return `
        <div class="ar-tag ar-risk-${escapeHtml(risk)}" style="--ratio:${ratio}%">
          <span class="ar-tag-name">${escapeHtml(row.activityType || '未分类')}</span>
          <span class="ar-tag-count">${row.count || 0}</span>
          <span class="ar-tag-bar"></span>
        </div>
      `
    }).join('')
    if (aiSum) {
      const work = rows.filter((r) => r.workRelated === true).reduce((a, r) => a + (r.count || 0), 0)
      const nonWork = rows.filter((r) => r.workRelated === false).reduce((a, r) => a + (r.count || 0), 0)
      const high = rows.filter((r) => r.riskLevel === 'high').reduce((a, r) => a + (r.count || 0), 0)
      aiSum.innerHTML = `
        <div class="ar-ai-summary-row">
          <span class="ar-ai-pill ar-ai-pill-good">工作 ${work}</span>
          <span class="ar-ai-pill ar-ai-pill-warn">非工作 ${nonWork}</span>
          <span class="ar-ai-pill ar-ai-pill-danger">高风险 ${high}</span>
          <span class="ar-ai-pill-sub">置信度均值参考下方明细</span>
        </div>
      `
    }
  }
}

function bucketize(seconds, max) {
  if (!seconds || max <= 0) return 0
  const ratio = seconds / max
  if (ratio < 0.05) return 1
  if (ratio < 0.25) return 2
  if (ratio < 0.6) return 3
  return 4
}

function fmtSecondsShort(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)))
  if (!total) return '0'
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}h${m ? m + 'm' : ''}`
  if (m > 0) return `${m}m`
  return `${total}s`
}

function fileNameFromTitle(title = '') {
  const text = String(title || '').replace(/\s+/g, ' ').trim()
  const match = text.match(/([^\\/:*?"<>|\n\r]+?\.(pdf|docx?|xlsx?|pptx?|txt|md|html?|csv|json|js|ts|py|java|cpp|c|png|jpe?g|zip))/i)
  if (match) return match[1].trim()
  const first = text.split(/\s[-—|]\s/)[0]?.trim()
  return first && first.length >= 4 && first.length <= 80 ? first : ''
}

function summarizeFiles(timeline) {
  const map = new Map()
  for (const event of timeline?.events || []) {
    const fileName = fileNameFromTitle(event.windowTitle || '')
    if (!fileName) continue
    const row = map.get(fileName) || { fileName, seconds: 0, count: 0, appName: event.appName || '' }
    row.seconds += Number(event.durationSeconds || 0)
    row.count += 1
    if (!row.appName && event.appName) row.appName = event.appName
    map.set(fileName, row)
  }
  const total = [...map.values()].reduce((sum, row) => sum + row.seconds, 0)
  return [...map.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 10).map((row) => ({
    ...row,
    durationText: fmtSecondsShort(row.seconds),
    percent: total > 0 ? Math.round((row.seconds / total) * 100) : 0,
  }))
}

function renderFileUsage(timeline) {
  const list = $('activity-file-list')
  const meta = $('activity-files-meta')
  if (!list) return
  const files = summarizeFiles(timeline)
  if (meta) meta.textContent = files.length ? `${files.length} 个文件/文档 · 按识别时长排序` : '从窗口标题识别文档/文件名'
  list.innerHTML = files.length ? files.map((item, index) => `
    <div class="ar-app-row">
      <div class="ar-app-rank" style="background:${appColor(index)}1a;color:${appColor(index)}">${index + 1}</div>
      <div class="ar-app-main">
        <div class="ar-app-head">
          <span class="ar-app-name">${escapeHtml(item.fileName)}</span>
          <span class="ar-app-time">${escapeHtml(item.durationText || '0')}</span>
        </div>
        <div class="ar-app-meta">
          <span>${escapeHtml(item.appName || '未知软件')}</span>
          <span>·</span>
          <span>${item.count || 0} 次出现</span>
          <span>·</span>
          <strong>${item.percent || 0}%</strong>
        </div>
        <div class="ar-app-bar">
          <span style="width:${Math.max(2, Math.min(100, item.percent || 0))}%; background:${appColor(index)}"></span>
        </div>
      </div>
    </div>
  `).join('') : `
    <div class="ar-empty">
      <div class="ar-empty-icon">📄</div>
      <div class="ar-empty-title">还没有识别到文件使用</div>
      <div class="ar-empty-sub">打开 PDF、Word、Excel、代码文件或网页文档后，会从窗口标题里推断文件使用率。</div>
    </div>
  `
}

function renderTimeline(timeline) {
  const heat = $('activity-heatmap')
  if (heat) {
    const hourly = timeline?.hourly || Array.from({ length: 24 }, (_, hour) => ({ hour, seconds: 0, topApps: [] }))
    const max = Math.max(1, ...hourly.map((h) => Number(h.seconds || 0)))
    heat.innerHTML = hourly.map((h) => {
      const level = bucketize(Number(h.seconds || 0), max)
      const top = h.topApps?.[0]?.appName || ''
      return `
        <div class="ar-heat-cell ar-heat-l${level}" title="${h.hour}:00 · ${escapeHtml(top || '无活动')} · ${fmtSecondsShort(h.seconds)}">
          <div class="ar-heat-hour">${String(h.hour).padStart(2, '0')}</div>
          <div class="ar-heat-amount">${fmtSecondsShort(h.seconds)}</div>
        </div>
      `
    }).join('')
  }

  const events = $('activity-event-list')
  if (events) {
    const rows = timeline?.events || []
    if (!rows.length) {
      events.innerHTML = `
        <div class="ar-empty ar-empty-inline">
          <div class="ar-empty-title">今天还没有明细</div>
          <div class="ar-empty-sub">采集开启后，每次切换软件会在这里留一条记录。</div>
        </div>
      `
      return
    }
    events.innerHTML = rows.slice(-60).reverse().map((event) => {
      const time = (event.startedAt || '').slice(11, 16)
      const tag = event.isCollectionStatus
        ? `<span class="ar-event-tag ar-tag-collect">${escapeHtml(event.collectionReasonLabel || '采集状态')}</span>`
        : event.idle
        ? '<span class="ar-event-tag ar-tag-idle">空闲</span>'
        : (event.aiActivityType ? `<span class="ar-event-tag ar-tag-ai">${escapeHtml(event.aiActivityType)}</span>` : '')
      return `
        <div class="ar-event ${event.isCollectionStatus ? 'is-collection-status' : ''}">
          <div class="ar-event-time">${escapeHtml(time)}</div>
          <div class="ar-event-body">
            <div class="ar-event-title">
              <span class="ar-event-app">${escapeHtml(event.appName || '未知软件')}</span>
              ${tag}
            </div>
            <div class="ar-event-sub">${escapeHtml(event.collectionReasonDetail || event.windowTitle || event.processName || '')}</div>
          </div>
          <div class="ar-event-duration">${escapeHtml(event.durationText || '')}</div>
        </div>
      `
    }).join('')
  }
}

async function loadActivityReport() {
  try {
    const date = $('activity-date')?.value || todayDate()
    const [status, summary, timeline, catalog] = await Promise.all([
      fetchJson('/activity/status'),
      fetchJson(`/activity/summary?date=${encodeURIComponent(date)}`),
      fetchJson(`/activity/timeline?date=${encodeURIComponent(date)}`),
      loadCatalog(),
    ])
    renderStatus(status)
    renderSummary(summary)
    renderTimeline(timeline)
    renderFileUsage(timeline)
    renderRulesModal(catalog, $('ar-rule-search')?.value || '')
    loadDailySummaryHistory(date).catch(() => {})
  } catch (err) {
    console.warn('[ActivityReport] load failed:', err)
  }
}

async function updateConfig(patch) {
  const status = await fetchJson('/activity/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  renderStatus(status)
  await loadActivityReport()
}

async function exportReportImage() {
  const target = $('activity-report-view')
  if (!target) return
  const html2canvas = window.html2canvas
  if (typeof html2canvas !== 'function') {
    alert('当前版本未内置截图组件，可以先用系统截屏；后续会接入 html2canvas 一键导出。')
    return
  }
  const canvas = await html2canvas(target, { backgroundColor: '#ffffff', scale: 2 })
  const a = document.createElement('a')
  a.download = `nimo-${$('activity-date')?.value || todayDate()}.png`
  a.href = canvas.toDataURL('image/png')
  a.click()
}

let lastAiSummaryText = ''

function renderDailySummaryHistory(result, date) {
  const textEl = $('daily-summary-text')
  const metaEl = $('daily-summary-meta')
  const sendBtn = $('daily-summary-send-chat')
  if (!textEl || !metaEl) return
  if (result?.exists && result.summary?.text) {
    lastAiSummaryText = result.summary.text
    textEl.textContent = lastAiSummaryText
    const label = result.summary.source === 'ai' ? 'AI 历史总结' : '本地历史总结'
    metaEl.textContent = `${label} · ${date} · ${result.summary.updatedAt || result.summary.generatedAt || ''}`
    if (sendBtn) sendBtn.disabled = false
  } else {
    lastAiSummaryText = ''
    textEl.textContent = '这一天还没有保存的 AI 总结。点击「AI 总结所选日期」生成后，会自动保存到历史。'
    metaEl.textContent = `暂无历史总结 · ${date}`
    if (sendBtn) sendBtn.disabled = true
  }
}

async function loadDailySummaryHistory(date = $('activity-date')?.value || todayDate()) {
  try {
    const result = await fetchJson(`/daily-summary/history?date=${encodeURIComponent(date)}`)
    renderDailySummaryHistory(result, date)
  } catch (err) {
    const metaEl = $('daily-summary-meta')
    if (metaEl) metaEl.textContent = `读取历史总结失败 · ${date}`
  }
}

async function generateDailySummary({ sendToChat = false } = {}) {
  const textEl = $('daily-summary-text')
  const metaEl = $('daily-summary-meta')
  const btn = $('daily-summary-generate')
  const sendBtn = $('daily-summary-send-chat')
  const date = $('activity-date')?.value || todayDate()
  if (btn) btn.disabled = true
  if (textEl) textEl.textContent = 'Nimo 正在精简总结所选日期做了什么…'
  try {
    const result = await fetchJson('/daily-summary/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, force: true }),
    })
    lastAiSummaryText = result.summary || result.fallback || ''
    if (textEl) textEl.textContent = lastAiSummaryText || '今天数据还不够，暂时无法总结。'
    if (metaEl) metaEl.textContent = result.source === 'ai' ? `AI 已生成并保存 · ${date}` : `本地兜底总结已保存 · ${date}`
    if (sendToChat && lastAiSummaryText) {
      window.dispatchEvent(new CustomEvent('pulse:proactive-message', { detail: { text: lastAiSummaryText } }))
    }
    return lastAiSummaryText
  } catch (err) {
    if (textEl) textEl.textContent = `总结失败：${err.message}`
    if (metaEl) metaEl.textContent = `生成失败 · ${date}`
    return ''
  } finally {
    if (btn) btn.disabled = false
    if (sendBtn) sendBtn.disabled = false
  }
}

let catalogCache = null

async function loadCatalog(force = false) {
  if (catalogCache && !force) return catalogCache
  catalogCache = await fetchJson('/activity/catalog')
  return catalogCache
}

function renderRulesModal(catalog, searchKeyword = '') {
  const sampleEl = $('ar-rule-sample')
  const idleEl = $('ar-rule-idle')
  const screenEl = $('ar-rule-screen')
  if (sampleEl) sampleEl.textContent = catalog?.sampleRule || ''
  if (idleEl) idleEl.textContent = catalog?.idleRule || ''
  if (screenEl) screenEl.textContent = catalog?.screenRule || ''

  const privacy = $('ar-rule-privacy')
  if (privacy) privacy.innerHTML = (catalog?.privacy || []).map((line) => `
    <li>
      <span class="ar-privacy-check">✓</span>
      <span>${escapeHtml(line)}</span>
    </li>
  `).join('')

  const legend = $('ar-rules-legend')
  if (legend) legend.innerHTML = (catalog?.categories || []).map((cat) => `
    <button class="ar-rules-nav-item" type="button" data-cat="${escapeHtml(cat.id)}" style="--cat:${escapeHtml(cat.color)}">
      <span class="ar-rules-nav-dot"></span>
      <span class="ar-rules-nav-label">${escapeHtml(cat.label)}</span>
      <span class="ar-rules-nav-count">${cat.apps.length}</span>
    </button>
  `).join('')

  const list = $('ar-rules-categories')
  if (!list) return
  const key = String(searchKeyword || '').trim().toLowerCase()
  const groups = (catalog?.categories || []).map((cat) => {
    let apps = cat.apps
    if (key) {
      apps = apps.filter((app) => app.name.toLowerCase().includes(key) || app.processName.toLowerCase().includes(key))
    }
    return { ...cat, apps }
  }).filter((cat) => !key || cat.apps.length)

  if (!groups.length) {
    list.innerHTML = `<div class="ar-empty ar-empty-inline">没有匹配「${escapeHtml(searchKeyword)}」的软件。可以告诉我们补充进目录。</div>`
    return
  }

  list.innerHTML = groups.map((cat) => `
    <details class="ar-rules-group" data-cat="${escapeHtml(cat.id)}" style="--cat:${escapeHtml(cat.color)}" ${key ? 'open' : ''}>
      <summary class="ar-rules-group-head">
        <span class="ar-rules-group-dot"></span>
        <span class="ar-rules-group-title">${highlightText(cat.label, key)}</span>
        <span class="ar-rules-group-count">${cat.apps.length} 个软件</span>
        <span class="ar-rules-group-badge ${workClass(cat.workRelated)}">${workLabel(cat.workRelated)}</span>
        <span class="ar-rules-group-risk ar-rules-risk-${escapeHtml(cat.risk)}">默认风险 ${riskLabel(cat.risk)}</span>
        <span class="ar-rules-group-chevron">⌄</span>
      </summary>
      ${cat.note ? `<div class="ar-rules-group-note">${escapeHtml(cat.note)}</div>` : ''}
      <div class="ar-rules-apps">
        ${cat.apps.map((app) => `
          <span class="ar-rules-app">
            <span class="ar-rules-app-name">${highlightText(app.name, key)}</span>
            <span class="ar-rules-app-proc">${highlightText(`${app.processName}.exe`, key)}</span>
          </span>
        `).join('')}
      </div>
    </details>
  `).join('')
}

function riskLabel(risk) {
  if (risk === 'high') return '高'
  if (risk === 'medium') return '中'
  return '低'
}

function workLabel(value) {
  if (value === false) return '不计入工作'
  if (value === true) return '计入工作'
  return '看上下文'
}

function workClass(value) {
  if (value === false) return 'is-nonwork'
  if (value === true) return 'is-work'
  return 'is-neutral'
}

async function showRulesPanel() {
  const panel = $('ar-rules-panel')
  if (!panel) return
  try {
    const catalog = await loadCatalog()
    renderRulesModal(catalog, $('ar-rule-search')?.value || '')
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    panel.classList.add('is-highlighted')
    window.setTimeout(() => panel.classList.remove('is-highlighted'), 1200)
  } catch (err) {
    alert(`加载分类规则失败：${err.message}`)
  }
}

export function initActivityReportView() {
  const dateInput = $('activity-date')
  if (dateInput && !dateInput.value) dateInput.value = todayDate()

  $('activity-refresh')?.addEventListener('click', () => loadActivityReport())
  $('daily-summary-generate')?.addEventListener('click', () => generateDailySummary())
  $('daily-summary-send-chat')?.addEventListener('click', () => {
    if (lastAiSummaryText) {
      window.dispatchEvent(new CustomEvent('pulse:proactive-message', { detail: { text: lastAiSummaryText } }))
      return
    }
    generateDailySummary({ sendToChat: true })
  })
  $('activity-export')?.addEventListener('click', () => exportReportImage().catch((err) => alert(err.message)))
  $('activity-rules')?.addEventListener('click', () => showRulesPanel())
  $('ar-rule-search')?.addEventListener('input', (event) => {
    if (catalogCache) renderRulesModal(catalogCache, event.target.value)
  })
  $('ar-rules-legend')?.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-cat]')
    if (!button) return
    const target = document.querySelector(`.ar-rules-group[data-cat="${button.dataset.cat}"]`)
    if (!target) return
    target.open = true
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  $('activity-tracking-toggle')?.addEventListener('change', (event) => {
    updateConfig({ trackingEnabled: event.target.checked }).catch((err) => alert(err.message))
  })
  $('activity-ai-toggle')?.addEventListener('change', (event) => {
    updateConfig({
      aiScreenEnabled: event.target.checked,
      trackingEnabled: $('activity-tracking-toggle')?.checked || event.target.checked,
    }).catch((err) => alert(err.message))
  })
  $('activity-sample-now')?.addEventListener('click', () => {
    fetchJson('/activity/sample', { method: 'POST' }).then(loadActivityReport).catch((err) => alert(err.message))
  })
  $('activity-ai-now')?.addEventListener('click', () => {
    fetchJson('/activity/screen-analysis', { method: 'POST' }).then(loadActivityReport).catch((err) => alert(err.message))
  })
  dateInput?.addEventListener('change', () => loadActivityReport())
  window.addEventListener('pulse:open-activity-report', () => loadActivityReport())
  window.addEventListener('pulse:view-changed', (event) => {
    if (event.detail?.view === 'activity') loadActivityReport()
  })

  loadActivityReport()
  setInterval(() => {
    if (document.body.getAttribute('data-active-view') === 'activity') loadActivityReport()
  }, 12000)
}
