import { apiUrl } from "./api-client.js";

const REFRESH_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;
let timer = null;
let activeIndustry = null;
let lastFastlane = { followups: 0, taskActive: false, taskTitle: "" };

const CLIENT_FALLBACK = {
  tech: {
    hotspots: [
      { source: "GitHub", title: "Agent 框架与 MCP 工具集开源潮", url: "https://github.com/trending" },
      { source: "HN",     title: "AI Coding 接管率与开发者效率讨论", url: "https://news.ycombinator.com" },
      { source: "PH",     title: "本周最新 AI SaaS 与开发者工具", url: "https://www.producthunt.com" },
    ],
    opportunities: [
      { title: "Agent 内部协作场景 PoC", hint: "面向 SaaS 客户从一个团队场景切入跑 Demo，2 周内拿到反馈" },
      { title: "AI Coding 上下游对比", hint: "给销售型客户做 Copilot vs Cursor vs Claude Code 对比，触发预算讨论" },
      { title: "私有部署 LLM 替换需求", hint: "合规客户上升，主动提国产模型 + 本地推理方案" },
    ],
    trends: [
      { keyword: "Agent",    change: 0.42 },
      { keyword: "MCP 协议", change: 1.20 },
      { keyword: "RAG",      change: -0.08 },
    ],
  },
  ecommerce: {
    hotspots: [
      { source: "微博",   title: "618 大促预热与品牌种草节奏", url: "https://s.weibo.com/top/summary" },
      { source: "小红书", title: "夏季新品笔记选题与达人合作" },
      { source: "淘宝",   title: "搜索词上涨与店铺活动承接节奏" },
    ],
    opportunities: [
      { title: "618 提前蓄水", hint: "给老客户发提前购券，30 天前是蓄水期最稳数据" },
      { title: "小红书素人种草", hint: "从老客户里挑 KOC 做转推，比头部达人 ROI 更高" },
      { title: "淘宝搜索承接", hint: "围绕上涨搜索词调整标题、主图、活动利益点" },
    ],
    trends: [
      { keyword: "私域复购", change: 0.32 },
      { keyword: "直播带货", change: 0.18 },
      { keyword: "退货率",   change: -0.05 },
    ],
  },
  pharma: {
    hotspots: [
      { source: "文献线索", title: "公开药学论文常见结构：背景、方法、结果、局限、延伸课题" },
      { source: "学习提醒", title: "精读时优先抽取疾病-靶点-药物-指标证据链" },
      { source: "合规边界", title: "实验设计只输出教学/组会讨论级框架，不给危险操作指令" },
    ],
    opportunities: [
      { title: "待补充研究背景", hint: "建议补充疾病背景、现有治疗、未满足需求和同类研究。" },
      { title: "待确认研究假设", hint: "把问题改写成可验证假设，并标注需要老师/导师确认的点。" },
      { title: "待整理实验变量", hint: "明确自变量、因变量、对照、关键检测指标和失败风险。" },
    ],
    trends: [
      { keyword: "文献结构", change: 0.28 },
      { keyword: "机制链", change: 0.18 },
      { keyword: "实验合规", change: 0.12 },
    ],
  },
};

