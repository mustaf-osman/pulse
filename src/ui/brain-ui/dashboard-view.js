// 数据看板：从 /biz/today, /biz/distribution, /biz/followups, /customers
// 拉取数据，渲染 KPI、阶段分布条形图、最近活跃、长期未跟进
import { API } from "./api-client.js";

const REFRESH_MS = 60 * 1000;
const RECENT_DAYS = 14;
const STALE_DAYS = 7;
let timer = null;
let activePack = null;

function objectLabels() {
  const labels = activePack?.objectLabels || {};
  const pharma = activePack?.id === "pharma";
  return {
    singular: labels.singular || "客户",
    asset: labels.asset || "客户资产",
    contactStat: labels.contactStat || "今日联系",
    weekStat: labels.weekStat || "本周新增",
    staleRisk: labels.staleRisk || "需关注",
    heroTitle: labels.dashboardTitle || (pharma ? "课题数据看板" : "数据看板"),
    heroSub: labels.dashboardSub || (pharma ? "课题总量、阶段分布、资料更新和停滞风险" : "客户总量、阶段分布、跟进状态"),
    stageTitle: labels.stageTitle || (pharma ? "课题阶段分布" : "客户阶段分布"),
    followTitle: labels.followTitle || (pharma ? "课题推进概览" : "跟进状态概览"),
    followButton: labels.followButton || (pharma ? "进入课题推进 →" : "进入跟进 →"),
    recentTitle: labels.recentTitle || (pharma ? "最近更新课题" : "最近活跃客户"),
    recentMeta: labels.recentMeta || (pharma ? "近 14 天有资料更新的课题" : "近 14 天有更新的客户"),
    staleTitle: labels.staleTitle || (pharma ? "资料长期未更新" : "长期未跟进"),
    staleMeta: labels.staleMeta || (pharma ? "超过 7 天未更新，建议补文献或拆实验问题" : "超过 7 天未更新，优先处理"),
    emptyDistribution: labels.emptyDistribution || (pharma ? "暂无课题数据" : "暂无客户数据"),
    emptyRecent: labels.emptyRecent || (pharma ? "近 14 天没有课题更新" : "近 14 天没有客户互动"),
    emptyStale: labels.emptyStale || (pharma ? "没有长期未更新课题，状态健康" : "没有长期未跟进客户，状态健康"),
  };
}

async function refreshIndustryCopy() {
  const data = await fetchJson(`${API}/industry`);
  activePack = data?.activePack || null;
  applyCopy();
}

