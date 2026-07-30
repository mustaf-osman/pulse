// 跟进列表视图：从 /biz/followups 拉取分组数据，渲染列表，支持写跟进记录
import { API } from "./api-client.js";

const REFRESH_MS = 60 * 1000;
let timer = null;
let modalCustomerId = null;
let activePack = null;

function labels() {
  const copy = activePack?.objectLabels || {};
  return {
    singular: copy.singular || "客户",
    profile: copy.profile || "资料",
    followup: copy.followup || "待跟进",
    followupTitle: copy.followupTitle || (activePack?.id === "pharma" ? "课题推进" : "跟进列表"),
    followupSub: copy.followupSub || (activePack?.id === "pharma" ? "资料到期、实验规划、本周任务、长期未更新 · 在这里一眼看完" : "今日到期、逾期未跟进、本周计划、长期未动 · 在这里一眼看完"),
    overdueTitle: copy.overdueTitle || (activePack?.id === "pharma" ? "资料逾期" : "逾期未跟进"),
    todayTitle: copy.todayTitle || (activePack?.id === "pharma" ? "今日推进" : "今日到期"),
    weekTitle: copy.weekTitle || (activePack?.id === "pharma" ? "本周研究计划" : "本周计划"),
    staleTitle: copy.staleTitle || (activePack?.id === "pharma" ? "长期未更新" : "长期未动"),
    action: copy.followupAction || (activePack?.id === "pharma" ? "写研究记录" : "写跟进"),
    modalTitle: copy.modalTitle || (activePack?.id === "pharma" ? "写研究记录" : "写跟进记录"),
    noteLabel: copy.noteLabel || (activePack?.id === "pharma" ? "本次研究记录" : "本次跟进记录"),
    notePlaceholder: copy.notePlaceholder || (activePack?.id === "pharma" ? "今天补充了什么文献、假设、实验思路或导师反馈…" : "今天跟进了什么、客户反馈是什么…"),
    nextLabel: copy.nextLabel || (activePack?.id === "pharma" ? "下次推进日期" : "下次跟进日期"),
    stageLabel: copy.stageLabel || (activePack?.id === "pharma" ? "课题阶段（选填）" : "跟进阶段（选填）"),
    stagePlaceholder: copy.stagePlaceholder || (activePack?.id === "pharma" ? "例如：资料调研 / 方案设计 / 实验规划" : "例如：Demo / POC / 报价"),
    submit: copy.submit || (activePack?.id === "pharma" ? "保存研究记录" : "保存跟进"),
    fallbackName: copy.unnamed || "客户",
  };
}

async function refreshIndustryCopy() {
  const data = await fetchJson(`${API}/industry`);
  activePack = data?.activePack || null;
  applyCopy();
}

function applyCopy() {
  const copy = labels();
  setText("followups-hero-eyebrow", activePack?.id === "pharma" ? "课题推进" : "今日跟进");
  document.querySelector(".followups-hero-title")?.replaceChildren(document.createTextNode(copy.followupTitle));
  document.querySelector(".followups-hero-sub")?.replaceChildren(document.createTextNode(copy.followupSub));
  setText("followups-list-count-overdue", document.getElementById("followups-list-count-overdue")?.textContent || "0");
  const groupTitles = {
    overdue: copy.overdueTitle,
    today: copy.todayTitle,
    week: copy.weekTitle,
    stale: copy.staleTitle,
  };
  for (const [group, title] of Object.entries(groupTitles)) {
    const el = document.querySelector(`.followups-group-${group} .followups-group-title`);
    if (el) el.textContent = title;
  }
  const noteLabel = document.querySelector('label[for="followups-modal-note"]');
  const nextLabel = document.querySelector('label[for="followups-modal-next"]');
  const stageLabel = document.querySelector('label[for="followups-modal-stage"]');
  const noteEl = document.getElementById("followups-modal-note");
  const stageEl = document.getElementById("followups-modal-stage");
  const submitBtn = document.getElementById("followups-modal-submit");
  if (noteLabel) noteLabel.textContent = copy.noteLabel;
  if (nextLabel) nextLabel.textContent = copy.nextLabel;
  if (stageLabel) stageLabel.textContent = copy.stageLabel;
  if (noteEl) noteEl.placeholder = copy.notePlaceholder;
  if (stageEl) stageEl.placeholder = copy.stagePlaceholder;
  if (submitBtn) submitBtn.textContent = copy.submit;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return sameYear ? md : `${d.getFullYear()}-${md}`;
}

