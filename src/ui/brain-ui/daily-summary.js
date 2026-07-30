import { API } from "./api-client.js";

const KEYS = {
  enabled: "nimo_daily_summary_enabled",
  time: "nimo_daily_summary_time",
  migration: "nimo_daily_summary_defaults_v1",
  lastSentDay: "nimo_daily_summary_last_sent_day",
};

const STATE = {
  timer: null,
  lastStatusText: "每日总结正在准备…",
};

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readBool(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return value !== "false" && value !== "0";
  } catch {
    return fallback;
  }
}

function normalizeTime(value) {
  const text = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : "22:30";
}

function applyDefaultsOnce() {
  try {
    if (localStorage.getItem(KEYS.migration) === "1") return;
    localStorage.setItem(KEYS.enabled, "true");
    localStorage.setItem(KEYS.time, "22:30");
    localStorage.setItem(KEYS.migration, "1");
  } catch {}
}

function settings() {
  return {
    enabled: readBool(KEYS.enabled, true),
    time: normalizeTime(localStorage.getItem(KEYS.time) || "22:30"),
  };
}

function setStatusText(text) {
  STATE.lastStatusText = text;
  const el = document.getElementById("nimo-daily-summary-status");
  if (el) el.textContent = text;
}

function secondsText(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}小时${m}分钟`;
  if (m > 0) return `${m}分钟`;
  return `${total}秒`;
}

async function fetchJson(path) {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function dayEndMs(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function reminderStats(reminders = []) {
  const end = dayEndMs();
  const now = Date.now();
  const dueToday = reminders.filter((item) => {
    const t = new Date(item.dueAt || item.due_at).getTime();
    return Number.isFinite(t) && t <= end;
  });
  const overdue = dueToday.filter((item) => {
    const t = new Date(item.dueAt || item.due_at).getTime();
    return Number.isFinite(t) && t <= now;
  });
  return {
    totalPending: reminders.length,
    dueToday: dueToday.length,
    overdue: overdue.length,
    top: dueToday.slice(0, 3).map((item) => item.task || item.systemMessage || "未命名提醒"),
  };
}

function topAppText(summary) {
  const apps = Array.isArray(summary?.apps) ? summary.apps : [];
  if (!apps.length) return "今天还没有形成主要软件使用记录。";
  return apps.slice(0, 3).map((app, idx) => `${idx + 1}. ${app.appName || app.processName || "未知软件"}：${app.durationText || secondsText(app.seconds)}`).join("\n");
}

function buildSummaryMessage({ activity, reminders }) {
  const stats = reminderStats(reminders);
  const headline = stats.dueToday > 0
    ? `今天你还差 ${stats.dueToday} 件事没收尾，其中 ${stats.overdue} 件已经到点。`
    : "今天没有到点未完成提醒，整体节奏还不错。";
  const activityText = activity?.eventCount > 0
    ? `今天电脑在线 ${activity.totalText || secondsText(activity.totalSeconds)}，有效工作 ${activity.workText || secondsText(activity.workSeconds)}，空闲/离开 ${activity.idleText || secondsText(activity.idleSeconds)}。`
    : "今天暂时没有足够的软件使用统计。";
  const todoText = stats.top.length
    ? stats.top.map((task, idx) => `${idx + 1}. ${task}`).join("\n")
    : "今晚没有必须立刻处理的提醒。";
  const topApps = topAppText(activity);
  return [
    `Nimo 给你做个今天的小结：`,
    headline,
    activityText,
    `\n今晚建议先处理：\n${todoText}`,
    `\n今天主要使用：\n${topApps}`,
    `\n如果你愿意，我可以继续帮你把明天第一件事排出来。`,
  ].join("\n\n");
}

function sendProactive(text) {
  try {
    window.dispatchEvent(new CustomEvent("pulse:proactive-message", { detail: { text } }));
  } catch {}
}

async function sendDailySummary({ force = false } = {}) {
  const cfg = settings();
  if (!cfg.enabled && !force) return null;
  const day = todayKey();
  try {
    if (!force && localStorage.getItem(KEYS.lastSentDay) === day) return null;
  } catch {}
  const aiSummary = await fetchJson("/daily-summary/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: day, force }),
  }).catch(() => null);
  let text = aiSummary?.summary || "";
  if (!text) {
    const [activity, reminderData] = await Promise.all([
      fetchJson(`/activity/summary?date=${encodeURIComponent(day)}`).catch(() => null),
      fetchJson("/reminders").catch(() => ({ reminders: [] })),
    ]);
    text = buildSummaryMessage({ activity, reminders: reminderData?.reminders || [] });
  }
  sendProactive(text);
  try { localStorage.setItem(KEYS.lastSentDay, day); } catch {}
  setStatusText(`今日总结已发送 · ${cfg.time}`);
  return text;
}

function shouldSendNow() {
  const cfg = settings();
  if (!cfg.enabled) return false;
  const now = new Date();
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (current < cfg.time) return false;
  try {
    return localStorage.getItem(KEYS.lastSentDay) !== todayKey(now);
  } catch {
    return true;
  }
}

async function checkNow() {
  const cfg = settings();
  if (!cfg.enabled) {
    setStatusText("每日总结已关闭");
    return null;
  }
  setStatusText(`每日 ${cfg.time} 自动总结今天任务和电脑使用情况`);
  if (shouldSendNow()) return await sendDailySummary();
  return null;
}

function resetTimer() {
  if (STATE.timer) clearInterval(STATE.timer);
  STATE.timer = setInterval(() => checkNow(), 60 * 1000);
}

export function getDailySummarySettings() {
  return settings();
}

export function saveDailySummarySettings(next = {}) {
  try {
    if (typeof next.enabled === "boolean") localStorage.setItem(KEYS.enabled, String(next.enabled));
    if (next.time) localStorage.setItem(KEYS.time, normalizeTime(next.time));
  } catch {}
  resetTimer();
  setTimeout(() => checkNow(), 500);
  return settings();
}

export function initDailySummary() {
  applyDefaultsOnce();
  resetTimer();
  setTimeout(() => checkNow(), 3500);
  window.NimoDailySummary = {
    checkNow,
    sendNow: () => sendDailySummary({ force: true }),
    settings,
    save: saveDailySummarySettings,
  };
  return window.NimoDailySummary;
}
