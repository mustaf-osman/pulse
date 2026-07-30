import { API } from "./api-client.js";

const CONFIG = {
  enabled: "nimo_screen_guard_enabled",
  mode: "nimo_screen_guard_mode",
  screenMinutes: "nimo_screen_guard_screen_minutes",
  idleMinutes: "nimo_screen_guard_idle_minutes",
  migration: "nimo_screen_guard_defaults_v1",
  lastScreenAlertAt: "nimo_screen_guard_last_screen_alert_at",
  lastIdleAlertAt: "nimo_screen_guard_last_idle_alert_at",
};

const MODE_LABELS = {
  mild: "温和",
  normal: "普通",
  strict: "强督促",
};

const STATE = {
  timer: null,
  activeSince: 0,
  lastSample: null,
  lastStatusText: "正在启动屏幕督促…",
};

function readBool(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return value !== "false" && value !== "0";
  } catch {
    return fallback;
  }
}

function readNumber(key, fallback, allowed) {
  try {
    const n = Number(localStorage.getItem(key));
    if (allowed?.includes(n)) return n;
  } catch {}
  return fallback;
}

function readMode() {
  try {
    const value = localStorage.getItem(CONFIG.mode) || "normal";
    return MODE_LABELS[value] ? value : "normal";
  } catch {
    return "normal";
  }
}

function settings() {
  return {
    enabled: readBool(CONFIG.enabled, true),
    mode: readMode(),
    screenMinutes: readNumber(CONFIG.screenMinutes, 45, [25, 45, 60, 90]),
    idleMinutes: readNumber(CONFIG.idleMinutes, 10, [5, 10, 15, 30]),
  };
}

function applyDefaultsOnce() {
  try {
    if (localStorage.getItem(CONFIG.migration) === "1") return;
    localStorage.setItem(CONFIG.enabled, "true");
    localStorage.setItem(CONFIG.mode, "normal");
    localStorage.setItem(CONFIG.screenMinutes, "45");
    localStorage.setItem(CONFIG.idleMinutes, "10");
    localStorage.setItem(CONFIG.migration, "1");
  } catch {}
}

function modeText(kind, sample, cfg) {
  const app = sample?.appName || sample?.processName || "电脑";
  const title = sample?.windowTitle ? `「${sample.windowTitle}」` : "当前窗口";
  const mild = {
    screen: `你已经连续看屏幕一阵子了。要不要休息 2 分钟、看看远处？\n\n我看到你现在在用：${app} · ${title}`,
    idle: `你有一会儿没动电脑了。要是刚才在休息，就慢慢来；如果只是走神了，我们回到任务上吧。`,
  };
  const normal = {
    screen: `提醒一下：你已经连续用屏超过 ${cfg.screenMinutes} 分钟了。\n\n起来喝口水、看远处 20 秒，再回来效率会更高。现在窗口：${app} · ${title}`,
    idle: `我看你 ${cfg.idleMinutes} 分钟左右没动电脑了。\n\n是在休息，还是摸鱼去了？回来我们继续把事情推进一下。`,
  };
  const strict = {
    screen: `强督促：连续盯屏超过 ${cfg.screenMinutes} 分钟了，先停 2 分钟。\n\n别硬扛，休息完再继续。当前：${app} · ${title}`,
    idle: `别摸鱼。你已经一段时间没动电脑了。\n\n如果不是开会/离开，就回来处理当前任务；如果需要休息，也可以告诉我。`,
  };
  const bucket = cfg.mode === "mild" ? mild : cfg.mode === "strict" ? strict : normal;
  return bucket[kind];
}

function shouldAlert(key, gapMs) {
  try {
    const last = Number(localStorage.getItem(key) || "0");
    return !last || Date.now() - last >= gapMs;
  } catch {
    return true;
  }
}

function markAlert(key) {
  try { localStorage.setItem(key, String(Date.now())); } catch {}
}

function sendProactive(text) {
  try {
    window.dispatchEvent(new CustomEvent("pulse:proactive-message", { detail: { text } }));
  } catch {}
}

