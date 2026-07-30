// Nimo 提醒中心：创建/列表/完成/稍后/删除 + 到点桌面通知
import { API } from "./api-client.js";

const STATE = {
  bound: false,
  loading: false,
  reminders: [],
  tickTimer: null,
};

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
}

function pad2(n) { return String(n).padStart(2, "0"); }

function fmtLocalDateTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtDateTimeInput(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtRelative(targetIso) {
  const target = new Date(targetIso).getTime();
  if (!Number.isFinite(target)) return "";
  const diff = target - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 1) return diff >= 0 ? "马上" : "刚刚到点";
  if (min < 60) return diff >= 0 ? `${min} 分钟后` : `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return diff >= 0 ? `${hr} 小时后` : `${hr} 小时前`;
  const day = Math.round(hr / 24);
  return diff >= 0 ? `${day} 天后` : `${day} 天前`;
}

function recurrenceText(item = {}) {
  const type = item.recurrenceType;
  if (!type) return "";
  if (type === "daily") return "每天";
  if (type === "weekly") return "每周";
  if (type === "monthly") return "每月";
  return "周期";
}

function setFeedback(text, isError = false) {
  const el = $("nrf-feedback");
  if (!el) return;
  el.textContent = text || "";
  el.className = `nrf-feedback${isError ? " nrf-feedback-error" : ""}`;
  if (text) {
    const stamp = text;
    setTimeout(() => { if (el.textContent === stamp) el.textContent = ""; }, 3500);
  }
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function bucketOf(item) {
  const dueMs = new Date(item.dueAt).getTime();
  if (!Number.isFinite(dueMs)) return "later";
  const now = Date.now();
  if (dueMs <= now) return "overdue";
  const today = startOfDay();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today); dayAfter.setDate(dayAfter.getDate() + 2);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
  if (dueMs < tomorrow.getTime()) return "today";
  if (dueMs < dayAfter.getTime()) return "tomorrow";
  if (dueMs < weekEnd.getTime()) return "week";
  return "later";
}

const BUCKET_META = [
  { id: "overdue", label: "已到点", hint: "到点未处理，先收尾这些" },
  { id: "today", label: "今天", hint: "今天剩下要做的事" },
  { id: "tomorrow", label: "明天", hint: "明天的安排" },
  { id: "week", label: "本周稍后", hint: "本周内、不是今明两天" },
  { id: "later", label: "更远", hint: "下周以后或没有具体日期" },
];

function renderItem(item, bucketId) {
  const overdue = bucketId === "overdue";
  const recurrence = recurrenceText(item);
  const snoozeCount = Number(item.snoozeCount || 0);
  return `
    <li class="nrl-item${overdue ? " is-overdue" : ""}" data-id="${item.id}">
      <div class="nrl-meta">
        <span class="nrl-time">${esc(fmtLocalDateTime(item.dueAt))}</span>
        <span class="nrl-relative">${esc(fmtRelative(item.dueAt))}</span>
        ${recurrence ? `<span class="nrl-tag">${esc(recurrence)}</span>` : ""}
        ${snoozeCount > 0 ? `<span class="nrl-tag nrl-tag-snooze">已稍后 ${snoozeCount} 次</span>` : ""}
        ${overdue ? '<span class="nrl-tag nrl-tag-overdue">已到点</span>' : ""}
      </div>
      <div class="nrl-task">${esc(item.task)}</div>
      <div class="nrl-actions">
        <button type="button" data-act="complete">完成</button>
        <button type="button" data-act="snooze" data-min="10">稍后 10 分钟</button>
        <button type="button" data-act="snooze" data-min="60">稍后 1 小时</button>
        <button type="button" data-act="cancel" class="nrl-act-danger">删除</button>
      </div>
      ${snoozeCount >= 3 ? '<div class="nrl-hint">这条已经稍后多次了，建议拆成更小一步，或者先花 5 分钟收个尾。</div>' : ""}
    </li>`;
}

function renderList() {
  const list = $("nimo-reminder-list");
  const countEl = $("nrl-count");
  if (!list) return;
  if (STATE.loading) {
    list.innerHTML = '<div class="nrl-empty">加载中…</div>';
    if (countEl) countEl.textContent = "";
    return;
  }
  if (!STATE.reminders.length) {
    list.innerHTML = '<div class="nrl-empty">还没有提醒。在上面写一句、选个时间，Nimo 就会到点叫你。</div>';
    if (countEl) countEl.textContent = "0 条";
    return;
  }
  if (countEl) countEl.textContent = `${STATE.reminders.length} 条`;

  const groups = { overdue: [], today: [], tomorrow: [], week: [], later: [] };
  const sorted = [...STATE.reminders].sort((a, b) => {
    const ta = new Date(a.dueAt).getTime() || 0;
    const tb = new Date(b.dueAt).getTime() || 0;
    return ta - tb;
  });
  for (const item of sorted) groups[bucketOf(item)].push(item);

  list.innerHTML = BUCKET_META
    .filter((meta) => groups[meta.id].length)
    .map((meta) => `
      <section class="nrl-bucket nrl-bucket-${meta.id}">
        <header class="nrl-bucket-head">
          <span class="nrl-bucket-dot"></span>
          <h3 class="nrl-bucket-title">${esc(meta.label)}</h3>
          <span class="nrl-bucket-count">${groups[meta.id].length}</span>
          <span class="nrl-bucket-hint">${esc(meta.hint)}</span>
        </header>
        <ul class="nrl-bucket-list">
          ${groups[meta.id].map((item) => renderItem(item, meta.id)).join("")}
        </ul>
      </section>
    `).join("");
}

function fmtDeviceTime(value) {
  if (!value) return "刚刚";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "刚刚";
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  return fmtLocalDateTime(value);
}

function renderDevices(devices = []) {
  const list = $("ndp-list");
  if (!list) return;
  if (!devices.length) {
    list.innerHTML = '<div class="ndp-empty">还没有硬件设备连接。之后 ESP32 屏幕、按钮、语音模块会显示在这里。</div>';
    return;
  }
  list.innerHTML = devices.map((device) => `
    <div class="ndp-item${device.online ? " is-online" : ""}">
      <div class="ndp-status-dot"></div>
      <div class="ndp-main">
        <strong>${esc(device.name || device.id)}</strong>
        <span>${esc(device.type || "hardware")} · ${esc(device.id || "")}</span>
      </div>
      <div class="ndp-meta">
        <span>${device.online ? "在线" : "离线"}</span>
        <em>${esc(fmtDeviceTime(device.lastSeenAt))}</em>
      </div>
    </div>
  `).join("");
}

async function refreshDevices() {
  const btn = $("ndp-refresh");
  if (btn) btn.disabled = true;
  try {
    const data = await fetch(`${API}/device/status`, { cache: "no-store" }).then((r) => r.json());
    renderDevices(Array.isArray(data?.devices) ? data.devices : []);
  } catch {
    renderDevices([]);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function reload() {
  STATE.loading = true;
  renderList();
  try {
    const res = await fetch(`${API}/reminders`, { cache: "no-store" });
    const data = await res.json();
    STATE.reminders = Array.isArray(data?.reminders) ? data.reminders : [];
  } catch (err) {
    STATE.reminders = [];
    setFeedback(`加载失败：${err.message}`, true);
  } finally {
    STATE.loading = false;
    renderList();
    refreshTodaySummary().catch(() => {});
    refreshDevices().catch(() => {});
  }
}

function endOfDayMs(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

async function refreshTodaySummary() {
  const now = Date.now();
  const endOfToday = endOfDayMs();
  const todayList = STATE.reminders.filter((item) => {
    const t = new Date(item.dueAt).getTime();
    return Number.isFinite(t) && t <= endOfToday;
  });
  const overdueCount = todayList.filter((item) => new Date(item.dueAt).getTime() <= now).length;
  const upcomingToday = todayList.length - overdueCount;

  const next = STATE.reminders
    .filter((item) => new Date(item.dueAt).getTime() > now)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0];

  const todayEl = $("nts-stat-today");
  const todaySub = $("nts-stat-today-sub");
  const doneEl = $("nts-stat-done");
  let statsNextApplied = false;
  try {
    const stats = await fetch(`${API}/reminders/stats`, { cache: "no-store" }).then((r) => r.json());
    if (todayEl) todayEl.textContent = `${Number(stats?.today ?? todayList.length)}`;
    if (todaySub) todaySub.textContent = `未到点 ${Number(stats?.upcomingToday ?? upcomingToday)} · 已到点 ${Number(stats?.overdue ?? overdueCount)}`;
    if (doneEl) doneEl.textContent = `${Number(stats?.completed || 0)}`;
    if (stats?.next) {
      const nextEl = $("nts-stat-next");
      const nextSub = $("nts-stat-next-sub");
      if (nextEl) nextEl.textContent = fmtRelative(stats.next.dueAt);
      if (nextSub) nextSub.textContent = stats.next.task.length > 16 ? `${stats.next.task.slice(0, 16)}…` : stats.next.task;
      statsNextApplied = true;
    }
  } catch {
    if (todayEl) todayEl.textContent = `${todayList.length}`;
    if (todaySub) todaySub.textContent = `未到点 ${upcomingToday} · 已到点 ${overdueCount}`;
    if (doneEl) doneEl.textContent = "0";
  }

  const nextEl = $("nts-stat-next");
  const nextSub = $("nts-stat-next-sub");
  if (statsNextApplied) {
  } else if (next) {
    if (nextEl) nextEl.textContent = fmtRelative(next.dueAt);
    if (nextSub) nextSub.textContent = next.task.length > 16 ? `${next.task.slice(0, 16)}…` : next.task;
  } else {
    if (nextEl) nextEl.textContent = "—";
    if (nextSub) nextSub.textContent = "今天没有到点提醒";
  }

  try {
    const status = await fetch(`${API}/activity/status`, { cache: "no-store" }).then((r) => r.json());
    const summary = await fetch(`${API}/activity/summary`, { cache: "no-store" }).then((r) => r.json());
    const screenEl = $("nts-stat-screen");
    const screenSub = $("nts-stat-screen-sub");
    if (screenEl) screenEl.textContent = summary?.workText || "0分钟";
    if (screenSub) screenSub.textContent = status?.running ? "采集中" : "未采集";
  } catch {}

}

async function generateAiSummary() {
  const textEl = $("nts-ai-text");
  const metaEl = $("nts-ai-meta");
  const btn = $("nts-generate");
  if (btn) btn.disabled = true;
  if (textEl) textEl.textContent = "Nimo 正在精简总结今天做了什么…";
  if (metaEl) metaEl.textContent = "生成中…";
  try {
    const res = await fetch(`${API}/daily-summary/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    const data = await res.json();
    const text = data?.summary || data?.fallback || "今天数据还不够，暂时无法总结。";
    if (textEl) textEl.textContent = text;
    if (metaEl) metaEl.textContent = data?.source === "ai" ? "AI 已生成" : "本地兜底总结";
  } catch (err) {
    if (textEl) textEl.textContent = `总结失败：${err.message}`;
    if (metaEl) metaEl.textContent = "生成失败";
  } finally {
    if (btn) btn.disabled = false;
  }
}