function relTime(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const day = 24 * 3600 * 1000;
  if (diff < day) return "今天";
  const days = Math.floor(diff / day);
  return `${days} 天前`;
}

async function fetchJson(url, opts) {
  try {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(text ?? "");
}

function renderItem(item, group) {
  const copy = labels();
  const stage = item.stage ? `<span class="followups-item-stage">${esc(item.stage)}</span>` : "";
  const contact = item.contact
    ? `<span class="followups-item-contact">${esc(item.contact)}${item.phone ? ` · ${esc(item.phone)}` : ""}</span>`
    : "";
  const industry = item.industryName
    ? `<span class="followups-item-industry">${esc(item.industryIcon || "")} ${esc(item.industryName)}</span>`
    : "";

  let timeChip = "";
  if (group === "stale") {
    timeChip = `<span class="followups-item-time">${item.staleDays} 天没动</span>`;
  } else if (item.nextFollowAt) {
    const d = new Date(item.nextFollowAt);
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;
    const dayDiff = Math.round((d.getTime() - now) / dayMs);
    let label = fmtDate(item.nextFollowAt);
    if (group === "overdue") label = `逾期 ${Math.abs(dayDiff) || 0} 天`;
    else if (group === "today") label = "今天";
    else if (group === "week" && dayDiff > 0) label = `${dayDiff} 天后`;
    timeChip = `<span class="followups-item-time">${esc(label)}</span>`;
  } else if (item.updatedAt) {
    timeChip = `<span class="followups-item-time">${esc(relTime(item.updatedAt))}</span>`;
  }

  return `<li class="followups-item" data-customer-id="${esc(item.id)}">
    <div class="followups-item-head">
      <span class="followups-item-name">${esc(item.name)}</span>
      ${stage}
      ${timeChip}
    </div>
    <div class="followups-item-meta">
      ${contact}
      ${industry}
    </div>
    <div class="followups-item-actions">
      <button type="button" class="followups-btn followups-btn-primary" data-action="follow-up" data-id="${esc(item.id)}" data-name="${esc(item.name)}">${esc(copy.action)}</button>
      <button type="button" class="followups-btn followups-btn-ghost" data-action="open-customer" data-id="${esc(item.id)}">看${esc(copy.profile)}</button>
    </div>
  </li>`;
}

function renderGroup(elId, items, group) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = `<li class="followups-list-empty">暂无</li>`;
    return;
  }
  el.innerHTML = items.map((it) => renderItem(it, group)).join("");
}

