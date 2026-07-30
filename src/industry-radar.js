import { getActivePack, getActiveIndustry, getPack } from './industry/loader.js'

const REFRESH_MINUTES = 20
const TIMEOUT_MS = 8000
const LIVE_TIMEOUT_MS = 3500
const USER_AGENT = 'Pulse/1.0 (+https://localhost)'
let _cache = new Map()

const FALLBACK = {
  tech: {
    hotspots: [
      { source: 'GitHub Trending', title: 'Agent 框架与 MCP 工具集开源潮', url: 'https://github.com/trending' },
      { source: 'Hacker News',     title: 'AI Coding 接管率与开发者效率讨论', url: 'https://news.ycombinator.com' },
      { source: 'Product Hunt',    title: '本周最新 AI SaaS 与开发者工具', url: 'https://www.producthunt.com' },
    ],
    opportunities: [
      { title: 'Agent 内部协作场景 PoC', hint: '面向 SaaS 客户提议从一个团队内部场景切入跑 Demo，2 周内能拿到反馈' },
      { title: 'AI Coding 上下游对比', hint: '给销售型客户做 Copilot vs Claude Code vs Cursor 对比图，触发预算讨论' },
      { title: '私有部署 LLM 替换需求', hint: '合规要求的客户上升，主动提"国产模型 + 本地推理"的提案' },
    ],
    trends: [
      { keyword: 'Agent', change: +0.42, period: '7d' },
      { keyword: 'MCP 协议', change: +1.20, period: '7d' },
      { keyword: 'RAG', change: -0.08, period: '7d' },
    ],
    competitors: null,
  },
  ecommerce: {
    hotspots: [
      { source: '微博热搜', title: '618 大促预热与品牌种草节奏', url: 'https://s.weibo.com/top/summary' },
      { source: '小红书',   title: '夏季新品笔记选题与达人合作' },
      { source: '淘宝',     title: '搜索词上涨与店铺活动承接节奏' },
    ],
    opportunities: [
      { title: '618 提前蓄水', hint: '给老客户发提前购券，30 天前是蓄水期最稳数据；可拉一份"高复购老客户"清单' },
      { title: '小红书素人种草', hint: '从老客户里挑 KOC 做转推，比投头部达人 ROI 高，且能拉自然流量' },
      { title: '淘宝搜索承接', hint: '围绕上涨搜索词调整标题、主图和活动利益点，优先承接高意向流量' },
    ],
    trends: [
      { keyword: '私域复购', change: +0.32, period: '7d' },
      { keyword: '直播带货', change: +0.18, period: '7d' },
      { keyword: '退货率', change: -0.05, period: '7d' },
    ],
    competitors: null,
  },
}

const DEFAULT_RADAR = {
  hotspots: [
    { source: '今日要闻', title: '请先在引导页选择行业，雷达会按行业拉取数据' },
  ],
  opportunities: [],
  trends: [],
  competitors: null,
}

function fromIndustryPack(pack) {
  if (!pack || !pack.radar || typeof pack.radar !== 'object') return null
  return {
    hotspots: Array.isArray(pack.radar.hotspots) ? pack.radar.hotspots : [],
    opportunities: Array.isArray(pack.radar.opportunities) ? pack.radar.opportunities : [],
    trends: Array.isArray(pack.radar.trends) ? pack.radar.trends : [],
    competitors: Array.isArray(pack.radar.competitors) ? pack.radar.competitors : null,
  }
}

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
}