function applyCopy() {
  const labels = objectLabels();
  const heroEyebrow = document.querySelector("#dashboard-view .dashboard-hero-eyebrow");
  const heroTitle = document.querySelector("#dashboard-view .dashboard-hero-title");
  const heroSub = document.querySelector("#dashboard-view .dashboard-hero-sub");
  const totalLabel = document.querySelector("#dashboard-kpi-total")?.closest(".dashboard-kpi")?.querySelector(".dashboard-kpi-label");
  const totalSub = document.getElementById("dashboard-kpi-total-sub");
  const todayLabel = document.querySelector("#dashboard-kpi-today")?.closest(".dashboard-kpi")?.querySelector(".dashboard-kpi-label");
  const todaySub = document.querySelector("#dashboard-kpi-today")?.closest(".dashboard-kpi")?.querySelector(".dashboard-kpi-sub");
  const weekLabel = document.querySelector("#dashboard-kpi-week")?.closest(".dashboard-kpi")?.querySelector(".dashboard-kpi-label");
  const weekSub = document.querySelector("#dashboard-kpi-week")?.closest(".dashboard-kpi")?.querySelector(".dashboard-kpi-sub");
  const warnLabel = document.querySelector("#dashboard-kpi-warn")?.closest(".dashboard-kpi")?.querySelector(".dashboard-kpi-label");
  const stageTitle = document.querySelector(".dashboard-card-distribution .dashboard-card-title");
  const followTitle = document.querySelector(".dashboard-card-followups .dashboard-card-title");
  const followBtn = document.getElementById("dashboard-goto-followups");
  const recentTitle = document.querySelector(".dashboard-card-recent .dashboard-card-title");
  const recentMeta = document.querySelector(".dashboard-card-recent .dashboard-card-meta");
  const staleTitle = document.querySelector(".dashboard-card-stale .dashboard-card-title");
  const staleMeta = document.querySelector(".dashboard-card-stale .dashboard-card-meta");
  if (heroEyebrow) heroEyebrow.textContent = labels.asset;
  if (heroTitle) heroTitle.textContent = labels.heroTitle;
  if (heroSub) heroSub.textContent = labels.heroSub;
  if (totalLabel) totalLabel.textContent = `${labels.singular}总数`;
  if (totalSub) totalSub.textContent = `在册${labels.singular}`;
  if (todayLabel) todayLabel.textContent = labels.contactStat;
  if (todaySub) todaySub.textContent = activePack?.id === "pharma" ? "今天有资料更新的课题" : `今天有互动的${labels.singular}`;
  if (weekLabel) weekLabel.textContent = labels.weekStat;
  if (weekSub) weekSub.textContent = `近 7 天新增${labels.singular}`;
  if (warnLabel) warnLabel.textContent = labels.staleRisk;
  if (stageTitle) stageTitle.textContent = labels.stageTitle;
  if (followTitle) followTitle.textContent = labels.followTitle;
  if (followBtn) followBtn.textContent = labels.followButton;
  if (recentTitle) recentTitle.textContent = labels.recentTitle;
  if (recentMeta) recentMeta.textContent = labels.recentMeta;
  if (staleTitle) staleTitle.textContent = labels.staleTitle;
  if (staleMeta) staleMeta.textContent = labels.staleMeta;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(text ?? "");
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

function fmtRel(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const day = 24 * 3600 * 1000;
  if (diff < day) return "今天";
  return `${Math.floor(diff / day)} 天前`;
}

function pickName(c) {
  return c.displayName
    || c.fields?.company_name
    || c.fields?.shop_name
    || c.fields?.contact_person
    || c.id;
}

function renderKpis(today, followCounts) {
  setText("dashboard-kpi-total", today?.totalCustomers ?? 0);
  setText("dashboard-kpi-today", today?.todayContacted ?? 0);
  setText("dashboard-kpi-week", today?.weekNew ?? 0);
  const warn = (followCounts?.overdue || 0) + (followCounts?.stale || 0);
  setText("dashboard-kpi-warn", warn);
}

function renderDistribution(distribution) {
  const listEl = document.getElementById("dashboard-distribution-list");
  const metaEl = document.getElementById("dashboard-distribution-meta");
  if (!listEl) return;
  const items = Array.isArray(distribution?.items) ? distribution.items : [];
  const total = Number(distribution?.total) || items.reduce((s, x) => s + (x.count || 0), 0);
  if (metaEl) metaEl.textContent = total ? `共 ${total} 位` : "";
  if (!items.length) {
    listEl.innerHTML = `<li class="dashboard-distribution-empty">${esc(objectLabels().emptyDistribution)}</li>`;
    return;
  }
  const max = Math.max(...items.map((x) => x.count || 0), 1);
  listEl.innerHTML = items.map((it) => {
    const count = it.count || 0;
    const percent = total ? Math.round((count / total) * 100) : 0;
    const barWidth = Math.max(2, Math.round((count / max) * 100));
    return `<li class="dashboard-distribution-row">
      <span class="dashboard-distribution-label">${esc(it.stage)}</span>
      <span class="dashboard-distribution-bar"><span class="dashboard-distribution-bar-fill" style="width: ${barWidth}%"></span></span>
      <span class="dashboard-distribution-count">${count}</span>
      <span class="dashboard-distribution-percent">${percent}%</span>
    </li>`;
  }).join("");
}

function renderFollowupCounts(counts) {
  setText("dashboard-fb-overdue", counts?.overdue || 0);
  setText("dashboard-fb-today", counts?.today || 0);
  setText("dashboard-fb-week", counts?.week || 0);
  setText("dashboard-fb-stale", counts?.stale || 0);
}

function renderCustomerList(elId, items, opts = {}) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = `<li class="dashboard-customer-empty">${esc(opts.empty || "暂无")}</li>`;
    return;
  }
  el.innerHTML = items.slice(0, opts.limit || 8).map((c) => {
    const name = pickName(c);
    const stage = c.fields?.stage || "未分阶段";
    const contact = c.fields?.contact_person || "";
    const phone = c.fields?.contact_phone ? ` · ${c.fields.contact_phone}` : "";
    const industry = c.industryName
      ? `${c.industryIcon || ""} ${c.industryName}`.trim()
      : "";
    const time = fmtRel(c.updatedAt);
    const meta = [stage, contact ? contact + phone : "", industry, time].filter(Boolean).join(" · ");
    return `<li class="dashboard-customer-row" data-customer-id="${esc(c.id)}">
      <div class="dashboard-customer-name">${esc(name)}</div>
      <div class="dashboard-customer-meta">${esc(meta)}</div>
    </li>`;
  }).join("");
}