async function refresh() {
  const data = await fetchJson(`${API}/biz/followups`);
  if (!data?.ok) {
    document.querySelectorAll(".followups-list").forEach((el) => {
      el.innerHTML = `<li class="followups-list-empty">加载失败，稍后重试</li>`;
    });
    return;
  }
  const counts = data.counts || {};
  setText("followups-count-overdue", counts.overdue || 0);
  setText("followups-count-today", counts.today || 0);
  setText("followups-count-week", counts.week || 0);
  setText("followups-count-stale", counts.stale || 0);
  setText("followups-list-count-overdue", counts.overdue || 0);
  setText("followups-list-count-today", counts.today || 0);
  setText("followups-list-count-week", counts.week || 0);
  setText("followups-list-count-stale", counts.stale || 0);

  renderGroup("followups-list-overdue", data.overdue, "overdue");
  renderGroup("followups-list-today", data.today, "today");
  renderGroup("followups-list-week", data.week, "week");
  renderGroup("followups-list-stale", data.stale, "stale");

  const updEl = document.getElementById("followups-updated-at");
  if (updEl) {
    const t = new Date();
    updEl.textContent = `已更新 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  }
}

function openModal(customerId, customerName) {
  const copy = labels();
  modalCustomerId = customerId;
  const modal = document.getElementById("followups-modal");
  const titleEl = document.getElementById("followups-modal-title");
  const noteEl = document.getElementById("followups-modal-note");
  const nextEl = document.getElementById("followups-modal-next");
  const stageEl = document.getElementById("followups-modal-stage");
  const fbEl = document.getElementById("followups-modal-feedback");
  if (!modal) return;
  if (titleEl) titleEl.textContent = `${copy.modalTitle} · ${customerName}`;
  if (noteEl) noteEl.value = "";
  if (nextEl) nextEl.value = "";
  if (stageEl) stageEl.value = "";
  if (fbEl) { fbEl.textContent = ""; fbEl.className = "followups-modal-feedback"; }
  modal.hidden = false;
  setTimeout(() => noteEl?.focus(), 50);
}

function closeModal() {
  const modal = document.getElementById("followups-modal");
  if (modal) modal.hidden = true;
  modalCustomerId = null;
}

async function submitModal() {
  if (!modalCustomerId) return;
  const note = (document.getElementById("followups-modal-note")?.value || "").trim();
  const nextFollowAt = (document.getElementById("followups-modal-next")?.value || "").trim();
  const stage = (document.getElementById("followups-modal-stage")?.value || "").trim();
  const fbEl = document.getElementById("followups-modal-feedback");
  const btn = document.getElementById("followups-modal-submit");

  if (!note && !nextFollowAt && !stage) {
    if (fbEl) {
      fbEl.textContent = "请至少填一项再保存";
      fbEl.className = "followups-modal-feedback is-error";
    }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "保存中…"; }
  try {
    const res = await fetch(`${API}/customers/${encodeURIComponent(modalCustomerId)}/follow-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, nextFollowAt, stage }),
    });
    const data = await res.json();
    if (!res.ok || data?.ok === false) throw new Error(data?.error || "保存失败");
    if (fbEl) {
      fbEl.textContent = "已保存";
      fbEl.className = "followups-modal-feedback is-ok";
    }
    setTimeout(() => {
      closeModal();
      refresh();
      window.dispatchEvent(new CustomEvent("pulse:customers-changed"));
    }, 600);
  } catch (e) {
    if (fbEl) {
      fbEl.textContent = `保存失败：${e.message || "未知错误"}`;
      fbEl.className = "followups-modal-feedback is-error";
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = labels().submit; }
  }
}

function startTimer() {
  if (timer) return;
  timer = setInterval(() => {
    if (["followups", "business"].includes(document.body.getAttribute("data-active-view"))) {
      refresh();
    }
  }, REFRESH_MS);
}

export function initFollowupsView() {
  const root = document.getElementById("followups-view");
  if (!root) return;

  // 视图首次进入或外部触发时刷新
  refreshIndustryCopy();
  window.addEventListener("pulse:open-followups", () => refreshIndustryCopy().then(refresh));
  window.addEventListener("pulse:view-changed", (e) => {
    if (e.detail?.view === "followups" || e.detail?.view === "business") refresh();
  });
  window.addEventListener("pulse:customers-changed", () => {
    if (["followups", "business"].includes(document.body.getAttribute("data-active-view"))) refresh();
  });
  window.addEventListener("pulse:industry-changed", () => {
    refreshIndustryCopy().then(() => {
      if (["followups", "business"].includes(document.body.getAttribute("data-active-view"))) refresh();
    });
  });

  document.getElementById("followups-refresh")?.addEventListener("click", () => refresh());

  // 列表行内按钮（事件代理）
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id") || "";
    if (action === "follow-up") {
      const name = btn.getAttribute("data-name") || labels().fallbackName;
      openModal(id, name);
    } else if (action === "open-customer") {
      window.dispatchEvent(new CustomEvent("pulse:open-org-workspace", { detail: { tab: "customer" } }));
    }
  });

  // 弹窗关闭 + 提交
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-followups-modal-close]")) {
      e.preventDefault();
      closeModal();
    }
  });
  document.getElementById("followups-modal-submit")?.addEventListener("click", submitModal);

  // Esc 关闭
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modal = document.getElementById("followups-modal");
    if (modal && !modal.hidden) closeModal();
  });

  // 首次进入直接拉一次
  if (["followups", "business"].includes(document.body.getAttribute("data-active-view"))) {
    refresh();
  }
  startTimer();
}