function compactText(value = '') {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function softTimeout(promise, timeoutMs, fallbackValue) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallbackValue), timeoutMs)
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(fallbackValue)
      })
  })
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || TIMEOUT_MS)
  try {
    const res = await globalThis.fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json,text/html,text/plain,*/*',
        ...(options.headers || {}),
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function fetchGithubTrending() {
  const res = await fetchWithTimeout('https://github.com/trending?since=daily', {
    headers: { Accept: 'text/html,*/*' },
  })
  const html = await res.text()
  const out = []
  const articleRe = /<article[\s\S]*?<\/article>/gi
  const linkRe = /<h2[\s\S]*?<a[^>]+href="([^"]+)"[\s\S]*?<\/a>[\s\S]*?<\/h2>/i
  const descRe = /<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/i
  for (const article of html.match(articleRe) || []) {
    const link = article.match(linkRe)
    if (!link) continue
    const repo = compactText(link[1]).replace(/^\/+/, '')
    if (!repo) continue
    const desc = compactText(article.match(descRe)?.[1] || '')
    out.push({
      source: 'GitHub',
      title: desc ? `${repo} · ${desc}` : repo,
      url: `https://github.com/${repo}`,
    })
    if (out.length >= 3) break
  }
  return out
}

async function fetchHackerNews() {
  const idsRes = await fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json')
  const ids = await idsRes.json()
  const topIds = Array.isArray(ids) ? ids.slice(0, 8) : []
  const items = await Promise.allSettled(topIds.map(async (id) => {
    const itemRes = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    return itemRes.json()
  }))
  return items
    .map((r) => r.status === 'fulfilled' ? r.value : null)
    .filter((it) => it?.title)
    .slice(0, 3)
    .map((it) => ({
      source: 'HN',
      title: `${it.title}${Number.isFinite(it.score) ? ` · ${it.score} points` : ''}`,
      url: it.url || `https://news.ycombinator.com/item?id=${it.id}`,
    }))
}

async function fetchWeiboHotSearch() {
  const res = await fetchWithTimeout('https://weibo.com/ajax/side/hotSearch', {
    headers: {
      Referer: 'https://weibo.com/',
      Accept: 'application/json,text/plain,*/*',
    },
  })
  const data = await res.json()
  const list = Array.isArray(data?.data?.realtime) ? data.data.realtime : []
  return list
    .filter((it) => it?.word || it?.note)
    .slice(0, 3)
    .map((it) => {
      const title = it.note || it.word || ''
      const scheme = it.word_scheme || it.word || title
      return {
        source: '微博',
        title,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(scheme)}`,
      }
    })
}

async function fetchV2EXHot() {
  const res = await fetchWithTimeout('https://www.v2ex.com/api/topics/hot.json', {
    headers: { Accept: 'application/json,*/*' },
  })
  const list = await res.json()
  if (!Array.isArray(list)) return []
  return list
    .filter((it) => it && it.title)
    .slice(0, 3)
    .map((it) => ({
      source: 'V2EX',
      title: compactText(it.title).slice(0, 80),
      url: it.url || `https://www.v2ex.com/t/${it.id}`,
    }))
}

async function fetchBaiduHot() {
  const res = await fetchWithTimeout('https://top.baidu.com/api/board?platform=wise&tab=realtime', {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      Referer: 'https://top.baidu.com/',
    },
  })
  const data = await res.json()
  const cards = Array.isArray(data?.data?.cards) ? data.data.cards : []
  const items = []
  for (const card of cards) {
    if (!Array.isArray(card?.content)) continue
    for (const it of card.content) {
      const title = compactText(it?.word || it?.query || '')
      if (!title) continue
      items.push({
        source: '百度',
        title: title.slice(0, 80),
        url: it?.url || `https://www.baidu.com/s?wd=${encodeURIComponent(title)}`,
      })
      if (items.length >= 3) return items
    }
  }
  return items
}