function getClientFallback() {
  const id = activeIndustry?.id || "";
  return CLIENT_FALLBACK[id] || { hotspots: [], opportunities: [], trends: [] };
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function host() {
  return document.getElementById("biz-board");
}

async function fetchJson(path, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(apiUrl(path), { signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function copy() {
  const id = activeIndustry?.id || "";
  const name = activeIndustry?.name || "行业";
  if (id === "ecommerce") return { workspaceTitle: "电商工作台", workspaceSub: "聚焦店铺增长、客户复购、售后风险和日常跟进", radarTitle: `行业雷达 · ${name}` };
  if (id === "tech")      return { workspaceTitle: "科技工作台", workspaceSub: "聚焦线索推进、Demo 跟进、POC 交付和方案销售",   radarTitle: `行业雷达 · ${name}` };
  if (id === "pharma")    return { workspaceTitle: "药学科研训练", workspaceSub: "文献精读、课题孵化、实验设计和安全合规辅助", radarTitle: "科研任务辅助" };
  return { workspaceTitle: "行业工作台", workspaceSub: "按当前行业独立管理客户与业务上下文", radarTitle: `行业雷达 · ${name}` };
}

function shell() {
  const c = copy();
  return `
<div class="radar-header">
  <div class="radar-header-main">
    <div class="radar-header-title" id="radar-title">${esc(c.radarTitle)}</div>
    <div class="radar-header-sub" id="radar-sub">${activeIndustry?.id === "pharma" ? "当前任务 · 证据与风险" : "今日 · 各平台摘要"}</div>
  </div>
  <button type="button" class="radar-refresh-btn" id="radar-refresh" title="刷新雷达数据" aria-label="刷新">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/></svg>
  </button>
</div>

<div class="radar-card" data-section="hotspots">
  <div class="radar-card-head">
    <span class="radar-card-icon">${activeIndustry?.id === "pharma" ? "�" : "�"}</span>
    <span class="radar-card-title">${activeIndustry?.id === "pharma" ? "文献与证据链" : "今日热点"}</span>
    <span class="radar-card-meta" id="radar-hotspots-meta"></span>
  </div>
  <ul class="radar-list radar-hotspots" id="radar-hotspots-list">
    <li class="radar-empty">加载中…</li>
  </ul>
</div>

<div class="radar-card" data-section="opportunities">
  <div class="radar-card-head">
    <span class="radar-card-icon">${activeIndustry?.id === "pharma" ? "🧭" : "💡"}</span>
    <span class="radar-card-title">${activeIndustry?.id === "pharma" ? "待补充问题" : "商机提醒"}</span>
  </div>
  <ul class="radar-list radar-opportunities" id="radar-opportunities-list">
    <li class="radar-empty">加载中…</li>
  </ul>
</div>

<div class="radar-card" data-section="trends">
  <div class="radar-card-head">
    <span class="radar-card-icon">${activeIndustry?.id === "pharma" ? "✅" : "📈"}</span>
    <span class="radar-card-title">${activeIndustry?.id === "pharma" ? "输出进度" : "趋势指数"}</span>
    <span class="radar-card-meta">${activeIndustry?.id === "pharma" ? "训练" : "7 天"}</span>
  </div>
  <ul class="radar-list radar-trends" id="radar-trends-list">
    <li class="radar-empty">加载中…</li>
  </ul>
</div>

<div class="radar-card" data-section="competitors" id="radar-competitors-card" hidden>
  <div class="radar-card-head">
    <span class="radar-card-icon">🎯</span>
    <span class="radar-card-title">竞品动态</span>
  </div>
  <ul class="radar-list radar-competitors" id="radar-competitors-list"></ul>
</div>

<div class="biz-fastlane" id="biz-fastlane" data-action="open-customers" role="button" tabindex="0">
  <div class="biz-fastlane-row">
    <span class="biz-fastlane-icon">${activeIndustry?.id === "pharma" ? "📝" : "👥"}</span>
    <span class="biz-fastlane-text" id="biz-fastlane-text">${activeIndustry?.id === "pharma" ? "今日待推进 0 个课题" : "今日要跟进 0 人"}</span>
    <span class="biz-fastlane-cta">查看 →</span>
  </div>
  <div class="biz-fastlane-row biz-fastlane-task" id="biz-fastlane-task" hidden>
    <span class="biz-fastlane-icon">📌</span>
    <span class="biz-fastlane-text" id="biz-fastlane-task-text">暂无进行中的任务</span>
  </div>
</div>
`;
}

function casualShell() {
  return `
<div class="casual-board">
  <section class="casual-hero">
    <div class="casual-kicker">现在是闲聊模式</div>
    <div class="casual-title">想到什么，慢慢说就行</div>
    <div class="casual-sub">不催进度、不评价，也不会读你的客户。挑一句开始，或者直接在下面打字也可以。</div>
  </section>
  <div class="casual-notes">
    <button type="button" class="casual-note" data-casual-send="今天有点说不出来的累，能陪我聊聊吗？">
      <span class="casual-note-emoji">☕</span>
      <span class="casual-note-text">今天有点说不出来的累，能陪我聊聊吗？</span>
    </button>
    <button type="button" class="casual-note" data-casual-send="想被陪着随便聊一会儿，从我今天的状态开始就好。">
      <span class="casual-note-emoji">�</span>
      <span class="casual-note-text">想被陪着随便聊一会儿。</span>
    </button>
    <button type="button" class="casual-note" data-casual-send="有件小事卡在心里，但我不太知道从哪儿开口，你能温柔地问我两句吗？">
      <span class="casual-note-emoji">🪶</span>
      <span class="casual-note-text">有件小事想说，但不知道怎么开口。</span>
    </button>
    <button type="button" class="casual-note" data-casual-send="帮我把脑子里乱乱的想法慢慢整理成几句话。">
      <span class="casual-note-emoji">🌿</span>
      <span class="casual-note-text">帮我把乱乱的想法慢慢理顺。</span>
    </button>
  </div>
  <div class="casual-foot">点便签会替你发出去。也可以直接在下面输入框写。</div>
</div>`;
}

function renderShell() {
  const h = host();
  if (!h) return;
  const mode = activeIndustry?.id ? "industry" : "casual";
  if (h.dataset.mode === mode) return;
  h.innerHTML = mode === "industry" ? shell() : casualShell();
  h.dataset.mode = mode;
}

function renderHotspots(items) {
  const ul = document.getElementById("radar-hotspots-list");
  if (!ul) return;
  if (!Array.isArray(items) || items.length === 0) {
    ul.innerHTML = `<li class="radar-empty">暂无热点</li>`;
    return;
  }
  ul.innerHTML = items.slice(0, 3).map((it) => {
    const src = esc(it.source || "");
    const title = esc(String(it.title || it.text || "").slice(0, 80));
    const url = it.url ? esc(it.url) : "";
    const titleHtml = url
      ? `<a class="radar-hotspot-link" href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : title;
    return `<li class="radar-hotspot-item">
      <span class="radar-source-tag">${src}</span>
      <span class="radar-hotspot-title">${titleHtml}</span>
    </li>`;
  }).join("");
}

function renderOpportunities(items) {
  const ul = document.getElementById("radar-opportunities-list");
  if (!ul) return;
  if (!Array.isArray(items) || items.length === 0) {
    ul.innerHTML = `<li class="radar-empty">暂无商机提醒</li>`;
    return;
  }
  ul.innerHTML = items.slice(0, 3).map((it) => {
    const title = esc(String(it.title || "").slice(0, 40));
    const hint = esc(String(it.hint || "").slice(0, 100));
    return `<li class="radar-opp-item">
      <div class="radar-opp-title">${title}</div>
      ${hint ? `<div class="radar-opp-hint">${hint}</div>` : ""}
    </li>`;
  }).join("");
}

function renderTrends(items) {
  const ul = document.getElementById("radar-trends-list");
  if (!ul) return;
  if (!Array.isArray(items) || items.length === 0) {
    ul.innerHTML = `<li class="radar-empty">暂无趋势数据</li>`;
    return;
  }
  ul.innerHTML = items.slice(0, 4).map((it) => {
    const kw = esc(String(it.keyword || "").slice(0, 24));
    const change = Number(it.change);
    const isUp = change > 0;
    const isDown = change < 0;
    const tone = isUp ? "up" : isDown ? "down" : "flat";
    const arrow = isUp ? "↑" : isDown ? "↓" : "·";
    const pct = Number.isFinite(change) ? `${arrow}${Math.round(Math.abs(change) * 100)}%` : "—";
    return `<li class="radar-trend-item" data-tone="${tone}">
      <span class="radar-trend-kw">${kw}</span>
      <span class="radar-trend-pct">${pct}</span>
    </li>`;
  }).join("");
}

function renderCompetitors(items) {
  const card = document.getElementById("radar-competitors-card");
  const ul = document.getElementById("radar-competitors-list");
  if (!card || !ul) return;
  if (!Array.isArray(items) || items.length === 0) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  ul.innerHTML = items.slice(0, 3).map((it) => {
    const name = esc(String(it.name || "").slice(0, 24));
    const action = esc(String(it.action || "").slice(0, 80));
    const when = esc(String(it.when || "").slice(0, 16));
    return `<li class="radar-comp-item">
      <div class="radar-comp-name">${name}</div>
      <div class="radar-comp-action">${action}</div>
      ${when ? `<div class="radar-comp-when">${when}</div>` : ""}
    </li>`;
  }).join("");
}

function renderRadarFallback() {
  const fb = getClientFallback();
  renderHotspots(fb.hotspots);
  renderOpportunities(fb.opportunities);
  renderTrends(fb.trends);
  renderCompetitors(null);
  const meta = document.getElementById("radar-hotspots-meta");
  if (meta) meta.textContent = "离线";
}

function applyCopy() {
  if (!activeIndustry?.id) {
    const map = {
      "workspace-overview-title": "闲聊模式",
      "workspace-overview-sub": "通用对话、想法整理、日常问答和个人陪伴。",
    };
    for (const [id, txt] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    }
    const status = document.getElementById("workspace-overview-status");
    if (status) status.textContent = "通用";
    return;
  }
  const c = copy();
  const map = {
    "workspace-overview-title": c.workspaceTitle,
    "workspace-overview-sub": c.workspaceSub,
    "radar-title": c.radarTitle,
  };
  for (const [id, txt] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }
  const status = document.getElementById("workspace-overview-status");
  if (status) status.textContent = activeIndustry?.id === "pharma"
    ? "训练中"
    : activeIndustry?.name ? `${activeIndustry.name}模块` : "已就绪";
}

function applyTodayStats(today) {
  const map = {
    "biz-today-contacted": today?.todayContacted,
    "biz-week-new": today?.weekNew,
  };
  for (const [id, val] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.textContent = Number.isFinite(val) ? String(val) : "—";
  }
  if (Number.isFinite(today?.totalMemories)) {
    const nc = document.getElementById("node-count");
    if (nc) nc.textContent = String(today.totalMemories);
  }
}

function renderFastlane() {
  const text = document.getElementById("biz-fastlane-text");
  if (text) text.textContent = activeIndustry?.id === "pharma"
    ? `今日待推进 ${lastFastlane.followups} 个课题`
    : `今日要跟进 ${lastFastlane.followups} 人`;
  const taskRow = document.getElementById("biz-fastlane-task");
  const taskText = document.getElementById("biz-fastlane-task-text");
  if (taskRow && taskText) {
    if (lastFastlane.taskActive && lastFastlane.taskTitle) {
      taskRow.hidden = false;
      taskText.textContent = String(lastFastlane.taskTitle).slice(0, 48);
    } else {
      taskRow.hidden = true;
    }
  }
}

async function loadToday() {
  try {
    const data = await fetchJson(`/biz/today`, { timeoutMs: 5000 });
    if (!data || data.ok === false) return;
    applyTodayStats(data);
    lastFastlane.followups = Array.isArray(data.followups) ? data.followups.length : 0;
    renderFastlane();
  } catch {}
}

async function loadTask() {
  try {
    const data = await fetchJson(`/task`, { timeoutMs: 5000 });
    const task = data?.task || "";
    lastFastlane.taskActive = !!task;
    lastFastlane.taskTitle = task;
    renderFastlane();
  } catch {}
}

async function loadRadar({ force = false } = {}) {
  if (activeIndustry?.id === "pharma") {
    renderRadarFallback();
    return;
  }
  try {
    const params = new URLSearchParams();
    if (activeIndustry?.id) params.set("industry", activeIndustry.id);
    if (force) params.set("refresh", "1");
    const qs = params.toString();
    const data = await fetchJson(`/industry-radar${qs ? `?${qs}` : ""}`);
    if (!data || data.ok === false) {
      renderRadarFallback();
      return;
    }
    renderHotspots(data.hotspots || []);
    renderOpportunities(data.opportunities || []);
    renderTrends(data.trends || []);
    renderCompetitors(data.competitors);
    const meta = document.getElementById("radar-hotspots-meta");
    if (meta && data.fetchedAt) {
      try {
        const d = new Date(data.fetchedAt);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        meta.textContent = `${hh}:${mm}`;
      } catch {}
    }
  } catch {
    renderRadarFallback();
  }
}

function refreshAll({ force = false } = {}) {
  if (!activeIndustry?.id) return;
  loadToday();
  loadTask();
  loadRadar({ force });
}

export async function initBizBoard() {
  const h = host();
  if (!h) return;
  if (!h.dataset.mounted) {
    h.dataset.mounted = "1";
    h.addEventListener("click", (ev) => {
      const casualSendBtn = ev.target.closest("[data-casual-send]");
      if (casualSendBtn) {
        const input = document.getElementById("msg-input");
        const sendBtn = document.getElementById("send-btn");
        const prompt = casualSendBtn.getAttribute("data-casual-send") || "";
        window.pulseSetView?.("chat");
        setTimeout(() => {
          if (!input) return;
          input.value = prompt;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
          }
        }, 60);
        return;
      }
      const casualCard = ev.target.closest("[data-casual-prompt]");
      if (casualCard) {
        const input = document.getElementById("msg-input");
        const prompt = casualCard.getAttribute("data-casual-prompt") || "";
        window.pulseSetView?.("chat");
        setTimeout(() => {
          if (input) {
            input.value = prompt;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.focus();
          }
        }, 50);
        return;
      }
      const refreshBtn = ev.target.closest("#radar-refresh");
      if (refreshBtn) {
        refreshBtn.classList.add("spinning");
        loadRadar({ force: true }).finally(() => setTimeout(() => refreshBtn.classList.remove("spinning"), 400));
        return;
      }
      const fastlane = ev.target.closest("#biz-fastlane");
      if (fastlane) {
        window.dispatchEvent(new CustomEvent("pulse:open-org-workspace", { detail: { tab: "customer" } }));
        return;
      }
    });
    h.addEventListener("keydown", (ev) => {
      if (ev.target?.id === "biz-fastlane" && (ev.key === "Enter" || ev.key === " ")) {
        ev.preventDefault();
        window.dispatchEvent(new CustomEvent("pulse:open-org-workspace", { detail: { tab: "customer" } }));
      }
    });
  }

  try {
    const data = await fetchJson(`/industry`, { timeoutMs: 5000 });
    activeIndustry = data?.activePack || null;
    renderShell();
    applyCopy();
  } catch {
    renderShell();
    applyCopy();
  }

  refreshAll();
  if (timer) clearInterval(timer);
  timer = setInterval(() => refreshAll(), REFRESH_MS);

  window.addEventListener("pulse:industry-changed", (event) => {
    activeIndustry = event?.detail?.activePack || null;
    renderShell();
    applyCopy();
    refreshAll({ force: true });
  });

  ["pulse:customers-changed", "pulse:org-profile-changed"].forEach((evt) => {
    window.addEventListener(evt, () => loadToday());
  });
}

export function handleBizTaskEvent(type, data) {
  if (!document.getElementById("biz-fastlane-task")) return;
  if (type === "task_set") {
    lastFastlane.taskActive = !!(data?.task);
    lastFastlane.taskTitle = data?.task || "";
    renderFastlane();
  } else if (type === "task_step_updated") {
    loadTask();
  } else if (type === "task_cleared") {
    lastFastlane.taskActive = false;
    lastFastlane.taskTitle = "";
    renderFastlane();
  }
}
