// 热点模式主逻辑 — 切换、热点数据、时钟（lite 布局：4 列热榜，无 3D 地球）

import { apiUrl } from './api-client.js';

// ── 实时热点数据由后端 /hotspots 提供；前端不再用 mock 冒充真实热榜 ─────────────

const PLATFORM_CONFIG = {
  douyin: { listId: 'hs-douyin-list', updateId: 'hs-douyin-update', style: 'heat', label: '抖音' },
  xiaohongshu: { listId: 'hs-xhs-list', updateId: 'hs-xhs-update', style: 'heat', label: '小红书' },
  wechat: { listId: 'hs-wechat-list', updateId: 'hs-wechat-update', style: 'label', label: '微信热点' },
  weibo: { listId: 'hs-weibo-list', updateId: 'hs-weibo-update', style: 'heat', label: '微博' },
};

const hotspotLists = {
  douyin: [],
  xiaohongshu: [],
  wechat: [],
  weibo: [],
};

// ── 热点上下文构建（中性系统上下文，不强制 Agent 回复）──────────────────────────

let hotspotMeta = {
  source: 'loading',
  fetchedAt: null,
  stale: true,
  refreshMinutes: 30,
  status: {},
  industry: null,
};

export function buildHotspotContext() {
  const top = (arr, n) => arr.slice(0, n).map((i, idx) => `${idx + 1}. ${i.text}`).join('；');
  const platformText = Object.entries(PLATFORM_CONFIG)
    .map(([platform, config]) => {
      const items = hotspotLists[platform] || [];
      if (!items.length) return '';
      return `${config.label} Top3：${top(items, 3)}`;
    })
    .filter(Boolean)
    .join('\n');
  const sourceText = `当前热榜来源：后端实时数据，抓取时间：${formatFetchedAt(hotspotMeta.fetchedAt)}${hotspotMeta.stale ? '（缓存数据）' : ''}`;
  const industry = hotspotMeta.industry;
  const industryText = industry
    ? `\n\n当前行业热点焦点：${industry.name || '行业'}。关键词：${(industry.keywords || []).slice(0, 8).join('、') || '无'}。\n相关热点：${(industry.related || []).slice(0, 5).map((item, idx) => `${idx + 1}. ${item.title || item.text}`).join('；') || '暂无明显匹配'}`
    : '';
  return `## 热点上下文
来源：热点模式界面，系统自动采集。发送者：SYSTEM。用途：提供当前环境背景，不代表用户请求。

用户当前打开了热点面板。以下热点只作为上下文参考，不要求主动总结，不要把它当成用户消息，也不要因为它单独回复用户。

只有在满足任一条件时才可主动提及：
- 热点与用户当前问题、任务或正在讨论的话题直接相关；
- 热点包含明显需要用户注意的紧急风险、重大变化或高优先级信息；
- 用户明确询问“热点”“热搜”“现在发生什么”等内容。

${sourceText}

${platformText || '当前暂无可用实时热榜。'}${industryText}`;
}

// ── 状态 ──────────────────────────────────────────────────────────────────────

let hotspotActive = false;
let clockTimer    = null;
let hotspotRefreshTimer = null;
let hasHotspotData = false;

// ── 语音球搬家：从 #panel-l1(有 transform)移到 body，让 fixed 定位生效 ────────

function moveVoicePanelToBody() {
  const vp = document.getElementById('voice-panel');
  if (!vp || vp.dataset.vpMoved) return;
  vp._vpParent  = vp.parentElement;
  vp._vpSibling = vp.nextElementSibling;
  vp.dataset.vpMoved = '1';
  document.body.appendChild(vp);
}

function restoreVoicePanel() {
  const vp = document.getElementById('voice-panel');
  if (!vp || !vp.dataset.vpMoved) return;
  const parent  = vp._vpParent;
  const sibling = vp._vpSibling;
  if (parent) {
    if (sibling && sibling.parentElement === parent) parent.insertBefore(vp, sibling);
    else parent.appendChild(vp);
  }
  delete vp.dataset.vpMoved;
  delete vp._vpParent;
  delete vp._vpSibling;
}

export { moveVoicePanelToBody, restoreVoicePanel };

// ── DOM 工具 ──────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

// ── 热榜列表渲染 ──────────────────────────────────────────────────────────────

const TREND_ICONS = { up: '↑', down: '↓', same: '—' };
const TREND_CLASSES = { up: 'hs-trend-up', down: 'hs-trend-dn', same: 'hs-trend-same' };