function trendFromLive(industryId, liveHotspots, fallbackTrends) {
  if (!liveHotspots.length) return fallbackTrends
  if (industryId === 'tech') {
    const hasGithub = liveHotspots.some((it) => it.source === 'GitHub')
    const hasHN = liveHotspots.some((it) => it.source === 'HN')
    const hasV2EX = liveHotspots.some((it) => it.source === 'V2EX')
    return [
      { keyword: '开源项目', change: hasGithub ? 0.38 : 0.16, period: '7d' },
      { keyword: 'AI / Agent', change: hasHN ? 0.31 : 0.18, period: '7d' },
      { keyword: '中文技术讨论', change: hasV2EX ? 0.24 : 0.10, period: '7d' },
      ...(fallbackTrends || []).slice(0, 1),
    ]
  }
  if (industryId === 'ecommerce') {
    const hasWeibo = liveHotspots.some((it) => it.source === '微博')
    const hasBaidu = liveHotspots.some((it) => it.source === '百度')
    return [
      { keyword: '微博热搜', change: hasWeibo ? 0.30 : 0.12, period: '7d' },
      { keyword: '百度热搜', change: hasBaidu ? 0.24 : 0.10, period: '7d' },
      { keyword: '大促内容', change: 0.22, period: '7d' },
      ...(fallbackTrends || []).slice(0, 1),
    ]
  }
  return fallbackTrends
}

function mergeHotspotItems(primary = [], fallback = [], limit = 3) {
  const out = []
  const seen = new Set()
  for (const item of [...primary, ...fallback]) {
    const title = String(item?.title || '').trim()
    if (!title) continue
    const key = `${item.source || ''}:${title}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

async function fetchLiveRadar(industryId) {
  if (industryId === 'tech') {
    const [github, hn, v2ex] = await Promise.allSettled([
      fetchGithubTrending(),
      fetchHackerNews(),
      fetchV2EXHot(),
    ])
    const githubItems = github.status === 'fulfilled' ? github.value : []
    const hnItems = hn.status === 'fulfilled' ? hn.value : []
    const v2exItems = v2ex.status === 'fulfilled' ? v2ex.value : []
    return [
      ...githubItems.slice(0, 1),
      ...hnItems.slice(0, 1),
      ...v2exItems.slice(0, 1),
    ]
  }
  if (industryId === 'ecommerce') {
    const [weibo, baidu] = await Promise.allSettled([
      fetchWeiboHotSearch(),
      fetchBaiduHot(),
    ])
    const weiboItems = weibo.status === 'fulfilled' ? weibo.value : []
    const baiduItems = baidu.status === 'fulfilled' ? baidu.value : []
    return [
      ...weiboItems.slice(0, 2),
      ...baiduItems.slice(0, 1),
    ]
  }
  return []
}

async function buildRadarPayload(industryId) {
  const pack = industryId ? getPack(industryId) : getActivePack()
  const id = pack?.id || industryId || ''
  const fromPack = fromIndustryPack(pack)
  const fallback = FALLBACK[id] || DEFAULT_RADAR
  const liveHotspots = await softTimeout(fetchLiveRadar(id), LIVE_TIMEOUT_MS, [])
  const fallbackHotspots = fromPack?.hotspots?.length ? fromPack.hotspots : fallback.hotspots

  const merged = {
    hotspots: mergeHotspotItems(liveHotspots, fallbackHotspots),
    opportunities: fromPack?.opportunities?.length ? fromPack.opportunities : fallback.opportunities,
    trends: trendFromLive(id, liveHotspots, fromPack?.trends?.length ? fromPack.trends : fallback.trends),
    competitors: fromPack?.competitors ?? fallback.competitors,
  }

  return {
    ok: true,
    industry: pack ? { id: pack.id, name: pack.name, icon: pack.icon } : null,
    refreshMinutes: REFRESH_MINUTES,
    fetchedAt: new Date().toISOString(),
    ...merged,
  }
}

export async function getIndustryRadar({ industryId = null, force = false } = {}) {
  const id = industryId || getActiveIndustry() || ''
  const now = Date.now()
  const cached = _cache.get(id)
  if (!force && cached && now - cached.fetchedAtMs < REFRESH_MINUTES * 60 * 1000) {
    return cached.data
  }
  const data = await buildRadarPayload(id)
  _cache.set(id, { data, fetchedAtMs: now })
  return data
}

export function clearIndustryRadarCache(industryId = null) {
  if (industryId) _cache.delete(industryId)
  else _cache.clear()
}