function setStatusText(text) {
  STATE.lastStatusText = text;
  const el = document.getElementById("nimo-screen-guard-status");
  if (el) el.textContent = text;
}

async function ensureTrackingEnabled() {
  const cfg = settings();
  if (!cfg.enabled) return;
  try {
    const status = await fetch(`${API}/activity/status`, { cache: "no-store" }).then((r) => r.json());
    if (!status?.running || status?.config?.aiScreenEnabled) {
      await fetch(`${API}/activity/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingEnabled: true,
          aiScreenEnabled: false,
          sampleIntervalMs: 5000,
          idleThresholdSeconds: Math.max(60, cfg.idleMinutes * 60),
        }),
      });
    }
  } catch {}
}

async function sampleNow() {
  const res = await fetch(`${API}/activity/sample`, { method: "POST" });
  const data = await res.json();
  return data?.sample || data?.status?.lastSample || null;
}

async function checkNow() {
  const cfg = settings();
  if (!cfg.enabled) {
    setStatusText("屏幕督促已关闭");
    return null;
  }
  await ensureTrackingEnabled();
  let sample = null;
  try {
    sample = await sampleNow();
  } catch {
    setStatusText("屏幕督促正在等待采样权限");
    return null;
  }
  if (!sample) return null;
  STATE.lastSample = sample;
  const idleSeconds = Number(sample.idleSeconds || 0);
  const now = Date.now();
  if (sample.idle || idleSeconds >= cfg.idleMinutes * 60) {
    STATE.activeSince = 0;
    setStatusText(`当前空闲 ${Math.round(idleSeconds / 60)} 分钟 · ${MODE_LABELS[cfg.mode]}督促`);
    if (idleSeconds >= cfg.idleMinutes * 60 && shouldAlert(CONFIG.lastIdleAlertAt, Math.max(10 * 60 * 1000, cfg.idleMinutes * 60 * 1000))) {
      sendProactive(modeText("idle", sample, cfg));
      markAlert(CONFIG.lastIdleAlertAt);
    }
    return sample;
  }
  if (!STATE.activeSince) STATE.activeSince = now;
  const activeMinutes = Math.floor((now - STATE.activeSince) / 60000);
  setStatusText(`正在观察：${sample.appName || sample.processName || "当前窗口"} · 连续用屏 ${activeMinutes} 分钟 · ${MODE_LABELS[cfg.mode]}督促`);
  if (activeMinutes >= cfg.screenMinutes && shouldAlert(CONFIG.lastScreenAlertAt, Math.max(20 * 60 * 1000, cfg.screenMinutes * 60 * 1000))) {
    sendProactive(modeText("screen", sample, cfg));
    markAlert(CONFIG.lastScreenAlertAt);
    STATE.activeSince = now;
  }
  return sample;
}

function resetTimer() {
  if (STATE.timer) clearInterval(STATE.timer);
  STATE.timer = setInterval(() => checkNow(), 60 * 1000);
}

export function getScreenGuardSettings() {
  return settings();
}

export function saveScreenGuardSettings(next = {}) {
  try {
    if (typeof next.enabled === "boolean") localStorage.setItem(CONFIG.enabled, String(next.enabled));
    if (MODE_LABELS[next.mode]) localStorage.setItem(CONFIG.mode, next.mode);
    if ([25, 45, 60, 90].includes(Number(next.screenMinutes))) localStorage.setItem(CONFIG.screenMinutes, String(Number(next.screenMinutes)));
    if ([5, 10, 15, 30].includes(Number(next.idleMinutes))) localStorage.setItem(CONFIG.idleMinutes, String(Number(next.idleMinutes)));
  } catch {}
  STATE.activeSince = 0;
  resetTimer();
  setTimeout(() => checkNow(), 500);
  return settings();
}

export function initScreenGuard() {
  applyDefaultsOnce();
  resetTimer();
  setTimeout(() => checkNow(), 2500);
  window.addEventListener("pulse:proactive-settings-changed", () => setTimeout(() => checkNow(), 600));
  window.NimoScreenGuard = {
    checkNow,
    settings,
    save: saveScreenGuardSettings,
  };
  return window.NimoScreenGuard;
}