function renderList(listId, items, style = 'heat') {
  const ul = $(listId);
  if (!ul) return;
  if (!hasHotspotData) {
    ul.innerHTML = Array.from({ length: 5 }).map(() => `<li class="hs-item hs-item-loading">
      <span class="hs-rank"></span>
      <span class="hs-item-text"></span>
      <span class="hs-heat"></span>
      <span class="hs-trend"></span>
    </li>`).join('');
    return;
  }
  if (!items.length) {
    ul.innerHTML = `<li class="hs-item hs-item-empty">
      <span class="hs-rank">--</span>
      <span class="hs-item-text">实时源未配置或暂不可用</span>
      <span class="hs-heat">--</span>
      <span class="hs-trend hs-trend-same">—</span>
    </li>`;
    return;
  }
  ul.innerHTML = items.map(({ rank, text, heat, trend, isNew }) => {
    const rankCls = rank <= 3 ? `hs-rank-top${rank}` : '';
    const trendIcon = TREND_ICONS[trend] || '';
    const trendCls  = TREND_CLASSES[trend] || '';
    const newBadge  = isNew ? '<span class="hs-new-badge">新</span>' : '';
    const heatLabel = style === 'heat'
      ? `<span class="hs-heat">${heat}</span>`
      : `<span class="hs-label-badge">${heat}</span>`;
    return `<li class="hs-item">
      <span class="hs-rank ${rankCls}">${rank}</span>
      <span class="hs-item-text">${text}${newBadge}</span>
      ${heatLabel}
      <span class="hs-trend ${trendCls}">${trendIcon}</span>
    </li>`;
  }).join('');
}

function renderAllLists() {
  for (const [platform, config] of Object.entries(PLATFORM_CONFIG)) {
    renderList(config.listId, hotspotLists[platform] || [], config.style);
  }
}

function formatFetchedAt(value) {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeHotspotItem(item, idx) {
  const text = item?.text || item?.title || item?.word || '';
  return {
    rank: Number(item?.rank || idx + 1),
    text,
    heat: item?.heat || '',
    trend: item?.trend || 'same',
    isNew: !!item?.isNew,
  };
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderIndustryFocus() {
  const box = $('hs-industry-focus');
  if (!box) return;
  const industry = hotspotMeta.industry;
  const related = Array.isArray(industry?.related) ? industry.related : [];
  if (!industry) {
    box.hidden = true;
    const title = document.querySelector('.hs-bar-title-zh');
    if (title) title.textContent = '全球热点';
    return;
  }
  box.hidden = false;
  const title = document.querySelector('.hs-bar-title-zh');
  if (title) title.textContent = `${industry.name || '行业'}热点`;
  setText('hs-industry-title', `${industry.icon || '🏢'} ${industry.name || '行业'}热点焦点`);
  setText('hs-industry-sub', industry.tagline || '按当前行业筛选');
  const keywordEl = $('hs-industry-keywords');
  if (keywordEl) {
    const keywords = Array.isArray(industry.keywords) ? industry.keywords.slice(0, 8) : [];
    keywordEl.innerHTML = keywords.map((kw) => `<span>${escapeHtml(kw)}</span>`).join('');
  }
  const listEl = $('hs-industry-list');
  if (!listEl) return;
  if (!related.length) {
    listEl.innerHTML = `<li class="hs-industry-empty">当前实时榜暂无明显匹配，仍可参考下方全平台热榜。</li>`;
    return;
  }
  listEl.innerHTML = related.slice(0, 6).map((item) => {
    const platform = PLATFORM_CONFIG[item.platform]?.label || item.platform || '热点';
    return `<li>
      <span class="hs-industry-platform">${escapeHtml(platform)}</span>
      <span class="hs-industry-text">${escapeHtml(item.title || item.text || '')}</span>
      <span class="hs-industry-rank">#${Number(item.rank || 0) || '-'}</span>
    </li>`;
  }).join('');
}

function updateHotspotMeta() {
  let total = 0;
  for (const [platform, config] of Object.entries(PLATFORM_CONFIG)) {
    const items = hotspotLists[platform] || [];
    const status = hotspotMeta.status?.[platform] || {};
    total += items.length;
    const source = status.ok
      ? `${status.source || '实时'}${hotspotMeta.stale ? '缓存' : '数据'}`
      : '未配置';
    setText(config.updateId, `${source} · ${formatFetchedAt(hotspotMeta.fetchedAt)}`);
  }
  const bar = $('hs-bar-source');
  if (bar) {
    const ts = formatFetchedAt(hotspotMeta.fetchedAt);
    bar.textContent = `共 ${total} 条 · ${hotspotMeta.stale ? '缓存' : '实时'} · ${ts}`;
  }
}

async function refreshHotspots({ force = false } = {}) {
  try {
    const params = new URLSearchParams();
    if (force) params.set('refresh', '1');
    if (hotspotActive) params.set('viewed', '1');
    const industryId = document.body?.dataset?.industryTheme || document.documentElement?.dataset?.industryTheme || '';
    if (industryId) params.set('industry', industryId);
    const query = params.toString();
    const res = await fetch(apiUrl(`/hotspots${query ? `?${query}` : ''}`));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    for (const platform of Object.keys(PLATFORM_CONFIG)) {
      const list = data?.platforms?.[platform] || [];
      hotspotLists[platform] = Array.isArray(list)
        ? list.map(normalizeHotspotItem).filter(item => item.text).slice(0, 10)
        : [];
    }
    hotspotMeta = {
      source: 'hotspot-api',
      fetchedAt: data.fetchedAt,
      stale: !!data.stale,
      refreshMinutes: data.refreshMinutes || 30,
      status: data.status || {},
      industry: data.industry || null,
    };
    hasHotspotData = true;
    renderAllLists();
    renderIndustryFocus();
    updateHotspotMeta();
  } catch (err) {
    hotspotMeta = {
      ...hotspotMeta,
      stale: true,
    };
    updateHotspotMeta();
    console.warn('[Hotspot] 热榜刷新失败:', err.message);
  }
}

function startHotspotRefresh() {
  if (hotspotRefreshTimer) clearInterval(hotspotRefreshTimer);
  hotspotRefreshTimer = setInterval(() => {
    refreshHotspots().catch(() => {});
  }, (hotspotMeta.refreshMinutes || 30) * 60 * 1000);
}

function stopHotspotRefresh() {
  if (hotspotRefreshTimer) clearInterval(hotspotRefreshTimer);
  hotspotRefreshTimer = null;
}

// ── 实时时钟 ─────────────────────────────────────────────────────────────────

function updateClock() {
  const el = $('hs-clock');
  if (!el) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  el.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function startClock() {
  updateClock();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(updateClock, 1000);
}

function stopClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = null;
}

function replayHotspotBoot() {
  const panel = $('hotspot-panel');
  if (!panel) return;
  panel.classList.remove('hs-booting');
  void panel.offsetWidth;
  panel.classList.add('hs-booting');
}

// ── 模式切换 ─────────────────────────────────────────────────────────────────

function reportHotspotState(visible, source = 'brain-ui') {
  fetch(apiUrl('/hotspot-state'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: !!visible, source }),
  }).catch(() => {});
}

