import { apiUrl } from "./api-client.js";

const ACTIVITY_SYNC_KEY = "nimo_company_activity_synced_ids";
const ACTIVITY_SYNC_TIMER_MS = 5 * 60 * 1000;

function cloudAuth() {
  return window.NimoCloudAuth || window.NewPulseCloudAuth || null;
}

function hasCompany() {
  const user = cloudAuth()?.user;
  return Boolean(user?.companyId || user?.company_id);
}

function readSyncedIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(ACTIVITY_SYNC_KEY) || "[]");
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveSyncedIds(ids) {
  try {
    localStorage.setItem(ACTIVITY_SYNC_KEY, JSON.stringify([...ids].slice(-1000)));
  } catch {}
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeActivityEvent(event) {
  return {
    id: event.id,
    date: String(event.startedAt || todayKey()).slice(0, 10),
    appName: event.appName || "",
    processName: event.processName || "",
    windowTitle: event.windowTitle || "",
    category: event.aiActivityType || (event.idle ? "空闲" : "未分类"),
    durationSeconds: Number(event.durationSeconds || 0),
    idleSeconds: event.idle ? Number(event.durationSeconds || 0) : 0,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
  };
}

export async function syncCompanyActivity() {
  const auth = cloudAuth();
  if (!auth?.cloudRequest || !hasCompany()) return { ok: false, skipped: "no_company" };
  const synced = readSyncedIds();
  const res = await fetch(apiUrl(`/activity/events?date=${encodeURIComponent(todayKey())}&limit=500`), { credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  const events = Array.isArray(data.events) ? data.events : [];
  const entries = events.filter((event) => !synced.has(String(event.id))).map(normalizeActivityEvent).filter((event) => event.durationSeconds > 0);
  if (!entries.length) return { ok: true, uploaded: 0 };
  const batch = entries.slice(0, 300);
  await auth.cloudRequest("/api/activity/sync", {
    method: "POST",
    body: JSON.stringify({ entries: batch }),
  });
  batch.forEach((event) => synced.add(String(event.id)));
  saveSyncedIds(synced);
  return { ok: true, uploaded: batch.length };
}

export async function syncCompanyMemory({ title = "", content = "", sourceType = "manual", customerId = null, tags = [], visibility = "company" } = {}) {
  const auth = cloudAuth();
  if (!auth?.cloudRequest || !hasCompany()) return { ok: false, skipped: "no_company" };
  const body = {
    title,
    content,
    sourceType,
    customerId,
    tags,
    visibility,
  };
  return auth.cloudRequest("/api/company/memories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function startCompanySync() {
  if (!hasCompany()) return;
  setTimeout(() => { syncCompanyActivity().catch(() => {}); }, 8000);
  setInterval(() => { syncCompanyActivity().catch(() => {}); }, ACTIVITY_SYNC_TIMER_MS);
}