async function refresh() {
  const [today, distribution, followups, customersResp] = await Promise.all([
    fetchJson(`${API}/biz/today`),
    fetchJson(`${API}/biz/distribution`),
    fetchJson(`${API}/biz/followups`),
    fetchJson(`${API}/customers`),
  ]);

  renderKpis(today, followups?.counts);
  renderDistribution(distribution);
  renderFollowupCounts(followups?.counts);

  // 客户列表
  const all = Array.isArray(customersResp?.customers) ? customersResp.customers
    : Array.isArray(customersResp) ? customersResp : [];
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  const recent = all
    .filter((c) => {
      const t = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      return t && (now - t) <= RECENT_DAYS * day;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const TERMINAL = new Set(["签约", "长期合作", "已签约", "丢单", "关闭"]);
  const stale = all
    .filter((c) => {
      if (TERMINAL.has(c.fields?.stage)) return false;
      const t = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      return t && (now - t) > STALE_DAYS * day;
    })
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  const labels = objectLabels();
  renderCustomerList("dashboard-recent-list", recent, { empty: labels.emptyRecent });
  renderCustomerList("dashboard-stale-list", stale, { empty: labels.emptyStale });

  const updEl = document.getElementById("dashboard-updated-at");
  if (updEl) {
    const t = new Date();
    updEl.textContent = `已更新 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  }
}

function startTimer() {
  if (timer) return;
  timer = setInterval(() => {
    if (["dashboard", "business"].includes(document.body.getAttribute("data-active-view"))) {
      refresh();
    }
  }, REFRESH_MS);
}

export function initDashboardView() {
  const root = document.getElementById("dashboard-view");
  if (!root) return;
  refreshIndustryCopy().then(refresh);

  window.addEventListener("pulse:open-dashboard", () => refresh());
  window.addEventListener("pulse:view-changed", (e) => {
    if (e.detail?.view === "dashboard" || e.detail?.view === "business") refresh();
  });
  window.addEventListener("pulse:customers-changed", () => {
    if (["dashboard", "business"].includes(document.body.getAttribute("data-active-view"))) refresh();
  });
  window.addEventListener("pulse:industry-changed", () => {
    refreshIndustryCopy().then(() => {
      if (["dashboard", "business"].includes(document.body.getAttribute("data-active-view"))) refresh();
    });
  });

  document.getElementById("dashboard-refresh")?.addEventListener("click", () => refresh());
  document.getElementById("dashboard-goto-followups")?.addEventListener("click", () => {
    if (typeof window.pulseSetView === "function") window.pulseSetView("business");
    window.dispatchEvent(new CustomEvent("pulse:open-followups"));
    document.getElementById("followups-view")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // 客户行点击 → 跳到资料台编辑
  root.addEventListener("click", (e) => {
    const row = e.target.closest(".dashboard-customer-row");
    if (!row) return;
    window.dispatchEvent(new CustomEvent("pulse:open-org-workspace", { detail: { tab: "customer" } }));
  });

  if (["dashboard", "business"].includes(document.body.getAttribute("data-active-view"))) {
    refresh();
  }
  startTimer();
}