function fillDefaultDueAt(minutesFromNow = 30) {
  const input = $("nrf-due-at");
  if (!input) return;
  input.value = fmtDateTimeInput(new Date(Date.now() + minutesFromNow * 60 * 1000));
}

function buildRecurrencePayload(dueAtValue) {
  const type = ($("nrf-recurrence")?.value || "").trim();
  if (!type) return {};
  const d = new Date(dueAtValue);
  if (Number.isNaN(d.getTime())) return {};
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (type === "daily") return { recurrenceType: "daily", recurrenceConfig: { time } };
  if (type === "weekly") return { recurrenceType: "weekly", recurrenceConfig: { time, weekday: d.getDay() } };
  if (type === "monthly") return { recurrenceType: "monthly", recurrenceConfig: { time, day_of_month: d.getDate() } };
  return {};
}

async function submitNew() {
  const taskInput = $("nrf-task");
  const task = (taskInput?.value || "").trim();
  if (!task) { setFeedback("请先写提醒内容", true); taskInput?.focus(); return; }
  const dueAt = ($("nrf-due-at")?.value || "").trim();
  if (!dueAt) { setFeedback("请选择提醒时间", true); return; }
  const recurrencePayload = buildRecurrencePayload(dueAt);
  try {
    const res = await fetch(`${API}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, dueAt, source: "nimo-ui", ...recurrencePayload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
    setFeedback("已添加提醒");
    if (taskInput) taskInput.value = "";
    fillDefaultDueAt(30);
    reload();
  } catch (err) {
    setFeedback(`添加失败：${err.message}`, true);
  }
}

async function callReminderAction(id, action, payload) {
  const url = `${API}/reminders/${id}/${action}`;
  const init = { method: "POST" };
  if (payload) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(payload);
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function bindOnce() {
  if (STATE.bound) return;
  STATE.bound = true;

  $("nrf-submit")?.addEventListener("click", () => submitNew());
  $("nrf-task")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      submitNew();
    }
  });
  document.querySelectorAll(".nrf-quick button[data-quick]")?.forEach((btn) => {
    btn.addEventListener("click", () => fillDefaultDueAt(Number(btn.dataset.quick || 30)));
  });
  $("nrl-refresh")?.addEventListener("click", () => reload());
  $("ndp-refresh")?.addEventListener("click", () => refreshDevices());

  $("nts-refresh")?.addEventListener("click", () => refreshTodaySummary());
  $("nts-generate")?.addEventListener("click", () => generateAiSummary());
  $("nts-open-full")?.addEventListener("click", () => {
    try { window.pulseSetView?.("activity"); } catch {}
  });

  $("nimo-reminder-list")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const li = btn.closest(".nrl-item");
    const id = Number(li?.dataset.id);
    if (!id) return;
    const act = btn.dataset.act;
    btn.disabled = true;
    try {
      if (act === "complete") await callReminderAction(id, "complete");
      else if (act === "cancel") await callReminderAction(id, "cancel");
      else if (act === "snooze") await callReminderAction(id, "snooze", { minutes: Number(btn.dataset.min || 10) });
      else return;
      setFeedback(act === "complete" ? "已标记完成" : act === "cancel" ? "已删除" : "已稍后提醒");
      reload();
    } catch (err) {
      setFeedback(`操作失败：${err.message}`, true);
    } finally {
      btn.disabled = false;
    }
  });

  $("nimo-reminder-quick-focus")?.addEventListener("click", () => {
    $("nrf-task")?.focus();
  });
}

function ensureNotificationPermission() {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  } catch {}
}

function notifyDue(payload) {
  const task = payload?.task || "提醒到了";
  const dueAt = payload?.due_at || payload?.dueAt || "";
  const body = dueAt ? `${task}\n到点时间：${fmtLocalDateTime(dueAt)}` : task;
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const n = new Notification("Nimo 提醒", { body });
      n.onclick = () => {
        try { window.focus(); } catch {}
        try { window.pulseSetView?.("business"); } catch {}
      };
    }
  } catch {}
  try { window.pulseSetView?.("business"); } catch {}
  reload();
}

function startTick() {
  if (STATE.tickTimer) return;
  STATE.tickTimer = setInterval(() => {
    if (document.body.getAttribute("data-active-view") === "business") renderList();
  }, 30 * 1000);
}

export function initRemindersView() {
  // 等首次渲染完成（business-view 由 app-shell 渲染）
  setTimeout(() => {
    bindOnce();
    fillDefaultDueAt(30);
    reload();
    startTick();
    ensureNotificationPermission();
  }, 0);

  window.addEventListener("nimo:reminder-changed", () => reload());
  window.addEventListener("nimo:reminder-fired", (e) => notifyDue(e.detail || {}));
  window.addEventListener("nimo:device-changed", () => refreshDevices());
  window.addEventListener("pulse:view-changed", (e) => {
    if (e.detail?.view === "business") reload();
  });
}
