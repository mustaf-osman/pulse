import { apiUrl } from "./api-client.js";

let lightEl = null;
let labelEl = null;
let tooltipEl = null;
let mounted = false;
let lastQuota = null;
let lastStatus = "offline"; // online | rate-limited | error | offline

function ensureMounted() {
  if (mounted) return;
  const bar = document.getElementById("pulse-app-bar");
  if (!bar) return;
  const meta = bar.querySelector(".nb-meta");
  if (!meta) return;
  const wrap = document.createElement("div");
  wrap.id = "pulse-status-light-wrap";
  wrap.className = "pulse-status-wrap";
  wrap.innerHTML = `
    <span class="pulse-status-dot" id="pulse-status-dot"></span>
    <span class="pulse-status-label" id="pulse-status-label">连接中…</span>
    <div class="pulse-status-tip" id="pulse-status-tip" hidden></div>
  `;
  meta.insertBefore(wrap, meta.firstChild);
  lightEl = wrap.querySelector("#pulse-status-dot");
  labelEl = wrap.querySelector("#pulse-status-label");
  tooltipEl = wrap.querySelector("#pulse-status-tip");
  wrap.addEventListener("mouseenter", () => {
    if (tooltipEl) tooltipEl.hidden = false;
  });
  wrap.addEventListener("mouseleave", () => {
    if (tooltipEl) tooltipEl.hidden = true;
  });
  mounted = true;
}

function applyState(state, labelText) {
  if (!mounted) return;
  lastStatus = state;
  lightEl.dataset.state = state;
  labelEl.textContent = labelText;
  renderTooltip();
}

function renderTooltip() {
  if (!tooltipEl) return;
  const lines = [];
  lines.push(`状态：${labelOf(lastStatus)}`);
  if (lastQuota) {
    if (lastQuota.rpmUsed) lines.push(`RPM：${lastQuota.rpmUsed}`);
    if (lastQuota.tpmUsed) lines.push(`TPM：${lastQuota.tpmUsed}`);
    if (lastQuota.ratio) lines.push(`占用：${lastQuota.ratio}`);
    if (lastQuota.tickInterval) {
      const seconds = Math.round(lastQuota.tickInterval / 1000);
      lines.push(`下次 TICK：${seconds}s`);
    }
  }
  tooltipEl.innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
}

function labelOf(s) {
  return (
    {
      online: "运行正常",
      "rate-limited": "限流中",
      error: "出错",
      offline: "未连接",
    }[s] || s
  );
}

/** SSE 事件入口：app.js 在 connectSSE 中调用 */
export function handleStatusEvent(type, data) {
  ensureMounted();
  if (!mounted) return;
  switch (type) {
    case "connected":
      applyState("online", "运行中");
      break;
    case "quota":
      lastQuota = data;
      if (data?.ticker?.rateLimited || /rate.?limit/i.test(String(data?.label || ""))) {
        applyState("rate-limited", "限流中");
      } else if (lastStatus !== "error") {
        applyState("online", "运行中");
      }
      renderTooltip();
      break;
    case "error":
      applyState("error", "出错");
      break;
    case "activated":
    case "model_switched":
      applyState("online", "运行中");
      break;
    default:
      break;
  }
}

export function setStatusOffline() {
  ensureMounted();
  applyState("offline", "离线");
}

export async function pollStatusOnce() {
  ensureMounted();
  try {
    const r = await fetch(apiUrl(`/status`), { credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data?.running) {
      if (lastStatus === "offline") applyState("online", "运行中");
    } else {
      applyState("offline", "已停止");
    }
  } catch {
    applyState("offline", "离线");
  }
  try {
    const r = await fetch(apiUrl(`/quota`), { credentials: "same-origin" });
    if (r.ok) {
      lastQuota = await r.json();
      renderTooltip();
    }
  } catch {
    /* ignore */
  }
}

export function initStatusLight() {
  ensureMounted();
  pollStatusOnce();
  setInterval(pollStatusOnce, 15000);
}