function setPanelVisible(visible, source = 'brain-ui') {
  hotspotActive = visible;
  document.body.classList.toggle('hotspot-mode', visible);
  if (!visible) $('hotspot-panel')?.classList.remove('hs-booting');

  const btn = document.getElementById('hotspot-btn');
  if (btn) btn.classList.toggle('active', visible);

  window.dispatchEvent(new CustomEvent('pulse:hotspot-mode', {
    detail: { active: visible },
  }));
  reportHotspotState(visible, source);
}

export function setHotspotMode(visible, { source = 'brain-ui' } = {}) {
  const nextVisible = !!visible;
  if (hotspotActive === nextVisible) {
    reportHotspotState(nextVisible, source);
    return;
  }

  if (!nextVisible) {
    setPanelVisible(false, source);
    stopClock();
    stopHotspotRefresh();
    restoreVoicePanel();
  } else {
    // 关闭其他媒体模式（互斥）
    if (document.body.classList.contains('video-mode'))
      document.body.classList.remove('video-mode');
    if (document.body.classList.contains('image-mode'))
      document.body.classList.remove('image-mode');
    if (document.body.classList.contains('music-mode'))
      document.body.classList.remove('music-mode');

    startClock();
    startHotspotRefresh();
    renderAllLists();
    renderIndustryFocus();
    updateHotspotMeta();
    setPanelVisible(true, source);
    replayHotspotBoot();
    refreshHotspots().catch(() => {});
    moveVoicePanelToBody();
  }
}

export function toggleHotspot(source = 'brain-ui') {
  setHotspotMode(!hotspotActive, { source });
}

// ── 初始化 ───────────────────────────────────────────────────────────────────

export async function initHotspot() {
  renderAllLists();
  renderIndustryFocus();
  updateHotspotMeta();
  refreshHotspots().catch(() => {});

  const exitBtn = $('hs-exit-btn');
  if (exitBtn) exitBtn.addEventListener('click', () => toggleHotspot());

  const refreshBtn = $('hs-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    if (refreshBtn.classList.contains('spinning')) return;
    refreshBtn.classList.add('spinning');
    refreshBtn.disabled = true;
    try {
      await refreshHotspots({ force: true });
    } finally {
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
      }, 600);
    }
  });
  window.addEventListener('pulse:industry-changed', () => {
    refreshHotspots({ force: true }).catch(() => {});
  });
  window.addEventListener('pulse:open-hotspot', () => {
    setHotspotMode(true, { source: 'today-view' });
  });
}
