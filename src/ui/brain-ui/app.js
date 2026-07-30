import { renderBrainUiApp } from "./app-shell.js";
import { API } from "./api-client.js";
import { ensureCloudAuthorized } from "./cloud-auth.js";
import { bootstrapACUI } from "./acui/bootstrap.js";
import { initChat } from "./chat.js";
import { initPanelCollapse } from "./panel-collapse.js";
import { ThoughtStream } from "./thought-stream.js";
import { initVoicePanel } from "./voice-panel.js";
import { initHotspot, toggleHotspot, setHotspotMode, moveVoicePanelToBody, restoreVoicePanel } from "./hotspot.js";
import { initPersonCard, setPersonCardMode, showPersonCardByName, extractPersonCardQuery, updatePersonCardFromAssistantText } from "./person-card.js";
import { initDocPanel, setDocPanelMode } from "./doc.js";
import { initIndustryOnboarding } from "./industry.js";
import { initIndustryDashboard } from "./industry-dashboard.js";
import { initIndustryPrompts } from "./industry-prompts.js";
import { initCustomerPanel } from "./customer-panel.js";
import { initMemoryManager, showMemoryWrittenToast } from "./memory-manager.js";
import { initStatusLight, handleStatusEvent, setStatusOffline } from "./status-light.js";
import { handleThinkingEvent, notifyUserSent } from "./thinking-indicator.js";
import { initUsagePanel } from "./usage-panel.js";
import { handleErrorEvent } from "./toast.js";
import { initProactiveAssistant } from "./proactive-assistant.js";
import { initTaskBar, handleTaskEvent } from "./task-bar.js";
import { initPersonaCard } from "./persona-card.js";
import { initBizBoard, handleBizTaskEvent } from "./biz-board.js";
import { initOrgWorkspace } from "./org-workspace.js";
import { initChatThreadBar } from "./chat-thread-bar.js";
import { initTodayView } from "./today-view.js";
import { initFollowupsView } from "./followups-view.js";
import { initDashboardView } from "./dashboard-view.js";
import { initActivityReportView } from "./activity-report.js";
import { initReadingDocumentsView } from "./reading-documents-view.js";
import { initRemindersView } from "./reminders-view.js";
import { initDeviceView } from "./device-view.js";
import { initScreenGuard, getScreenGuardSettings, saveScreenGuardSettings } from "./screen-guard.js";
import { initDailySummary, getDailySummarySettings, saveDailySummarySettings } from "./daily-summary.js";
import { loadPersonalDataProfile, savePersonalDataProfile } from "./personal-data-profile.js";
import { startCompanySync } from "./company-sync.js";

await ensureCloudAuthorized(document.body);
renderBrainUiApp(document.body);
startCompanySync();

let activeThreadId = "main";
try {
  activeThreadId = localStorage.getItem("pulse-active-thread-id") || "main";
} catch {}
let activeIndustryState = null;
const THEME_KEY = "pulse-brain-ui-theme";
const PHYSICS_STORAGE_KEY = "pulse-brain-ui-physics";
const ACTIVATION_WARMUP_KEY = "pulse_activation_warmup_until";
const UI_ZOOM_STORAGE_KEY = "pulse_ui_zoom_factor";
const MAX_CHAT_HISTORY = 60;
const DEFAULT_AGENT_NAME = "Nimo 提醒助手";
const DEFAULT_UI_ZOOM = 1.1;
const MIN_UI_ZOOM = 0.8;
const MAX_UI_ZOOM = 1.8;
const UI_ZOOM_STEP = 0.1;
const UI_ZOOM_WHEEL_STEP = 0.05;
const MEMORY_GRAPH_STORAGE_KEY = "pulse-memory-graph-enabled";
// 默认关闭节点图（仅在显式 "true" 时开启），首屏更简洁
const MEMORY_GRAPH_ENABLED = localStorage.getItem(MEMORY_GRAPH_STORAGE_KEY) === "true";

const themeSwitcher = document.getElementById("theme-switcher");
const resetViewBtn = document.getElementById("reset-view-btn");
const physicsControl = document.getElementById("physics-control");
const physicsToggle = document.getElementById("physics-toggle");
const gravitySlider = document.getElementById("gravity-slider");
const repulsionSlider = document.getElementById("repulsion-slider");
const nodeSizeSlider = document.getElementById("node-size-slider");
const gravityValue = document.getElementById("gravity-value");
const repulsionValue = document.getElementById("repulsion-value");
const nodeSizeValue = document.getElementById("node-size-value");
const brandNameEl = document.getElementById("agent-brand-name");
const graphEl = document.getElementById("graph");
const checkUpdateBtn = document.getElementById("check-update-btn");
const updateStatusEl = document.getElementById("update-status");
const updateCardEl = document.getElementById("update-card");
const updateCloseBtn = document.getElementById("update-close-btn");

let agentName = DEFAULT_AGENT_NAME;
let removeUpdaterStatusListener = null;
let currentUiZoom = DEFAULT_UI_ZOOM;
let chat = null;
let proactiveAssistant = null;

function addMsg(...args) { return chat?.addMsg(...args); }
function openChat(...args) { return chat?.openChat(...args); }
function isTyping() { return chat?.isTyping() || false; }

function defaultInputPlaceholder() {
  return `向 ${agentName} 发送消息…  Enter 发送`;
}

function setUpdateStatus(message, state = "idle") {
  if (!updateStatusEl) return;
  updateStatusEl.textContent = message;
  updateStatusEl.dataset.state = state;
  const meta = document.getElementById("update-compact-meta");
  if (meta) {
    const t = String(message || "").trim();
    meta.textContent = t.length > 32 ? `${t.slice(0, 32)}…` : t || "已收起 · 点此展开";
  }
}

function setUpdateButtonState({ disabled = false, label = "检查更新" } = {}) {
  if (!checkUpdateBtn) return;
  checkUpdateBtn.disabled = disabled;
  checkUpdateBtn.textContent = label;
}

function setUpdateCardHidden(hidden) {
  if (!updateCardEl) return;
  updateCardEl.classList.toggle("hidden", Boolean(hidden));
}

function clampZoomFactor(factor) {
  return Math.min(MAX_UI_ZOOM, Math.max(MIN_UI_ZOOM, Number(factor) || DEFAULT_UI_ZOOM));
}

function saveUiZoom(factor) {
  try {
    localStorage.setItem(UI_ZOOM_STORAGE_KEY, String(factor));
  } catch {}
}

function loadSavedUiZoom() {
  try {
    const raw = Number(localStorage.getItem(UI_ZOOM_STORAGE_KEY));
    if (Number.isFinite(raw)) return clampZoomFactor(raw);
  } catch {}
  return DEFAULT_UI_ZOOM;
}

function applyUiZoom(factor, { persist = true } = {}) {
  const nextZoom = clampZoomFactor(factor);
  currentUiZoom = nextZoom;

  const bridge = window.pulse;
  if (bridge?.isElectron && typeof bridge.setZoomFactor === "function") {
    bridge.setZoomFactor(nextZoom);
  } else {
    document.documentElement.style.zoom = String(nextZoom);
  }

  if (persist) saveUiZoom(nextZoom);
}

function stepUiZoom(delta) {
  const nextZoom = Math.round((currentUiZoom + delta) * 100) / 100;
  applyUiZoom(nextZoom);
}

function initUiZoom() {
  const bridge = window.pulse;
  const initialZoom = loadSavedUiZoom();

  if (!bridge?.isElectron) {
    applyUiZoom(initialZoom, { persist: false });
  } else {
    try {
      const bridgeZoom = bridge.getZoomFactor?.();
      if (typeof bridgeZoom === "number" && Number.isFinite(bridgeZoom)) {
        currentUiZoom = clampZoomFactor(bridgeZoom);
      }
    } catch {}
    applyUiZoom(initialZoom, { persist: false });
  }

  window.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    stepUiZoom(event.deltaY < 0 ? UI_ZOOM_WHEEL_STEP : -UI_ZOOM_WHEEL_STEP);
  }, { passive: false, capture: true });

  window.addEventListener("keydown", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;

    const key = event.key;
    if (key === "+" || key === "=" || key === "Add") {
      event.preventDefault();
      stepUiZoom(UI_ZOOM_STEP);
      return;
    }

    if (key === "-" || key === "_" || key === "Subtract") {
      event.preventDefault();
      stepUiZoom(-UI_ZOOM_STEP);
      return;
    }

    if (key === "0") {
      event.preventDefault();
      applyUiZoom(DEFAULT_UI_ZOOM);
    }
  });
}

function setAgentName(nextName) {
  const normalized = String(nextName || "").trim() || DEFAULT_AGENT_NAME;
  agentName = normalized;
  document.title = normalized;
  if (brandNameEl) brandNameEl.textContent = `${normalized} AI Agent`;
  if (graphEl) graphEl.setAttribute("aria-label", `${normalized} memory graph`);
  const input = document.getElementById("msg-input");
  if (input && !chat?.isComposerLocked?.()) input.placeholder = defaultInputPlaceholder();
  document.querySelectorAll(".msg-pulse .msg-label").forEach((el) => {
    el.textContent = normalized;
  });
}

async function loadAgentProfile() {
  try {
    const res = await fetch(`${API}/agent-profile`);
    if (!res.ok) return;
    const data = await res.json();
    setAgentName(data.name);
  } catch {}
}

const physicsSettings = {
  gravity: 1,
  repulsion: 1.35,
  nodeSize: 1,
};

requestAnimationFrame(() => {
  if (themeSwitcher) themeSwitcher.classList.add("visible");
  if (resetViewBtn) resetViewBtn.classList.add("visible");
  if (physicsControl) physicsControl.classList.add("visible");
});

async function initUpdaterUi() {
  if (!checkUpdateBtn || !updateStatusEl) return;

  const compactStrip = document.getElementById("update-compact-strip");
  const detail = document.getElementById("update-card-detail");
  if (compactStrip && detail) {
    const chev = compactStrip.querySelector(".update-compact-chevron");
    compactStrip.addEventListener("click", () => {
      const open = detail.hidden;
      detail.hidden = !open;
      compactStrip.setAttribute("aria-expanded", open ? "true" : "false");
      if (chev) chev.textContent = open ? "▴" : "▾";
      updateCardEl?.classList.toggle("update-card--open", open);
    });
  }

  const bridge = window.pulse;
  if (!bridge?.isElectron) {
    setUpdateStatus("仅桌面版可用", "muted");
    setUpdateButtonState({ disabled: true, label: "不可用" });
    return;
  }

  setUpdateStatus("准备检查版本", "idle");

  try {
    const version = await bridge.getVersion?.();
    if (version) setUpdateStatus(`当前版本 ${version}`, "idle");
  } catch {}

  removeUpdaterStatusListener = bridge.onUpdaterStatus?.((payload = {}) => {
    const stage = payload.stage || "idle";
    const version = payload.version ? ` ${payload.version}` : "";
    const percent = typeof payload.percent === "number" ? ` (${Math.round(payload.percent)}%)` : "";

    switch (stage) {
      case "checking":
        setUpdateCardHidden(false);
        setUpdateStatus("正在检查更新…", "checking");
        setUpdateButtonState({ disabled: true, label: "检查中" });
        break;
      case "available":
        setUpdateCardHidden(false);
        setUpdateStatus(`发现新版本${version}，开始下载`, "available");
        setUpdateButtonState({ disabled: true, label: "下载中" });
        break;
      case "downloading":
        setUpdateCardHidden(false);
        setUpdateStatus(`正在下载更新${percent}`, "downloading");
        setUpdateButtonState({ disabled: true, label: "下载中" });
        break;
      case "downloaded":
        setUpdateCardHidden(false);
        setUpdateStatus(`新版本${version} 已下载，关闭重开即可安装`, "ready");
        setUpdateButtonState({ disabled: false, label: "重新检查" });
        break;
      case "error":
        setUpdateCardHidden(false);
        setUpdateStatus(`更新失败：${payload.message || "请稍后重试"}`, "error");
        setUpdateButtonState({ disabled: false, label: "重试更新" });
        break;
      case "dev":
        setUpdateCardHidden(false);
        setUpdateStatus(payload.message || "开发模式下不检查更新", "muted");
        setUpdateButtonState({ disabled: true, label: "开发模式" });
        break;
      default:
        setUpdateStatus(payload.message || `当前版本 ${payload.currentVersion || ""}`.trim(), "idle");
        setUpdateButtonState({ disabled: false, label: "检查更新" });
        if (/latest|已是|最新/i.test(payload.message || "")) {
          setUpdateCardHidden(true);
        }
        break;
    }
  }) || null;

  checkUpdateBtn.addEventListener("click", async () => {
    setUpdateCardHidden(false);
    setUpdateStatus("正在检查更新…", "checking");
    setUpdateButtonState({ disabled: true, label: "检查中" });

    try {
      const result = await bridge.checkForUpdates?.();
      if (!result?.ok && result?.message) {
        setUpdateStatus(`更新失败：${result.message}`, "error");
        setUpdateButtonState({ disabled: false, label: "重试更新" });
      }
    } catch (error) {
      setUpdateStatus(`更新失败：${error?.message || "请稍后重试"}`, "error");
      setUpdateButtonState({ disabled: false, label: "重试更新" });
    }
  });

  updateCloseBtn?.addEventListener("click", () => {
    setUpdateCardHidden(true);
  });
}

function readCSSVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function readPhysicsSettings() {
  try {
    const raw = localStorage.getItem(PHYSICS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.gravity === "number") physicsSettings.gravity = parsed.gravity;
      if (typeof parsed.repulsion === "number") physicsSettings.repulsion = parsed.repulsion;
      if (typeof parsed.nodeSize === "number") physicsSettings.nodeSize = parsed.nodeSize;
    }
  } catch {}
}

function savePhysicsSettings() {
  try {
    localStorage.setItem(PHYSICS_STORAGE_KEY, JSON.stringify(physicsSettings));
  } catch {}
}

function updatePhysicsReadout() {
  gravitySlider.value = String(physicsSettings.gravity);
  repulsionSlider.value = String(physicsSettings.repulsion);
  nodeSizeSlider.value = String(physicsSettings.nodeSize);
  gravityValue.textContent = `${physicsSettings.gravity.toFixed(2)}x`;
  repulsionValue.textContent = `${physicsSettings.repulsion.toFixed(2)}x`;
  nodeSizeValue.textContent = `${physicsSettings.nodeSize.toFixed(2)}x`;
}

let themeColors = {};
function refreshThemeColors() {
  themeColors = {
    cool: readCSSVar("--cool"),
    warm: readCSSVar("--warm"),
    nodeLow: readCSSVar("--node-low"),
    nodeHigh: readCSSVar("--node-high"),
    dim: readCSSVar("--dim"),
    ink2: readCSSVar("--ink2"),
    linkStroke: readCSSVar("--link-stroke"),
    bg0: readCSSVar("--bg0"),
  };
}

const ALLOWED_THEME_MODES = new Set(["linear"]);
function normalizeThemeMode(theme) {
  const value = String(theme || "").trim();
  if (ALLOWED_THEME_MODES.has(value)) return value;
  return "linear";
}

function applyTheme(theme) {
  const nextTheme = normalizeThemeMode(theme);
  document.body.dataset.theme = nextTheme;
  try { localStorage.setItem(THEME_KEY, nextTheme); } catch {}
  document.querySelectorAll(".appearance-mode-btn").forEach(el => {
    const active = el.dataset.themeValue === nextTheme;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", active ? "true" : "false");
  });
  setTimeout(() => {
    refreshThemeColors();
    renderLegend();
    if (MEMORY_GRAPH_ENABLED && nodeSel && !nodeSel.empty()) {
      refreshNodeVisuals();
      linkSel.attr("stroke", themeColors.linkStroke);
    }
  }, 20);
}

(function initTheme() {
  let saved = "linear";
  try { saved = normalizeThemeMode(localStorage.getItem(THEME_KEY) || "linear"); } catch {}
  applyTheme(saved);
})();

if (themeSwitcher) {
  themeSwitcher.querySelectorAll(".appearance-mode-btn").forEach((el) => {
    el.addEventListener("click", () => applyTheme(el.dataset.themeValue));
  });
}

if (physicsToggle && physicsControl) {
  physicsToggle.addEventListener("click", () => {
    const nextOpen = !physicsControl.classList.contains("open");
    physicsControl.classList.toggle("open", nextOpen);
    physicsToggle.setAttribute("aria-expanded", String(nextOpen));
  });
}

gravitySlider?.addEventListener("input", () => {
  physicsSettings.gravity = Number(gravitySlider.value);
  applyPhysicsSettings();
});

repulsionSlider?.addEventListener("input", () => {
  physicsSettings.repulsion = Number(repulsionSlider.value);
  applyPhysicsSettings();
});

nodeSizeSlider?.addEventListener("input", () => {
  physicsSettings.nodeSize = Number(nodeSizeSlider.value);
  applyPhysicsSettings();
});

let W = window.innerWidth;
let H = window.innerHeight;

const svg = d3.select("#graph").attr("width", W).attr("height", H);
const tip = d3.select("#tip");

const defs = svg.append("defs");
defs.html(`
  <filter id="neb-glow" x="-70%" y="-70%" width="240%" height="240%">
    <feGaussianBlur stdDeviation="3.2" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
`);

const world = svg.append("g");
const gLink = world.append("g").attr("stroke-linecap", "round");
const gNode = world.append("g");

const zoom = d3.zoom()
  .scaleExtent([0.1, 5])
  .filter(event => event.type === "wheel")
  .on("zoom", event => world.attr("transform", event.transform));

svg.call(zoom);
svg.on("wheel.zoom", null);
svg.on("dblclick.zoom", null);

svg.node().addEventListener("wheel", event => {
  event.preventDefault();
  const current = d3.zoomTransform(svg.node());
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  const nextScale = Math.max(0.1, Math.min(5, current.k * factor));
  const k = nextScale / current.k;
  const px = W / 2, py = H / 2;
  const nextX = px - (px - current.x) * k;
  const nextY = py - (py - current.y) * k;
  svg.call(zoom.transform, d3.zoomIdentity.translate(nextX, nextY).scale(nextScale));
}, { passive: false });

function resetZoom() {
  svg.transition().duration(420).call(
    zoom.transform,
    d3.zoomIdentity
  );
}

const glowSet = new Map();
const usePulseSet = new Map();
let linkData = [];
let nodeData = [];
let linkSel = gLink.selectAll("line");
let nodeSel = gNode.selectAll("circle");

const nodeCountEl = document.getElementById("node-count");
const linkCountEl = document.getElementById("link-count");
const connStateEl = document.getElementById("conn-state");

function updateStats() {
  if (nodeCountEl) nodeCountEl.textContent = String(nodeData.length);
  if (linkCountEl) linkCountEl.textContent = String(linkData.length);
}

function setConnectionState(text, live = true) {
  if (!connStateEl) return;
  connStateEl.innerHTML = live
    ? `<span class="live-dot"></span>${text}`
    : text;
  connStateEl.classList.toggle("live", live);
}

function isGlowing(nid) {
  const expiry = glowSet.get(nid);
  if (!expiry) return false;
  if (Date.now() > expiry) { glowSet.delete(nid); return false; }
  return true;
}

function highlightNodes(nids, duration = 2400) {
  if (!MEMORY_GRAPH_ENABLED || !sim) return;
  if (!nids || !nids.length) return;
  const now = Date.now();
  const expiry = now + duration;
  nids.forEach(nid => {
    const key = String(nid);
    glowSet.set(key, expiry);
    usePulseSet.set(key, { start: now, end: expiry });
  });
  refreshNodeVisuals();
  sim.alpha(Math.max(sim.alpha(), 2)).restart();
  setTimeout(() => {
    nids.forEach(nid => {
      const key = String(nid);
      glowSet.delete(key);
      usePulseSet.delete(key);
    });
    refreshNodeVisuals();
  }, duration + 80);
}

function nodeUseProgress(nid) {
  const key = String(nid);
  const pulse = usePulseSet.get(key);
  if (!pulse) return 0;
  const now = Date.now();
  if (now >= pulse.end) {
    usePulseSet.delete(key);
    return 0;
  }
  const total = Math.max(1, pulse.end - pulse.start);
  return 1 - ((now - pulse.start) / total);
}

function nodeStrength(d) {
  if (typeof d._strength !== "number") {
    const deg = Math.min(1, (d._deg || 0) / 12);
    d._strength = 0.35 + deg * 0.55;
  }
  return d._strength;
}

function nodeColor(d) {
  if (d._core) return themeColors.warm || "#d39872";
  const age = (Date.now() - (d._ts || Date.now())) / 18000;
  const fade = Math.max(0.25, 1 - age);
  const t = 0.18 + nodeStrength(d) * 0.5 * fade;
  const interp = d3.interpolateRgb(themeColors.nodeLow || "#3a556e", themeColors.nodeHigh || "#cfe3f5");
  let color = interp(Math.min(1, t));
  const base = d3.color(color);
  if (base) color = base.darker(0.55) + "";
  const useBoost = nodeUseProgress(d._nid);
  if (isGlowing(d._nid) || useBoost > 0) {
    const c = d3.color(color);
    if (c) return c.brighter(2 + useBoost * 2) + "";
  }
  return color;
}

function nodeRadius(d) {
  const base = d._core ? 9 : 3.4 + Math.min((d._deg || 0) * 0.9, 5.4);
  const childScale = 1 + Math.min(1.5, (d._childCount || 0) * 0.18);
  const useBoost = nodeUseProgress(d._nid);
  const glowScale = isGlowing(d._nid) ? 1.08 : 1;
  const pulseScale = 1 + (Math.sin((1 - useBoost) * Math.PI * 3) * 0.04 + useBoost * 0.12);
  const scaledBase = base * physicsSettings.nodeSize;
  return Math.min(scaledBase * 2.5, scaledBase * childScale * glowScale * Math.max(1, pulseScale));
}

const sim = MEMORY_GRAPH_ENABLED
  ? d3.forceSimulation()
    .force("link", d3.forceLink().id(d => d._nid))
    .force("charge", d3.forceManyBody())
    .force("center", d3.forceCenter(W / 2, H / 2 - 10))
    .force("x", d3.forceX(W / 2))
    .force("y", d3.forceY(H / 2 - 10))
    .force("radial", d3.forceRadial(180, W / 2, H / 2 - 10))
    .force("collision", d3.forceCollide())
    .alphaDecay(0.028)
    .velocityDecay(0.3)
    .on("tick", tick)
  : null;

function linkDistance(link) {
  const countFactor = Math.min(34, Math.sqrt(Math.max(1, nodeData.length)) * 4.2);
  if (link._kind === "visual_parent") return 82 + countFactor * 0.45;
  if (link._kind === "visual_random") return 108 + countFactor;
  return 76 + countFactor * 0.55;
}

function linkStrength(link) {
  if (link._kind === "visual_parent") return 0.2;
  if (link._kind === "visual_random") return 0.035;
  return 0.16;
}

function chargeStrength(node) {
  const countBoost = Math.min(76, Math.sqrt(Math.max(1, nodeData.length)) * 3.5);
  const baseCharge = -92 - countBoost * 0.4 - (node._deg || 0) * 2.4 - (node._childCount || 0) * 1.2;
  return baseCharge * physicsSettings.repulsion;
}

function radialStrength() {
  const baseSpread = nodeData.length > 36 ? 0.1 : 0.1;
  return baseSpread * physicsSettings.gravity;
}

function centerPullStrength() {
  const basePull = nodeData.length > 36 ? 0.04 : 0.055;
  return basePull * physicsSettings.gravity;
}

function collisionRadius(node) {
  const countPadding = nodeData.length > 36 ? 6 : 4;
  return nodeRadius(node) + countPadding;
}

function updateSimulationForces() {
  if (!MEMORY_GRAPH_ENABLED || !sim) return;
  sim.force("link")
    .distance(linkDistance)
    .strength(linkStrength);

  sim.force("charge")
    .strength(chargeStrength);

  sim.force("x")
    .x(W / 2)
    .strength(centerPullStrength());

  sim.force("y")
    .y(H / 2 - 10)
    .strength(centerPullStrength());

  sim.force("radial")
    .radius(Math.min(Math.max(24, Math.sqrt(Math.max(1, nodeData.length)) * 6), 64))
    .x(W / 2)
    .y(H / 2 - 10)
    .strength(radialStrength());

  sim.force("collision")
    .radius(collisionRadius)
    .strength(0.82)
    .iterations(nodeData.length > 40 ? 2 : 1);
}

function applyPhysicsSettings(restartAlpha = 2) {
  updatePhysicsReadout();
  if (!MEMORY_GRAPH_ENABLED || !sim) {
    savePhysicsSettings();
    return;
  }
  updateSimulationForces();
  refreshNodeVisuals();
  sim.alpha(Math.max(sim.alpha(), restartAlpha)).restart();
  savePhysicsSettings();
}

function refreshNodeVisuals() {
  if (!MEMORY_GRAPH_ENABLED) return;
  if (!nodeSel || nodeSel.empty()) return;
  nodeSel
    .attr("r", nodeRadius)
    .attr("fill", nodeColor)
    .attr("filter", d => (d._core || isGlowing(d._nid) || nodeUseProgress(d._nid) > 0) ? "url(#neb-glow)" : null)
    .style("animation", d => nodeUseProgress(d._nid) > 0 ? "neb-node-use 10s ease-out" : null);
}

function dampTangentialMotion() {
  if (!MEMORY_GRAPH_ENABLED || !sim) return;
  const cx = W / 2;
  const cy = H / 2 - 10;
  const twitching = sim.alpha() > 0.45;

  nodeData.forEach(node => {
    if (!node || node.fx != null || node.fy != null) return;

    const dx = (node.x ?? cx) - cx;
    const dy = (node.y ?? cy) - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return;

    const rx = dx / dist;
    const ry = dy / dist;
    const tx = -ry;
    const ty = rx;
    const vx = node.vx || 0;
    const vy = node.vy || 0;
    const radialVelocity = vx * rx + vy * ry;
    const tangentialVelocity = vx * tx + vy * ty;
    const tangentialDamping = twitching ? 0.14 : 0.24;

    node.vx = radialVelocity * rx + tangentialVelocity * tangentialDamping * tx;
    node.vy = radialVelocity * ry + tangentialVelocity * tangentialDamping * ty;
  });
}

function naturalTwitch() {
  if (!MEMORY_GRAPH_ENABLED || !sim) return;
  if (nodeData.length < 2) {
    sim.alpha(1).restart();
    return;
  }

  const nodeById = new Map(nodeData.map(node => [String(node._nid), node]));
  const anchorMap = new Map();
  linkData.forEach(link => {
    if (link._kind !== "visual_parent" && link._kind !== "visual_random") return;
    const sourceId = typeof link.source === "object" ? String(link.source._nid) : String(link.source);
    const targetId = typeof link.target === "object" ? String(link.target._nid) : String(link.target);
    if (!anchorMap.has(sourceId) && nodeById.has(targetId)) {
      anchorMap.set(sourceId, nodeById.get(targetId));
    }
  });

  const twitchCount = Math.max(6, Math.floor(nodeData.length * 0.3));
  const candidates = shuffleArray(nodeData.filter(node => !node._core)).slice(0, twitchCount);

  candidates.forEach(node => {
    const anchor = anchorMap.get(String(node._nid)) || nodeData[deterministicIndex(node._nid, nodeData.length)];
    if (!anchor) return;

    const anchorX = anchor.x ?? (W / 2);
    const anchorY = anchor.y ?? (H / 2 - 10);
    const angle = Math.random() * Math.PI * 2;
    const offset = 36 + Math.random() * 52;
    const nextX = anchorX + Math.cos(angle) * offset;
    const nextY = anchorY + Math.sin(angle) * offset;
    const currentX = node.x ?? nextX;
    const currentY = node.y ?? nextY;

    node.x = currentX * 0.7 + nextX * 0.3;
    node.y = currentY * 0.7 + nextY * 0.3;
    node.vx = (node.vx || 0) + (nextX - currentX) * 0.14;
    node.vy = (node.vy || 0) + (nextY - currentY) * 0.14;
  });

  sim.alpha(0.85).restart();
}

function tick() {
  if (!MEMORY_GRAPH_ENABLED) return;
  dampTangentialMotion();

  linkSel
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);

  nodeSel
    .attr("cx", d => d.x)
    .attr("cy", d => d.y);
}

function computeDegrees() {
  const nodeById = new Map(nodeData.map(n => [n._nid, n]));
  nodeData.forEach(n => {
    n._deg = 0;
    n._childCount = 0;
  });
  linkData.forEach(l => {
    const s = typeof l.source === "object" ? l.source : nodeById.get(String(l.source));
    const t = typeof l.target === "object" ? l.target : nodeById.get(String(l.target));
    if (s) s._deg = (s._deg || 0) + 1;
    if (t) t._deg = (t._deg || 0) + 1;
  });

  nodeData.forEach(node => {
    const childTargets = semanticChildTargets(node);
    if (childTargets.size) {
      node._childCount = childTargets.size;
      return;
    }

    const selfId = String(node._nid || "");
    node._childCount = nodeData.reduce((count, candidate) => (
      candidate.parent_id != null && String(candidate.parent_id) === selfId ? count + 1 : count
    ), 0);
  });
}

function showTip(event, d) {
  const label = d.title || (d.content || "").slice(0, 120) || d._nid;
  const type = d._core ? "self" : (d.event_type || "memory");
  tip
    .style("display", "block")
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY + 12}px`)
    .html(`<span class="tip-type">${type}</span><div>${label}</div>`);
}

function parseEntities(raw) {
  try {
    const p = typeof raw === "string" ? JSON.parse(raw || "[]") : (raw || []);
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

function parseLinks(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : (raw || []);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function semanticChildTargets(node) {
  const targets = new Set();
  parseLinks(node.links).forEach(link => {
    if (!link || typeof link !== "object") return;
    const relation = String(link.relation || "").toLowerCase();
    const targetId = String(link.target_id || link.targetId || "").trim();
    if (relation === "parent_of" && targetId) targets.add(targetId);
  });
  return targets;
}

function markCore() {
  nodeData.forEach(n => { n._core = false; });
  const core = nodeData.find(n => parseEntities(n.entities).includes("agent:pulse"))
    || nodeData[0];
  if (core) core._core = true;
}

function renderLegend() {
  const el = document.getElementById("legend");
  if (!el) return;
  const total = nodeData.length;
  const active = nodeData.filter(n => (Date.now() - (n._ts || 0)) < 15000).length;
  const known = Math.max(0, total - active - 1);
  const decayed = nodeData.filter(n => (Date.now() - (n._ts || 0)) > 60000).length;

  const items = [
    { name: "限制", count: 1, color: themeColors.warm },
    { name: "记忆", count: active, color: themeColors.nodeHigh },
    { name: "知识", count: known, color: themeColors.cool },
    { name: "衰减", count: decayed, color: themeColors.dim },
  ];

  el.innerHTML = items.map(i =>
    `<div class="legend-item">
      <span class="legend-dot" style="background:${i.color}"></span>
      <span class="legend-name">${i.name}</span>
      <span class="legend-count">${i.count}</span>
    </div>`
  ).join("");
}

function renderGraph(restartAlpha = 2) {
  if (!MEMORY_GRAPH_ENABLED || !sim) {
    updateStats();
    renderLegend();
    return;
  }
  computeDegrees();
  markCore();
  updateStats();
  renderLegend();

  linkSel = linkSel.data(linkData, d => d._lid);
  linkSel.exit().remove();
  linkSel = linkSel.enter().append("line")
    .attr("stroke", themeColors.linkStroke || "rgba(143,182,216,0.18)")
    .attr("stroke-width", 0.6)
    .merge(linkSel);

  nodeSel = nodeSel.data(nodeData, d => d._nid);
  nodeSel.exit().transition().duration(280).attr("r", 0).remove();

  const enter = nodeSel.enter().append("circle")
    .attr("r", 0)
    .attr("fill", nodeColor)
    .style("cursor", "pointer")
    .call(d3.drag()
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(2).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x; d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      }))
    .on("mouseover", showTip)
    .on("mousemove", event => {
      tip.style("left", `${event.clientX + 14}px`)
         .style("top", `${event.clientY + 12}px`);
    })
    .on("mouseout", () => tip.style("display", "none"))
    .on("click", (event, d) => {
      d._ts = Date.now();
      d._strength = Math.min(1, (d._strength || 0.5) + 0.25);
      highlightNodes([d._nid], 900);
    });

  enter.transition().duration(360).attr("r", nodeRadius);
  nodeSel = enter.merge(nodeSel);

  sim.nodes(nodeData);
  sim.force("link").links(linkData);
  updateSimulationForces();
  sim.alpha(0.5).restart();
  refreshNodeVisuals();
}

function deterministicIndex(seed, mod) {
  let hash = 2166136261;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % mod;
}

function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createVisualOrder(nodes) {
  const coreNode = nodes.find(n => n._core || parseEntities(n.entities).includes("agent:pulse")) || null;
  const rest = shuffleArray(nodes.filter(n => !coreNode || n._nid !== coreNode._nid));
  return coreNode ? [coreNode, ...rest] : rest;
}

function chooseVisualParent(child, candidates, childCounts) {
  if (!candidates.length) return null;
  const weighted = [];
  candidates.forEach(candidate => {
    const currentChildren = childCounts.get(candidate._nid) || 0;
    const maxChildren = maxVisualChildren(candidate);
    const recencyBias = Math.max(0, 400000 - Math.abs((child._ts || 0) - (candidate._ts || 0))) / 100000;
    const coreBias = candidate._core ? 1.4 : 0;
    const strengthBias = (candidate._strength || 0.4) * 0.8;
    const remainingCapacity = Math.max(0, maxChildren - currentChildren);
    const capacityBias = currentChildren === 0 ? 1.2 : 0.35 + remainingCapacity * 0.25;
    const entryCount = 1 + Math.max(0, Math.round((recencyBias + coreBias + strengthBias + capacityBias) * 2));
    for (let w = 0; w < entryCount; w++) {
      weighted.push(candidate);
    }
  });
  if (!weighted.length) return candidates[Math.floor(Math.random() * candidates.length)] || null;
  return weighted[Math.floor(Math.random() * weighted.length)] || null;
}

function getCurrentVisualChildCounts(nodes) {
  const counts = new Map(nodes.map(n => [n._nid, 0]));
  linkData.forEach(link => {
    if (link._kind !== "visual_parent") return;
    const parentId = typeof link.target === "object" ? String(link.target._nid) : String(link.target);
    counts.set(parentId, (counts.get(parentId) || 0) + 1);
  });
  return counts;
}

function maxVisualChildren(node) {
  if (!node) return 2;
  if (node._core) return 4;
  const degree = node._deg || 0;
  const strength = node._strength || 0;
  return (degree >= 4 || strength >= 0.72) ? 4 : 2;
}

function addSupplementalVisualLinks(linkSet, childCounts) {
  const ordered = createVisualOrder(nodeData);
  const extraLinks = Math.min(18, Math.max(2, Math.floor(nodeData.length / 5)));
  let added = 0;

  for (let i = 1; i < ordered.length && added < extraLinks; i++) {
    const source = ordered[i];
    const candidates = shuffleArray(
      ordered.slice(0, i).filter(node => {
        if (node._nid === source._nid) return false;
        return (childCounts.get(node._nid) || 0) < maxVisualChildren(node);
      })
    );

    const target = candidates[0];
    if (!target) continue;

    const lid = `visual-extra:${source._nid}=>${target._nid}`;
    const rev = `visual-extra:${target._nid}=>${source._nid}`;
    const base = `visual:${source._nid}=>${target._nid}`;
    const baseRev = `visual:${target._nid}=>${source._nid}`;
    if (linkSet.has(lid) || linkSet.has(rev) || linkSet.has(base) || linkSet.has(baseRev)) continue;

    linkSet.add(lid);
    linkData.push({ source: source._nid, target: target._nid, _lid: lid, _kind: "visual_random" });
    childCounts.set(target._nid, (childCounts.get(target._nid) || 0) + 1);
    added += 1;
  }
}

function addRandomVisualLinks(linkSet) {
  if (nodeData.length < 2) return;

  const ordered = createVisualOrder(nodeData);
  const childCounts = new Map(ordered.map(n => [n._nid, 0]));

  for (let i = 1; i < ordered.length; i++) {
    const child = ordered[i];
    const candidates = ordered
      .slice(0, i)
      .filter(node => (childCounts.get(node._nid) || 0) < maxVisualChildren(node));

    const parent = chooseVisualParent(child, candidates, childCounts);
    if (!parent || parent._nid === child._nid) continue;

    const lid = `visual:${child._nid}=>${parent._nid}`;
    const rev = `visual:${parent._nid}=>${child._nid}`;
    if (linkSet.has(lid) || linkSet.has(rev)) continue;

    linkSet.add(lid);
    linkData.push({ source: child._nid, target: parent._nid, _lid: lid, _kind: "visual_parent" });
    childCounts.set(parent._nid, (childCounts.get(parent._nid) || 0) + 1);
  }

  addSupplementalVisualLinks(linkSet, childCounts);
}

function findAnchorNode(memory, nodeMap) {
  const nodes = Array.from(nodeMap.values());
  const childCounts = getCurrentVisualChildCounts(nodes);
  const candidates = createVisualOrder(nodes)
    .filter(node => (childCounts.get(node._nid) || 0) < maxVisualChildren(node));
  return chooseVisualParent(memory, candidates, childCounts)
    || nodeData.find(n => n._core)
    || nodeData[0]
    || null;
}

async function loadMemories() {
  if (!MEMORY_GRAPH_ENABLED) return;
  try {
    const rows = await fetch(`${API}/memories?limit=120`).then(r => r.json());
    if (!Array.isArray(rows)) return;

    const prevPositions = new Map(nodeData.map(n => [n._nid, {
      x: n.x, y: n.y, vx: n.vx, vy: n.vy, fx: n.fx, fy: n.fy,
    }]));

    nodeData = rows.map(row => {
      const nid = row.mem_id || String(row.id);
      const prev = prevPositions.get(nid);
      return {
        ...row,
        _nid: nid,
        _ts: prev ? Date.now() : Date.now() - Math.random() * 8000,
        x: prev ? prev.x : W / 2 + (Math.random() - 0.5) * 180,
        y: prev ? prev.y : H / 2 + (Math.random() - 0.5) * 180,
        vx: prev ? prev.vx : 0,
        vy: prev ? prev.vy : 0,
        fx: prev ? prev.fx : null,
        fy: prev ? prev.fy : null,
      };
    });

    const linkSet = new Set();
    linkData = [];
    addRandomVisualLinks(linkSet);

    renderGraph(1.1);
  } catch (error) {
    console.warn("[graph] load failed:", error.message);
    setConnectionState("Offline", false);
  }
}

function addNewNodes(memories) {
  if (!MEMORY_GRAPH_ENABLED) return;
  const nodeMap = new Map(nodeData.map(n => [n._nid, n]));
  const newNids = [];
  memories.forEach(memory => {
    const nid = memory.id || memory.mem_id;
    if (!nid || nodeMap.has(String(nid))) return;
    const anchor = findAnchorNode(memory, nodeMap);
    const anchorX = anchor?.x ?? W / 2;
    const anchorY = anchor?.y ?? (H / 2 - 10);
    const node = {
      ...memory,
      _nid: String(nid),
      mem_id: String(nid),
      event_type: memory.event_type || memory.type || "fact",
      _ts: Date.now(),
      _strength: 0.85,
      x: anchorX + (Math.random() - 0.5) * 72,
      y: anchorY + (Math.random() - 0.5) * 72,
      vx: 0, vy: 0,
    };
    nodeData.push(node);
    nodeMap.set(node._nid, node);
    newNids.push(node._nid);
  });
  if (!newNids.length) return;

  const linkSet = new Set();
  linkData = [];
  addRandomVisualLinks(linkSet);
  renderGraph(2);
  highlightNodes(newNids, 10000);
}

if (MEMORY_GRAPH_ENABLED) {
  setInterval(() => naturalTwitch(), 6000);
  setInterval(() => { nodeData.forEach(n => { if (n._strength) n._strength *= 0.97; }); }, 2500);
}

function parseUserMessageInput(raw) {
  const text = String(raw || "");
  const match = text.match(/^\[([^\]]+)\]\s+(\S+)\s+\[([^\]]+)\]\s+([\s\S]*)$/);
  if (!match) return { content: text.trim(), time: null };
  return { fromId: match[1], timestamp: match[2], channel: match[3], content: match[4].trim(), time: formatMsgTime(match[2]) };
}

function formatMsgTime(stamp) {
  if (!stamp) return null;
  const m = String(stamp).match(/T(\d{2}):(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}:${m[3]}`;
  const m2 = String(stamp).match(/(\d{2}):(\d{2}):(\d{2})/);
  if (m2) return `${m2[1]}:${m2[2]}:${m2[3]}`;
  return null;
}

const L1 = new ThoughtStream("si-l1", "cool", {
  readCSSVar,
  thinkingLabel: "正在思考中",
  thinkingDoneLabel: "思考完成",
  toolDetailLength: 140,
});
const L2 = new ThoughtStream("si-l2", "warm", {
  readCSSVar,
  thinkingLabel: "思考中",
  thinkingDoneLabel: "思考完成",
  toolDetailLength: 220,
});

// L1 = 用户消息触发的处理流；L2 = TICK 触发的处理流。
// 后端 emit 的 stream_*/tool_call 事件不带路径标记，
// 通过最近一次 message_received / tick 事件来决定路由到哪块面板。
let currentPath = "l2";
function currentStream() { return currentPath === "l1" ? L1 : L2; }

function isBusyErrorMessage(message = "") {
  return /(429|rate limit|too many requests|busy|overload|temporarily unavailable|server busy|resource exhausted)/i.test(String(message || ""));
}

function formatRetryDelay(ms) {
  if (!ms || ms < 1000) return `${ms || 0}ms`;
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}

let tokenAccum = 0;
let tokenWindow = Date.now();
const tokRateEl = document.getElementById("tok-rate");

function bumpTokens(text) {
  tokenAccum += (text || "").length / 3.4;
  const now = Date.now();
  if (now - tokenWindow > 700) {
    const rate = tokenAccum / ((now - tokenWindow) / 1000);
    if (tokRateEl) tokRateEl.textContent = rate.toFixed(1);
    tokenAccum = 0;
    tokenWindow = now;
    setTimeout(() => {
      if (tokRateEl && tokRateEl.textContent !== "—" && tokenAccum === 0) {
        tokRateEl.textContent = "—";
      }
    }, 4000);
  }
}

// ── AI 工作台折叠 + 状态摘要 ───────────────────────────────
const AI_WORKBENCH_KEY = "pulse_ai_workbench_expanded";
function setAiWorkbenchExpanded(expanded) {
  const wrap = document.getElementById("ai-workbench");
  const body = document.getElementById("ai-workbench-body");
  const chevron = document.getElementById("aw-chevron");
  const btn = document.getElementById("ai-workbench-toggle");
  if (!wrap || !body) return;
  wrap.dataset.collapsed = expanded ? "0" : "1";
  body.hidden = !expanded;
  if (chevron) chevron.textContent = expanded ? "收起 ▴" : "展开 ▾";
  if (btn) btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  try { localStorage.setItem(AI_WORKBENCH_KEY, expanded ? "1" : "0"); } catch (_) {}
}
function setAiWorkbenchStatus(label, level = "idle") {
  const t = document.getElementById("aw-state-text");
  const dot = document.getElementById("aw-state-dot");
  if (t) t.textContent = label;
  if (dot) dot.dataset.level = level;
}
function initAiWorkbench() {
  const btn = document.getElementById("ai-workbench-toggle");
  if (!btn) return;
  let expanded = false;
  try { expanded = localStorage.getItem(AI_WORKBENCH_KEY) === "1"; } catch (_) {}
  setAiWorkbenchExpanded(expanded);
  btn.addEventListener("click", () => {
    const cur = document.getElementById("ai-workbench")?.dataset.collapsed === "0";
    setAiWorkbenchExpanded(!cur);
  });
}

function handleAiWorkbenchEvent(type, _data) {
  switch (type) {
    case "message_received":
      setAiWorkbenchStatus("正在思考…", "thinking");
      break;
    case "tool_call":
      setAiWorkbenchStatus("正在调用工具", "tool");
      break;
    case "stream_chunk":
    case "stream_start":
      setAiWorkbenchStatus("正在响应", "streaming");
      break;
    case "injector_result":
      setAiWorkbenchStatus("L2 深度处理", "deep");
      break;
    case "stream_end":
    case "response":
    case "message":
      setAiWorkbenchStatus("空闲", "idle");
      break;
    case "error":
      setAiWorkbenchStatus("出错", "error");
      break;
    default:
      break;
  }
}

function connectSSE() {
  setConnectionState("connecting", true);
  const es = new EventSource(`${API}/events`);

  es.onopen = () => setConnectionState("已连接", true);

  es.onmessage = event => {
    try { handle(JSON.parse(event.data)); } catch (_) {}
  };

  es.onerror = () => {
    setConnectionState("reconnect", false);
    setStatusOffline();
    es.close();
    setTimeout(connectSSE, 3000);
  };
}

function extractNids(memList) {
  return (memList || [])
    .map(m => m.mem_id || (m.id != null ? String(m.id) : null))
    .filter(Boolean);
}

function handle({ type, data = {} }) {
  try { handleStatusEvent(type, data); } catch (_) {}
  try { handleThinkingEvent(type, data); } catch (_) {}
  try { handleErrorEvent(type, data); } catch (_) {}
  try { handleTaskEvent(type, data); } catch (_) {}
  try { handleBizTaskEvent(type, data); } catch (_) {}
  try { handleAiWorkbenchEvent(type, data); } catch (_) {}
  if (type === "reminder_changed") {
    try { window.dispatchEvent(new CustomEvent("nimo:reminder-changed", { detail: data })); } catch {}
  }
  if (type === "reminder_fired") {
    try { window.dispatchEvent(new CustomEvent("nimo:reminder-fired", { detail: data })); } catch {}
  }
  if (type === "device_changed") {
    try { window.dispatchEvent(new CustomEvent("nimo:device-changed", { detail: data })); } catch {}
  }
  if (type === "reading_document_changed") {
    try { window.dispatchEvent(new CustomEvent("nimo:reading-document-changed", { detail: data })); } catch {}
  }
  switch (type) {
    case "message_received": {
      currentPath = "l1";
      const parsed = parseUserMessageInput(data.input);
      L1.newLine("收到用户消息", {
        content: parsed.content,
        time: parsed.time || undefined,
      });
      break;
    }
    case "tick":
      currentPath = "l2";
      L2.newLine("心跳 tick");
      break;
    case "stream_start":
      currentStream().startThinkingSession();
      break;
    case "stream_chunk":
      // 不再显示具体思考内容，仅用于驱动 token 速率指示
      currentStream().clearStatus();
      bumpTokens(data.text);
      break;
    case "stream_end":
      currentStream().stopThinking();
      break;
    case "tool_call":
      currentStream().tool(data.name, data.args, data.result, data.ok);
      break;
    case "response":
      // 一轮完成：停所有动画
      currentStream().end();
      break;
    case "llm_retry": {
      currentStream().startThinkingSession();
      const nextAttempt = Number(data.nextAttempt || 2);
      const delayText = formatRetryDelay(Number(data.delayMs || 0));
      currentStream().setStatus("LLM busy, retry " + nextAttempt + " in " + delayText, "busy");
      break;
    }
    case "message_requeued": {
      currentStream().startThinkingSession();
      const retryCount = Number(data.retryCount || 1);
      currentStream().setStatus("LLM busy, queued retry " + retryCount + "/3", "busy");
      break;
    }
    case "message_dropped":
      currentStream().startThinkingSession();
      currentStream().setStatus("LLM busy, retry limit reached", "failed");
      break;
    case "error":
      if (isBusyErrorMessage(data.error)) {
        currentStream().startThinkingSession();
        currentStream().setStatus("LLM busy, please retry shortly", "busy");
      }
      break;
    case "injector_result": {
      const nids = [...extractNids(data.matchedMemories), ...extractNids(data.recallMemories)];
      if (nids.length) highlightNodes(nids, 10000);
      break;
    }
    case "memories_written":
      if (Array.isArray(data.memories) && data.memories.length) {
        addNewNodes(data.memories);
        showMemoryWrittenToast(data);
      }
      break;
    case "message":
      if (data.from === "consciousness") {
        addMsg("pulse", data.content);
        updatePersonCardFromAssistantText(data.content);
        openChat(true);
      }
      break;
    case "message_in":
      if (data.from_id && data.from_id !== "ID:000001") {
        addMsg("external", data.content, { label: data.from_id, alert: false });
        openChat(true);
      }
      break;
    case "agent_name_updated":
      setAgentName(data.name);
      break;
    case "media_mode":
      window.dispatchEvent(new CustomEvent("pulse:media", { detail: data }));
      break;
    case "hotspot_mode":
      setHotspotMode(!!data.active || data.action === "show" || data.action === "open", { source: "agent_event" });
      break;
    case "doc_panel_mode":
      setDocPanelMode(!!data.active || data.action === "open", { topicId: data.topic || null, source: "agent_event" });
      break;
    case "person_card_mode":
      setPersonCardMode(!!data.active || data.action === "show" || data.action === "open" || data.action === "update", { source: "agent_event", card: data.card || null });
      break;
    case "social_status":
      window.dispatchEvent(new CustomEvent("pulse:social_status", { detail: data }));
      break;
    case "audio_created":
      if (data.autoPlay && data.path) {
        const audioUrl = `${API}/${data.path}`;
        const audioEl = new Audio(audioUrl);
        audioEl.play().catch(() => {});
      }
      break;
    case "tts_reply":
      if (data.text) playTTSReply(data.text);
      break;
    case "startup_self_check_started":
      playPulseStartupSound();
      break;
    default:
      break;
  }
}

// ── Pulse 风格启动自检音效 ───────────────────────────────────────────────────
function playPulseStartupSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;

    // Layer 1: 低频机械嗡鸣（锯齿波，模拟机器上电）
    const drone = ctx.createOscillator();
    const droneGain = ctx.createGain();
    const droneFilter = ctx.createBiquadFilter();
    drone.type = "sawtooth";
    drone.frequency.setValueAtTime(50, t);
    drone.frequency.linearRampToValueAtTime(90, t + 0.5);
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 350;
    droneFilter.Q.value = 3;
    droneGain.gain.setValueAtTime(0, t);
    droneGain.gain.linearRampToValueAtTime(0.09, t + 0.06);
    droneGain.gain.linearRampToValueAtTime(0.06, t + 0.4);
    droneGain.gain.linearRampToValueAtTime(0, t + 0.65);
    drone.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(ctx.destination);
    drone.start(t);
    drone.stop(t + 0.7);

    // Layer 2: 系统上线频率扫描（正弦波，从低到高）
    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweep.type = "sine";
    sweep.frequency.setValueAtTime(280, t + 0.12);
    sweep.frequency.exponentialRampToValueAtTime(2800, t + 1.0);
    sweepGain.gain.setValueAtTime(0, t + 0.12);
    sweepGain.gain.linearRampToValueAtTime(0.13, t + 0.22);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 1.05);
    sweep.connect(sweepGain);
    sweepGain.connect(ctx.destination);
    sweep.start(t + 0.12);
    sweep.stop(t + 1.1);

    // Layer 3: 三声确认哔哔（方波，模拟系统自检通过）
    [[880, 1.15], [1100, 1.28], [1320, 1.41]].forEach(([freq, bt]) => {
      const beep = ctx.createOscillator();
      const beepGain = ctx.createGain();
      const beepFilter = ctx.createBiquadFilter();
      beep.type = "square";
      beep.frequency.value = freq;
      beepFilter.type = "bandpass";
      beepFilter.frequency.value = freq;
      beepFilter.Q.value = 8;
      beepGain.gain.setValueAtTime(0.14, t + bt);
      beepGain.gain.exponentialRampToValueAtTime(0.001, t + bt + 0.075);
      beep.connect(beepFilter);
      beepFilter.connect(beepGain);
      beepGain.connect(ctx.destination);
      beep.start(t + bt);
      beep.stop(t + bt + 0.09);
    });

    setTimeout(() => ctx.close().catch(() => {}), 2500);
  } catch (_) {
    // 浏览器不支持 AudioContext 时静默忽略
  }
}

// ── TTS 语音回复播放 ──────────────────────────────────────────────────────────
let ttsAudioEl = null;

// 供 voice-panel 打断检测调用：停止当前 TTS 播放（不恢复 ASR，由调用方负责）
window.stopTTS = () => {
  if (!ttsAudioEl) return;
  ttsAudioEl.pause();
  try { URL.revokeObjectURL(ttsAudioEl.src); } catch {}
  ttsAudioEl = null;
};

async function playTTSReply(text) {
  try {
    const resp = await fetch(`${API}/tts/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      try { const j = await resp.json(); errMsg = j.error || errMsg; } catch {}
      throw new Error(errMsg);
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    if (ttsAudioEl) { ttsAudioEl.pause(); URL.revokeObjectURL(ttsAudioEl.src); }
    ttsAudioEl = new Audio(url);
    // 停掉云端 ASR，但保持 mic 硬件开着以便打断检测
    window.pulseVoice?.suspendForTTS?.();
    ttsAudioEl.onended = () => {
      URL.revokeObjectURL(url);
      ttsAudioEl = null;
      window.pulseVoice?.resumeAfterMedia();
    };
    ttsAudioEl.onerror = () => {
      ttsAudioEl = null;
      window.pulseVoice?.resumeAfterMedia();
    };
    ttsAudioEl.play().catch(() => {
      window.pulseVoice?.resumeAfterMedia();
    });
  } catch {
    window.pulseVoice?.resumeAfterMedia();
  }
}
window.playTTSReply = playTTSReply;

resetViewBtn?.addEventListener("click", resetZoom);

document.querySelectorAll(".panel, .console, .theme-switcher, .reset-view").forEach(el => {
  el.addEventListener("wheel", event => event.stopPropagation(), { passive: true });
});

physicsControl?.addEventListener("wheel", event => event.stopPropagation(), { passive: true });

window.addEventListener("resize", () => {
  W = window.innerWidth;
  H = window.innerHeight;
  svg.attr("width", W).attr("height", H);
  if (!MEMORY_GRAPH_ENABLED || !sim) return;
  sim.force("center", d3.forceCenter(W / 2, H / 2 - 10))
     .force("x", d3.forceX(W / 2))
     .force("y", d3.forceY(H / 2 - 10))
     .force("radial", d3.forceRadial(180, W / 2, H / 2 - 10));
  updateSimulationForces();
  sim.alpha(5).restart();
});

let _lastVisualRefresh = 0;
d3.timer(() => {
  if (!MEMORY_GRAPH_ENABLED) return true;
  if (glowSet.size === 0 && usePulseSet.size === 0) return;
  const now = Date.now();
  if (now - _lastVisualRefresh < 48) return;
  _lastVisualRefresh = now;
  refreshNodeVisuals();
});

setAgentName(DEFAULT_AGENT_NAME);
initUiZoom();

// ── 在线时长追踪 ──
(function initUptimeTracker() {
  const uptimeEl = document.getElementById("uptime-display");
  if (!uptimeEl) return;
  const startedAt = Date.now();
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const mr = m % 60;
    return mr ? `${h}h ${mr}m` : `${h}h`;
  }
  setInterval(() => { uptimeEl.textContent = fmt(Date.now() - startedAt); }, 1000);
  uptimeEl.textContent = "0s";
})();
readPhysicsSettings();
updatePhysicsReadout();
refreshThemeColors();
chat = initChat({
  apiBase: API,
  maxHistory: MAX_CHAT_HISTORY,
  activationWarmupKey: ACTIVATION_WARMUP_KEY,
  getAgentName: () => agentName,
  defaultInputPlaceholder,
  getThreadId: () => activeThreadId,
  onUserMessage: (text) => {
    try { notifyUserSent(); } catch (_) {}
    try { proactiveAssistant?.observeUserMessage?.(text); } catch (_) {}
    if (document.body.classList.contains('hotspot-mode') && /关闭|退出|关掉|隐藏/.test(text)) {
      toggleHotspot();
      return;
    }
    if (document.body.classList.contains('person-card-mode') && /关闭|退出|关掉|隐藏/.test(text)) {
      setPersonCardMode(false, { source: 'chat_input' });
      return;
    }
    const personQuery = extractPersonCardQuery(text);
    if (personQuery) {
      showPersonCardByName(personQuery, { source: 'chat_input' });
    }
    if (/热点|热搜/.test(text) && !document.body.classList.contains('hotspot-mode')) {
      toggleHotspot();
    }
    // 药学训练模式：把当前模式说明注入到发给后端的内容里（UI 展示仍是用户原话）
    const pharmaMode = document.body.dataset.pharmaMode;
    if (document.body.dataset.activeIndustry === 'pharma' && pharmaMode) {
      const modeHeaders = {
        literature: '【训练模式：文献精读】你正在带学生做药学文献精读训练。请按学生学习版输出：研究背景与科学问题、方法和实验设计、关键结果与结论、疾病-靶点-药物-指标证据表、专业术语解释、局限性和可延伸课题。仅用于学习和科研训练。',
        incubator: '【训练模式：课题孵化】你正在带学生孵化药学科研课题。请输出：研究方向、科学假设、文献调研路线、实验/数据验证路线图、可行性与风险评估，以及需要导师确认的问题。',
        experiment: '【训练模式：实验设计】你正在带学生做教学/组会讨论级实验设计训练。请输出：研究目的、变量、对照、模型选择、分组逻辑、关键检测指标、数据分析思路、失败风险、替代方案、伦理安全与合规边界。不要输出危险操作或临床执行指令。'
      };
      const header = modeHeaders[pharmaMode];
      if (header) return `${header}\n\n学生提问：${text}`;
    }
  },
});
document.getElementById("chat-clear-current")?.addEventListener("click", async () => {
  if (!window.confirm("确定清空当前会话的聊天记录吗？")) return;
  try {
    await chat?.clearCurrentThread?.();
    window.dispatchEvent(new CustomEvent("pulse:toast", { detail: { kind: "info", text: "聊天记录已清空" } }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent("pulse:toast", { detail: { kind: "warn", text: `清空失败：${err?.message || "请稍后重试"}` } }));
  }
});
proactiveAssistant = initProactiveAssistant({
  apiBase: API,
  chat,
  getIndustryState: () => activeIndustryState,
});
chat.applyActivationWarmupLock();
function industryThreadId(pack) {
  const id = String(pack?.id || "").trim();
  return id ? `industry_${id}` : "main";
}
function industryThreadTitle(pack) {
  return pack?.name ? `${pack.icon || "🏢"} ${pack.name}工作台` : "主会话";
}
function industryObjectLabels(pack = {}) {
  const labels = pack?.objectLabels || {};
  return {
    streamTitle: labels.streamTitle || "客户沟通",
    workspaceNav: labels.workspaceNav || "客户",
    businessNav: labels.businessNav || "跟进数据",
    literatureNav: labels.literatureNav || (pack?.id === "pharma" ? "文献精读" : "对话"),
    experimentNav: labels.experimentNav || (pack?.id === "pharma" ? "实验设计" : "监督"),
    chatCopy: labels.chatCopy || "",
    placeholder: labels.placeholder || "",
    businessEyebrow: labels.businessEyebrow || "Nimo Reminder",
    businessTitle: labels.businessTitle || "提醒中心",
    businessSub: labels.businessSub || "集中管理备忘、读书计划、到点提醒和久未操作督促。",
    dashboardJump: labels.dashboardJump || "数据概览",
    followupsJump: labels.followupsJump || "跟进列表",
  };
}
function applyChatIndustryChrome(state) {
  activeIndustryState = state || activeIndustryState;
  const pack = activeIndustryState?.activePack || null;
  const chatAreaEl = document.getElementById("chat-area");
  const historyEl = document.getElementById("chat-history");
  const inputEl = document.getElementById("msg-input");
  const customerPanelEl = document.getElementById("cust-panel");
  const dashboardEl = document.getElementById("industry-dashboard");
  const bizBoardEl = document.getElementById("biz-board");
  const promptsBtnEl = document.getElementById("prompts-btn");
  const streamTitleEl = document.querySelector("#panel-l1 .stream-title-text");
  const workspaceTitleEl = document.getElementById("workspace-overview-title");
  const workspaceSubEl = document.getElementById("workspace-overview-sub");
  const workspaceStatusEl = document.getElementById("workspace-overview-status");
  const businessEyebrowEl = document.querySelector(".business-hero-eyebrow");
  const businessTitleEl = document.querySelector(".business-hero-title");
  const businessSubEl = document.querySelector(".business-hero-sub");
  const businessJumpDashboardEl = document.querySelector('[data-business-jump="dashboard-view"]');
  const businessJumpFollowupsEl = document.querySelector('[data-business-jump="followups-view"]');
  const businessNavTargets = ["workspace"];
  const labels = industryObjectLabels(pack);
  document.querySelectorAll("#pulse-app-bar .pharma-nav-extra").forEach((el) => {
    el.hidden = pack?.id !== "pharma";
  });
  document.querySelectorAll("#pulse-app-bar [data-nav=\"workspace\"]").forEach((el) => {
    el.hidden = pack?.id === "pharma" ? true : !pack?.id;
  });
  if (pack?.id) document.body.dataset.activeIndustry = pack.id;
  else delete document.body.dataset.activeIndustry;
  document.body.classList.toggle("casual-chat-mode", !pack?.id);
  if (customerPanelEl) customerPanelEl.hidden = !pack?.id;
  if (dashboardEl) dashboardEl.hidden = !pack?.id;
  if (bizBoardEl) bizBoardEl.hidden = true;
  if (promptsBtnEl) promptsBtnEl.hidden = !pack?.id;
  if (streamTitleEl) streamTitleEl.textContent = pack?.id ? labels.streamTitle : "通用对话";
  if (pack?.id) {
    if (businessEyebrowEl) businessEyebrowEl.textContent = labels.businessEyebrow;
    if (businessTitleEl) businessTitleEl.textContent = labels.businessTitle;
    if (businessSubEl) businessSubEl.textContent = labels.businessSub;
    if (businessJumpDashboardEl) businessJumpDashboardEl.textContent = labels.dashboardJump;
    if (businessJumpFollowupsEl) businessJumpFollowupsEl.textContent = labels.followupsJump;
  }
  for (const target of businessNavTargets) {
    document.querySelectorAll(`#pulse-app-bar [data-nav="${target}"]`).forEach((el) => {
      el.hidden = !pack?.id || (pack?.id === "pharma" && (target === "workspace" || target === "business"));
      if (pack?.id && target === "workspace") {
        el.textContent = labels.workspaceNav;
        el.title = labels.workspaceNav;
      }
      if (pack?.id && target === "business") {
        el.textContent = labels.businessNav;
        el.title = labels.businessNav;
      }
    });
    document.querySelectorAll(`#pulse-left-rail [data-nav="${target}"]`).forEach((el) => {
      el.hidden = !pack?.id;
      const text = target === "workspace" ? labels.workspaceNav : labels.businessNav;
      const labelEl = el.querySelector(".lr-label");
      if (pack?.id && labelEl) labelEl.textContent = text;
      if (pack?.id) el.title = text;
    });
  }
  document.querySelectorAll(`#pulse-app-bar [data-nav="business"]`).forEach((el) => {
    el.hidden = false;
    el.textContent = "提醒";
    el.title = "提醒";
  });
  document.querySelectorAll(`#pulse-app-bar [data-nav="chat"]`).forEach((el) => {
    el.hidden = false;
    const text = "聊天";
    el.textContent = text;
    el.title = text;
  });
  document.querySelectorAll(`#pulse-app-bar [data-nav="activity"]`).forEach((el) => {
    el.hidden = false;
    const text = "总结";
    el.textContent = text;
    el.title = text;
  });
  document.querySelectorAll(`#pulse-left-rail [data-nav="chat"]`).forEach((el) => {
    const text = "聊天";
    const labelEl = el.querySelector(".lr-label");
    if (labelEl) labelEl.textContent = text;
    el.title = text;
  });
  if (!pack?.id) {
    if (agentName !== DEFAULT_AGENT_NAME) setAgentName(DEFAULT_AGENT_NAME);
    if (workspaceTitleEl) workspaceTitleEl.textContent = "Nimo 陪伴模式";
    if (workspaceSubEl) workspaceSubEl.textContent = "提醒、读书、聊天和主动督促都围绕你个人展开，不再绑定行业或客户。";
    if (workspaceStatusEl) workspaceStatusEl.textContent = "陪伴中";
  }
  if (chatAreaEl) {
    if (pack?.id) {
      chatAreaEl.dataset.industry = pack.id;
      chatAreaEl.style.setProperty("--chat-industry-color", pack?.themeColor?.primary || "var(--cool, #8fb6d8)");
    } else {
      delete chatAreaEl.dataset.industry;
      chatAreaEl.style.removeProperty("--chat-industry-color");
    }
  }
  if (historyEl) {
    if (pack?.id) {
      historyEl.dataset.industry = pack.id;
      historyEl.dataset.industryName = pack?.name || "";
      if (pack.id === "ecommerce") {
        historyEl.dataset.industryCopy = `🛒 ${pack.name || "电商"} 专属会话 · 聚焦店铺、投流、转化、复购和售后`;
      } else if (pack.id === "tech") {
        historyEl.dataset.industryCopy = `💻 ${pack.name || "科技"} 专属会话 · 聚焦线索、Demo、POC、决策角色和交付`;
      } else if (labels.chatCopy) {
        historyEl.dataset.industryCopy = labels.chatCopy;
      } else {
        historyEl.dataset.industryCopy = `${pack.icon || "🏢"} ${pack.name || "行业"} 专属会话 · 客户、记忆、知识和热点按当前行业工作区隔离`;
      }
    } else {
      delete historyEl.dataset.industry;
      delete historyEl.dataset.industryName;
      delete historyEl.dataset.industryCopy;
    }
  }
  if (inputEl && !chat?.isComposerLocked?.()) {
    inputEl.placeholder = pack?.name
      ? (labels.placeholder || `问 ${agentName}（${pack.name}工作台）…`)
      : defaultInputPlaceholder();
  }
}
function unlockCasualChatUi(state) {
  const pack = state?.activePack || null;
  if (pack?.id) return;
  document.getElementById("chat-area")?.removeAttribute("hidden");
  document.getElementById("chat-area")?.style.removeProperty("display");
  const input = document.getElementById("msg-input");
  const send = document.getElementById("send-btn");
  if (input) {
    input.disabled = false;
    input.readOnly = false;
    if (!input.placeholder || /客户|行业|工作台/.test(input.placeholder)) {
      input.placeholder = defaultInputPlaceholder();
    }
  }
  if (send) send.disabled = false;
  document.getElementById("cust-panel")?.setAttribute("hidden", "");
  document.getElementById("industry-dashboard")?.setAttribute("hidden", "");
  const bizBoard = document.getElementById("biz-board");
  if (bizBoard) {
    bizBoard.hidden = true;
    bizBoard.style.display = "none";
  }
  document.getElementById("prompts-btn")?.setAttribute("hidden", "");
  const title = document.getElementById("workspace-overview-title");
  const sub = document.getElementById("workspace-overview-sub");
  const status = document.getElementById("workspace-overview-status");
  if (title) title.textContent = "Nimo 陪伴模式";
  if (sub) sub.textContent = "提醒、读书、聊天和主动督促都围绕你个人展开，不再绑定行业或客户。";
  if (status) status.textContent = "陪伴中";
}
async function refreshIndustryStateForUi() {
  try {
    const res = await fetch(`${API}/industry`, { cache: "no-store" });
    const state = await res.json();
    applyChatIndustryChrome(state);
    unlockCasualChatUi(state);
    window.dispatchEvent(new CustomEvent("pulse:industry-changed", { detail: state }));
    return state;
  } catch (err) {
    console.warn("[IndustryChat] refresh state failed:", err);
    return null;
  }
}
if (MEMORY_GRAPH_ENABLED) {
  if (graphEl) graphEl.style.display = "block";
  loadMemories();
  setInterval(() => {
    loadMemories();
  }, 5 * 60 * 1000);
}
connectSSE();
initStatusLight();
initMemoryManager();
initUsagePanel();
initTaskBar();
initPersonaCard();
initAiWorkbench();
initBizBoard();
window.addEventListener("pulse:memories-changed", () => {
  if (MEMORY_GRAPH_ENABLED) loadMemories().catch(() => {});
});
loadAgentProfile();
initPersonCard();
initDocPanel().catch((err) => console.warn('[DocPanel] 初始化失败:', err));
initIndustryOnboarding().catch((err) => console.warn('[Industry] 初始化失败:', err));
initIndustryDashboard().catch((err) => console.warn('[IndustryDashboard] 初始化失败:', err));
initTodayView();
initFollowupsView();
initDashboardView();
initActivityReportView();
initReadingDocumentsView();
initRemindersView();
initDeviceView();
initScreenGuard();
initDailySummary();
initIndustryPrompts().catch((err) => console.warn('[IndustryPrompts] 初始化失败:', err));
initCustomerPanel().catch((err) => console.warn('[CustomerPanel] 初始化失败:', err));
initOrgWorkspace();
let chatThreadApi = null;
async function switchToIndustryThread(state) {
  applyChatIndustryChrome(state);
  const pack = state?.activePack || null;
  if (!chatThreadApi) return;
  try {
    if (!pack?.id) {
      await chatThreadApi.ensureThread({
        id: "main",
        title: "主会话",
        customer_id: "",
      });
      await fetch(`${API}/customer/current`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: null })
      }).catch(() => {});
      return;
    }
    await chatThreadApi.ensureThread({
      id: industryThreadId(pack),
      title: industryThreadTitle(pack),
      customer_id: "",
    });
  } catch (err) {
    console.warn("[IndustryChat] switch thread failed:", err);
  }
}

initChatThreadBar({
  onThreadChanged: async (tid) => {
    activeThreadId = (tid && String(tid).trim()) || "main";
    await chat.reloadThreadMessages();
  },
})
  .then((api) => {
    if (!api) return chat.restoreChatHistory();
    chatThreadApi = api;
    fetch(`${API}/industry`)
      .then((res) => res.json())
      .then(async (state) => {
        await switchToIndustryThread(state);
        unlockCasualChatUi(state);
      })
      .catch(() => chat.restoreChatHistory());
  })
  .catch(() => chat.restoreChatHistory());
setTimeout(() => {
  refreshIndustryStateForUi();
}, 1000);
window.addEventListener("pulse:industry-changed", (event) => {
  switchToIndustryThread(event.detail || null);
  unlockCasualChatUi(event.detail || null);
});
initUpdaterUi();
chat.unlockAudioOnFirstGesture();

bootstrapACUI();
initPanelCollapse();

// ── TTS 设置面板初始化 ────────────────────────────────────────────────────────
function initTTSSettings() {
  const providerSel = document.getElementById("tts-provider-select");
  const voiceSel    = document.getElementById("tts-voice-select");
  const testBtn     = document.getElementById("tts-test-btn");
  const testStatus  = document.getElementById("tts-test-status");
  const voiceFeedback = document.getElementById("settings-voice-feedback");
  if (!providerSel) return;

  let allVoices = {};

  const credSections = {
    doubao:     document.getElementById("tts-creds-doubao"),
    minimax:    document.getElementById("tts-creds-minimax"),
    openai:     document.getElementById("tts-creds-openai"),
    elevenlabs: document.getElementById("tts-creds-elevenlabs"),
    volcano:    document.getElementById("tts-creds-volcano"),
  };

  function showCredSection(provider) {
    Object.entries(credSections).forEach(([k, el]) => {
      if (el) el.style.display = k === provider ? "" : "none";
    });
  }

  function updateVoiceOptions(provider, savedId) {
    if (!voiceSel) return;
    const voices = allVoices[provider] || [];
    voiceSel.innerHTML = voices.map(v =>
      `<option value="${v.id}">${v.label}</option>`
    ).join("");
    if (savedId && voices.some(v => v.id === savedId)) {
      voiceSel.value = savedId;
    }
  }

  providerSel.addEventListener("change", () => {
    showCredSection(providerSel.value);
    updateVoiceOptions(providerSel.value);
  });

  // 加载现有配置 + 声音列表
  fetch(`${API}/settings/tts`).then(r => r.json()).then(({ tts, voices }) => {
    if (voices) allVoices = voices;
    const provider = tts?.ttsProvider || "minimax";
    if (tts?.ttsProvider) providerSel.value = tts.ttsProvider;
    updateVoiceOptions(provider, tts?.ttsVoiceId);
    const appidEl = document.getElementById("tts-volcano-appid");
    if (appidEl && tts?.volcanoAppId?.value) appidEl.value = tts.volcanoAppId.value;
    const doubaoAppIdEl = document.getElementById("tts-doubao-appid");
    if (doubaoAppIdEl && tts?.doubaoAppId?.value) doubaoAppIdEl.value = tts.doubaoAppId.value;
    const doubaoResourceIdEl = document.getElementById("tts-doubao-resource-id");
    if (doubaoResourceIdEl && tts?.doubaoResourceId) doubaoResourceIdEl.value = tts.doubaoResourceId;
    const baseurlEl = document.getElementById("tts-openai-baseurl");
    if (baseurlEl && tts?.openaiTtsBaseURL) baseurlEl.value = tts.openaiTtsBaseURL;
    showCredSection(provider);
  }).catch(() => {});

  showCredSection(providerSel.value);

  function collectTTSSettings() {
    const ttsBody = { ttsProvider: providerSel.value };
    const voiceId  = voiceSel?.value?.trim();
    if (voiceId) ttsBody.ttsVoiceId = voiceId;
    const minimaxKey = document.getElementById("tts-minimax-key")?.value?.trim();
    if (minimaxKey) ttsBody.minimaxKey = minimaxKey;
    const doubaoKey = document.getElementById("tts-doubao-key")?.value?.trim();
    if (doubaoKey) ttsBody.doubaoKey = doubaoKey;
    const doubaoAppId = document.getElementById("tts-doubao-appid")?.value?.trim();
    if (doubaoAppId) ttsBody.doubaoAppId = doubaoAppId;
    const doubaoAccessKey = document.getElementById("tts-doubao-access-key")?.value?.trim();
    if (doubaoAccessKey) ttsBody.doubaoAccessKey = doubaoAccessKey;
    const doubaoResourceId = document.getElementById("tts-doubao-resource-id")?.value?.trim();
    if (doubaoResourceId) ttsBody.doubaoResourceId = doubaoResourceId;
    const openaiKey = document.getElementById("tts-openai-key")?.value?.trim();
    if (openaiKey) ttsBody.openaiTtsKey = openaiKey;
    const baseURL = document.getElementById("tts-openai-baseurl")?.value?.trim();
    if (baseURL) ttsBody.openaiTtsBaseURL = baseURL;
    const elevenKey = document.getElementById("tts-elevenlabs-key")?.value?.trim();
    if (elevenKey) ttsBody.elevenLabsKey = elevenKey;
    const volcanoAppId = document.getElementById("tts-volcano-appid")?.value?.trim();
    if (volcanoAppId) ttsBody.volcanoAppId = volcanoAppId;
    const volcanoToken = document.getElementById("tts-volcano-token")?.value?.trim();
    if (volcanoToken) ttsBody.volcanoToken = volcanoToken;
    return ttsBody;
  }

  async function saveTTSSettings() {
    const resp = await fetch(`${API}/settings/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectTTSSettings()),
    });
    if (!resp.ok) throw new Error("保存 TTS 配置失败");
    return resp.json().catch(() => ({}));
  }

  const origSaveBtn = document.getElementById("settings-save-voice");
  if (origSaveBtn) {
    origSaveBtn.addEventListener("click", async () => {
      try {
        await saveTTSSettings();
        ["tts-minimax-key", "tts-doubao-key", "tts-doubao-access-key", "tts-openai-key", "tts-elevenlabs-key", "tts-volcano-token"].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });
      } catch {
        showFeedback(voiceFeedback, "TTS 保存失败", true);
      }
    });
  }

  // 试听按钮：先保存当前服务商+声音选择，再触发合成
  if (testBtn) {
    testBtn.addEventListener("click", async () => {
      testBtn.disabled = true;
      if (testStatus) testStatus.textContent = "保存配置中…";
      try {
        await saveTTSSettings();
        if (testStatus) testStatus.textContent = "合成中…";
        await playTTSReply("你好，这是语音合成测试，声音是否清晰自然？");
        if (testStatus) testStatus.textContent = "播放中";
        setTimeout(() => { if (testStatus) testStatus.textContent = ""; }, 4000);
      } catch {
        if (testStatus) testStatus.textContent = "失败，请检查配置和 API Key";
      } finally {
        testBtn.disabled = false;
      }
    });
  }
}

window.addEventListener("beforeunload", () => {
  if (typeof removeUpdaterStatusListener === "function") {
    removeUpdaterStatusListener();
    removeUpdaterStatusListener = null;
  }
});

// ── Settings modal ──
(function initSettings() {
  const settingsBtn     = document.getElementById("settings-btn");
  const overlay         = document.getElementById("settings-overlay");
  const closeBtn        = document.getElementById("settings-close");
  const providerSelect  = document.getElementById("settings-provider-select");
  const modelSelect     = document.getElementById("settings-model-select");
  const llmKeyInput     = document.getElementById("settings-llm-key");
  const saveLlmBtn      = document.getElementById("settings-save-llm");
  const llmFeedback     = document.getElementById("settings-llm-feedback");
  const tempSlider      = document.getElementById("settings-temperature");
  const tempVal         = document.getElementById("settings-temperature-val");
  const saveTempBtn     = document.getElementById("settings-save-temperature");
  const tempFeedback    = document.getElementById("settings-temperature-feedback");
  const minimaxKeyInput = document.getElementById("settings-minimax-key");
  const saveMinimaxBtn  = document.getElementById("settings-save-minimax");
  const minimaxFeedback = document.getElementById("settings-minimax-feedback");
  const saveSocialBtn   = document.getElementById("settings-save-social");
  const socialFeedback  = document.getElementById("settings-social-feedback");
  const saveVoiceBtn    = document.getElementById("settings-save-voice");
  const voiceFeedback   = document.getElementById("settings-voice-feedback");
  const voiceThreshSlider = document.getElementById("settings-voice-threshold");
  const voiceThreshVal    = document.getElementById("settings-voice-threshold-val");
  const proactiveEnabled = document.getElementById("settings-proactive-enabled");
  const proactiveFrequency = document.getElementById("settings-proactive-frequency");
  const proactiveIdleGuard = document.getElementById("settings-proactive-idle-guard");
  const screenGuardEnabled = document.getElementById("settings-screen-guard-enabled");
  const screenGuardMode = document.getElementById("settings-screen-guard-mode");
  const screenGuardScreenMinutes = document.getElementById("settings-screen-guard-screen-minutes");
  const screenGuardIdleMinutes = document.getElementById("settings-screen-guard-idle-minutes");
  const dailySummaryEnabled = document.getElementById("settings-daily-summary-enabled");
  const dailySummaryTime = document.getElementById("settings-daily-summary-time");
  const dailySummaryTest = document.getElementById("settings-daily-summary-test");
  const saveProactiveBtn = document.getElementById("settings-save-proactive");
  const proactiveFeedback = document.getElementById("settings-proactive-feedback");
  const personalChatSignals = document.getElementById("settings-personal-chat-signals");
  const personalLifeCare = document.getElementById("settings-personal-life-care");
  const personalBusinessSignals = document.getElementById("settings-personal-business-signals");
  const personalQuietEnabled = document.getElementById("settings-personal-quiet-enabled");
  const personalQuietStart = document.getElementById("settings-personal-quiet-start");
  const personalQuietEnd = document.getElementById("settings-personal-quiet-end");

  if (!settingsBtn || !overlay) return;

  let cachedProviders = null;

  // ── Tab 切换 ──
  overlay.querySelectorAll(".settings-nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      overlay.querySelectorAll(".settings-nav-item").forEach(b => b.classList.remove("active"));
      overlay.querySelectorAll(".settings-tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      overlay.querySelector(`.settings-tab[data-tab="${tab}"]`)?.classList.add("active");
      if (tab === "social") loadSocialSettings();
      if (tab === "industry") loadIndustrySettings();
      if (tab === "proactive") loadProactiveSettings();
      if (tab === "voice") loadVoiceSettings();
    });
  });

  function showFeedback(el, msg, isError = false) {
    if (!el) return;
    el.textContent = msg;
    el.className = "settings-feedback" + (isError ? " error" : "");
    setTimeout(() => { el.textContent = ""; el.className = "settings-feedback"; }, 3000);
  }

  const PROACTIVE_ENABLED_KEY = "pulse_proactive_assistant_enabled";
  const PROACTIVE_FREQUENCY_KEY = "pulse_proactive_frequency_minutes";
  const PROACTIVE_IDLE_GUARD_KEY = "pulse_proactive_idle_guard_enabled";
  const PROACTIVE_ALLOWED_FREQUENCIES = ["1", "10", "20", "50", "60", "240", "300", "360"];

  function proactiveFrequencyLabel(value) {
    const n = Number(PROACTIVE_ALLOWED_FREQUENCIES.includes(String(value)) ? value : "10");
    if (n >= 60) return `${Math.round(n / 60)} 小时`;
    return `${n} 分钟`;
  }

  function loadProactiveSettings() {
    const enabled = localStorage.getItem(PROACTIVE_ENABLED_KEY) !== "false";
    const rawFrequency = enabled ? (localStorage.getItem(PROACTIVE_FREQUENCY_KEY) || "10") : "off";
    const frequency = rawFrequency === "off" || PROACTIVE_ALLOWED_FREQUENCIES.includes(rawFrequency) ? rawFrequency : "10";
    const idleGuard = localStorage.getItem(PROACTIVE_IDLE_GUARD_KEY) === "true";
    const profile = loadPersonalDataProfile();
    if (proactiveEnabled) proactiveEnabled.checked = enabled;
    if (proactiveFrequency) proactiveFrequency.value = frequency;
    if (proactiveIdleGuard) proactiveIdleGuard.checked = idleGuard;
    const guard = getScreenGuardSettings();
    if (screenGuardEnabled) screenGuardEnabled.checked = guard.enabled;
    if (screenGuardMode) screenGuardMode.value = guard.mode;
    if (screenGuardScreenMinutes) screenGuardScreenMinutes.value = String(guard.screenMinutes);
    if (screenGuardIdleMinutes) screenGuardIdleMinutes.value = String(guard.idleMinutes);
    const daily = getDailySummarySettings();
    if (dailySummaryEnabled) dailySummaryEnabled.checked = daily.enabled;
    if (dailySummaryTime) dailySummaryTime.value = daily.time;
    if (personalChatSignals) personalChatSignals.checked = profile.permissions.chatSignals;
    if (personalLifeCare) personalLifeCare.checked = profile.permissions.lifeCare;
    if (personalBusinessSignals) personalBusinessSignals.checked = profile.permissions.businessSignals;
    if (personalQuietEnabled) personalQuietEnabled.checked = profile.quiet.enabled;
    if (personalQuietStart) personalQuietStart.value = profile.quiet.start;
    if (personalQuietEnd) personalQuietEnd.value = profile.quiet.end;
    setStatusStripCard("proactive", enabled && frequency !== "off" ? proactiveFrequencyLabel(frequency) : "已关闭", enabled && frequency !== "off" ? "ok" : "warn");
  }

  saveProactiveBtn?.addEventListener("click", () => {
    const selected = proactiveFrequency?.value || "10";
    const enabled = (proactiveEnabled?.checked ?? true) && selected !== "off";
    const rawFrequency = proactiveFrequency?.value || "10";
    const frequency = PROACTIVE_ALLOWED_FREQUENCIES.includes(rawFrequency) ? rawFrequency : "10";
    const idleGuard = proactiveIdleGuard?.checked ?? false;
    const guard = saveScreenGuardSettings({
      enabled: screenGuardEnabled?.checked ?? true,
      mode: screenGuardMode?.value || "normal",
      screenMinutes: Number(screenGuardScreenMinutes?.value || 45),
      idleMinutes: Number(screenGuardIdleMinutes?.value || 10),
    });
    const daily = saveDailySummarySettings({
      enabled: dailySummaryEnabled?.checked ?? true,
      time: dailySummaryTime?.value || "22:30",
    });
    localStorage.setItem(PROACTIVE_ENABLED_KEY, String(enabled));
    localStorage.setItem(PROACTIVE_FREQUENCY_KEY, frequency);
    localStorage.setItem(PROACTIVE_IDLE_GUARD_KEY, String(idleGuard));
    savePersonalDataProfile({
      permissions: {
        chatSignals: personalChatSignals?.checked ?? true,
        lifeCare: personalLifeCare?.checked ?? true,
        businessSignals: personalBusinessSignals?.checked ?? true,
      },
      quiet: {
        enabled: personalQuietEnabled?.checked ?? false,
        start: personalQuietStart?.value || "23:00",
        end: personalQuietEnd?.value || "08:00",
      },
    });
    if (proactiveEnabled) proactiveEnabled.checked = enabled;
    setStatusStripCard("proactive", enabled ? proactiveFrequencyLabel(frequency) : "已关闭", enabled ? "ok" : "warn");
    window.dispatchEvent(new CustomEvent("pulse:proactive-settings-changed", { detail: { enabled, frequencyMinutes: Number(frequency), idleGuard, screenGuard: guard, dailySummary: daily } }));
    showFeedback(proactiveFeedback, enabled ? `已保存：${proactiveFrequencyLabel(frequency)}找你一次，屏幕督促${guard.enabled ? "已开启" : "已关闭"}，每日总结${daily.enabled ? daily.time : "已关闭"}` : "已关闭主动提醒");
  });

  dailySummaryTest?.addEventListener("click", async () => {
    dailySummaryTest.disabled = true;
    try {
      await window.NimoDailySummary?.sendNow?.();
      showFeedback(proactiveFeedback, "已发送一次今日总结");
    } catch (err) {
      showFeedback(proactiveFeedback, `总结失败：${err.message}`, true);
    } finally {
      dailySummaryTest.disabled = false;
    }
  });

  // ── 行业切换（设置 → 行业）──
  const settingsIndustryHints = {
    ecommerce: ['店铺增长', '客户复购', '售后风险'],
    tech: ['线索推进', 'Demo 跟进', 'POC 交付'],
    crossborder: ['外贸询盘', '报价邮件', '海外跟进'],
    usedcar: ['购车线索', '试驾邀约', '置换贷款'],
    hr: ['岗位 JD', '候选人报告', '面试流程'],
    tourism: ['出行方案', '签证材料', '报价跟进'],
    fitness: ['会员续费', '私教转化', '沉睡唤醒'],
    pet: ['宠物档案', '到店提醒', '会员关怀'],
    food: ['订货复购', '新品推广', '食品客诉'],
    catering: ['门店活动', '老客召回', '客诉处理'],
    legal: ['文书初稿', '案件时间线', '证据清单'],
    pharma: ['拜访记录', '准入推进', '竞品分析'],
    agriculture: ['农户档案', '作物周期', '农资复购'],
  };

  function escSettingsHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderSettingsIndustryCards(state) {
    const grid = document.getElementById('settings-industry-grid');
    if (!grid) return;
    const packs = Array.isArray(state?.allPacks) ? state.allPacks : [];
    if (!packs.length) {
      grid.innerHTML = '<div class="settings-hint">暂无可用行业工作台</div>';
      return;
    }
    const activeId = state?.active || state?.activeId || state?.activePack?.id || '';
    const casualCard = `
        <button type="button" class="industry-switch-card${activeId ? '' : ' current'}" data-industry="__casual">
          <span class="ind-switch-tag">💬 Nimo</span>
          <div class="ind-switch-name">Nimo 陪伴模式</div>
          <div class="ind-switch-desc">不绑定行业工作台，只保留提醒、读书、督促和聊天。</div>
          <span class="ind-switch-current">当前</span>
        </button>
      `;
    grid.innerHTML = casualCard + packs.map((pack) => {
      const hints = settingsIndustryHints[pack.id] || ['客户档案', 'AI 跟进', '行业雷达'];
      const desc = pack.tagline || hints.join('、');
      const isCurrent = pack.id === activeId;
      return `
        <button type="button" class="industry-switch-card${isCurrent ? ' current' : ''}" data-industry="${escSettingsHtml(pack.id)}">
          <span class="ind-switch-tag">${escSettingsHtml(pack.icon || '🏢')} ${escSettingsHtml(pack.name || pack.id)}</span>
          <div class="ind-switch-name">${escSettingsHtml(pack.name || pack.id)}工作台</div>
          <div class="ind-switch-desc">${escSettingsHtml(desc)}</div>
          <span class="ind-switch-current">当前</span>
        </button>
      `;
    }).join('');
    bindSettingsIndustryCards();
  }

  function bindSettingsIndustryCards() {
    overlay.querySelectorAll('.industry-switch-card').forEach(card => {
      if (card.dataset.bound === '1') return;
      card.dataset.bound = '1';
      card.addEventListener('click', async () => {
        const target = card.dataset.industry;
        if (!target || card.classList.contains('current')) return;
        const feedback = document.getElementById('settings-industry-feedback');
        const cards = overlay.querySelectorAll('.industry-switch-card');
        cards.forEach(c => c.classList.add('switching'));
        try {
          const stateRes = await fetch(`${API}/industry`);
          const state = await stateRes.json().catch(() => ({}));
          const enabled = Array.isArray(state?.enabled) ? state.enabled : [];
          if (target !== '__casual' && !enabled.includes(target)) {
            const enabledRes = await fetch(`${API}/industry/enabled`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: Array.from(new Set([...enabled, target])) })
            });
            const enabledData = await enabledRes.json().catch(() => ({}));
            if (!enabledRes.ok || enabledData?.ok === false) throw new Error(enabledData?.error || '启用行业失败');
          }
          const r = await fetch(`${API}/industry/active`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: target === '__casual' ? null : target })
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok || data?.ok === false) throw new Error(data?.error || '切换失败');
          if (feedback) {
            feedback.textContent = '已切换，正在重新加载工作台…';
            feedback.className = 'settings-feedback';
          }
          setTimeout(() => { window.location.href = '/'; }, 500);
        } catch (err) {
          cards.forEach(c => c.classList.remove('switching'));
          if (feedback) {
            feedback.textContent = '切换失败：' + (err.message || '未知错误');
            feedback.className = 'settings-feedback error';
          }
        }
      });
    });
  }

  async function loadIndustrySettings() {
    try {
      const r = await fetch(`${API}/industry`);
      const state = await r.json();
      const activeId = state?.active || state?.activeId || state?.activePack?.id || '';
      const activeName = state?.activePack?.name
        || (activeId === 'ecommerce' ? '电商' : activeId === 'tech' ? '科技' : 'Nimo 陪伴模式');
      const cfg = document.getElementById('settings-cfg-industry');
      const dot = document.getElementById('settings-cfg-industry-dot');
      const hint = document.getElementById('sss-value-industry');
      if (cfg) cfg.textContent = activeName + (activeId ? ` · ${activeId}` : '');
      if (dot) {
        dot.textContent = '●';
        dot.className = `settings-config-dot ${activeId ? 'active' : 'inactive'}`;
      }
      if (hint) hint.textContent = activeName;
      renderSettingsIndustryCards(state);
    } catch (err) {
      console.warn('[settings/industry] load failed', err);
      const grid = document.getElementById('settings-industry-grid');
      if (grid) grid.innerHTML = `<div class="settings-feedback error">行业加载失败：${escSettingsHtml(err.message || '无法连接本地服务')}</div>`;
    }
  }

  // ── LLM / 媒体 ──
  function setStatusStripCard(key, valueText, state) {
    const valEl = document.getElementById(`sss-value-${key}`);
    const dotEl = document.getElementById(`sss-dot-${key}`);
    if (valEl) valEl.textContent = valueText || "—";
    if (dotEl) dotEl.className = `sss-dot ${state || ""}`.trim();
  }

  function refreshConfigSummary({ llm, minimax }) {
    const cfgLlm = document.getElementById("settings-cfg-llm");
    const cfgLlmDot = document.getElementById("settings-cfg-llm-dot");
    const cfgMedia = document.getElementById("settings-cfg-media");
    const cfgMediaDot = document.getElementById("settings-cfg-media-dot");
    if (cfgLlm) cfgLlm.textContent = `${llm.provider || "—"} · ${llm.model || "—"}`;
    if (cfgLlmDot) {
      cfgLlmDot.textContent = "●";
      cfgLlmDot.className = `settings-config-dot ${llm.activated ? "active" : "inactive"}`;
      cfgLlmDot.title = llm.activated ? "运行中" : "未激活";
    }
    if (cfgMedia) cfgMedia.textContent = `minimax · ${minimax.configured ? "已配置" : "未配置"}`;
    if (cfgMediaDot) {
      cfgMediaDot.textContent = "●";
      cfgMediaDot.className = `settings-config-dot ${minimax.configured ? "active" : "inactive"}`;
    }
    setStatusStripCard(
      "llm",
      llm.activated ? `${llm.provider || "—"} · ${llm.model || "—"}` : "未激活",
      llm.activated ? "ok" : "warn"
    );
    setStatusStripCard(
      "media",
      minimax.configured ? "MiniMax 已配置" : "未配置",
      minimax.configured ? "ok" : "warn"
    );
  }

  function populateModelSelect(models, current) {
    if (!modelSelect || !models) return;
    modelSelect.innerHTML = models
      .map(m => `<option value="${m.id}"${m.deprecated ? " data-deprecated" : ""}>${m.label}</option>`)
      .join("");
    if (current) modelSelect.value = current;
  }

  function populateProviderSelect(providers, current) {
    if (!providerSelect || !providers) return;
    const selected = current || providerSelect.value || "auto";
    const options = [`<option value="auto">自动识别</option>`]
      .concat(Object.entries(providers).map(([id, provider]) => {
        const label = provider.label || id;
        return `<option value="${id}">${label}</option>`;
      }));
    providerSelect.innerHTML = options.join("");
    providerSelect.value = providers[selected] || selected === "auto" ? selected : "auto";
  }

  function applyCustomProviderUI(llm) {
    const customSection = document.getElementById("settings-custom-llm-section");
    const modelRow = document.getElementById("settings-model-row");
    if (llm?.provider === "custom") {
      if (customSection) customSection.style.display = "";
      if (modelRow) modelRow.style.display = "none";
      const baseUrlEl = document.getElementById("settings-custom-baseurl");
      const modelEl = document.getElementById("settings-custom-model");
      if (baseUrlEl && llm.baseURL) baseUrlEl.value = llm.baseURL;
      if (modelEl && llm.model) modelEl.value = llm.model;
    } else {
      if (customSection) customSection.style.display = "none";
      if (modelRow) modelRow.style.display = "";
    }
  }

  async function loadSettings() {
    try {
      const data = await fetch(`${API}/settings`).then(r => r.json());
      const { llm, minimax, providers } = data;
      if (providers) cachedProviders = providers;
      refreshConfigSummary({ llm, minimax });
      populateProviderSelect(providers, llm.provider || "auto");
      if (providerSelect && llm.provider) providerSelect.value = llm.provider;
      applyCustomProviderUI(llm);
      if (llm.provider !== "custom") populateModelSelect(llm.models, llm.model);
      // 同步 temperature 滑块
      if (typeof llm.temperature === "number" && tempSlider) {
        tempSlider.value = String(llm.temperature);
        if (tempVal) tempVal.textContent = llm.temperature.toFixed(2);
      }
    } catch {}
  }

  // ── 社交媒体 ──
  const SOCIAL_FIELD_MAP = {
    "social-discord-token":  "DISCORD_BOT_TOKEN",
    "social-feishu-appid":   "FEISHU_APP_ID",
    "social-feishu-secret":  "FEISHU_APP_SECRET",
    "social-feishu-token":   "FEISHU_VERIFICATION_TOKEN",
    "social-wechat-appid":   "WECHAT_OFFICIAL_APP_ID",
    "social-wechat-secret":  "WECHAT_OFFICIAL_APP_SECRET",
    "social-wechat-token":   "WECHAT_OFFICIAL_TOKEN",
    "social-wecom-botkey":   "WECOM_BOT_KEY",
    "social-wecom-token":    "WECOM_INCOMING_TOKEN",
  };

  const SOCIAL_PLATFORM_STATUS = {
    "social-status-discord": ["DISCORD_BOT_TOKEN"],
    "social-status-feishu":  ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_VERIFICATION_TOKEN"],
    "social-status-wechat":  ["WECHAT_OFFICIAL_APP_ID", "WECHAT_OFFICIAL_APP_SECRET", "WECHAT_OFFICIAL_TOKEN"],
    "social-status-wecom":   ["WECOM_BOT_KEY", "WECOM_INCOMING_TOKEN"],
  };

  async function loadSocialSettings() {
    try {
      const { social } = await fetch(`${API}/settings/social`).then(r => r.json());
      let totalPlatforms = 0;
      let okPlatforms = 0;
      let partialPlatforms = 0;
      for (const [statusId, keys] of Object.entries(SOCIAL_PLATFORM_STATUS)) {
        const el = document.getElementById(statusId);
        totalPlatforms += 1;
        const configuredCount = keys.filter(k => social[k]?.configured).length;
        if (configuredCount === keys.length) okPlatforms += 1;
        else if (configuredCount > 0) partialPlatforms += 1;
        if (!el) continue;
        if (configuredCount === keys.length) {
          el.textContent = "● 已配置";
          el.className = "settings-platform-status ok";
        } else if (configuredCount > 0) {
          el.textContent = `● 部分配置 (${configuredCount}/${keys.length})`;
          el.className = "settings-platform-status miss";
        } else {
          el.textContent = "○ 未配置";
          el.className = "settings-platform-status miss";
        }
      }
      const sumState = okPlatforms === totalPlatforms && totalPlatforms > 0
        ? "ok"
        : (okPlatforms + partialPlatforms > 0 ? "warn" : "");
      const sumText = okPlatforms === totalPlatforms && totalPlatforms > 0
        ? `${okPlatforms}/${totalPlatforms} 已连接`
        : (okPlatforms + partialPlatforms > 0
            ? `${okPlatforms}/${totalPlatforms} 已连接`
            : "未连接");
      setStatusStripCard("social", sumText, sumState);
    } catch {}
  }

  if (saveSocialBtn) {
    saveSocialBtn.addEventListener("click", async () => {
      const updates = {};
      for (const [fieldId, envKey] of Object.entries(SOCIAL_FIELD_MAP)) {
        const val = document.getElementById(fieldId)?.value?.trim() || "";
        if (val) updates[envKey] = val;
      }
      saveSocialBtn.disabled = true;
      try {
        const res = await fetch(`${API}/settings/social`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        const data = await res.json();
        if (data.ok) {
          showFeedback(socialFeedback, "已保存");
          // 清空输入框并刷新状态指示
          Object.keys(SOCIAL_FIELD_MAP).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
          });
          loadSocialSettings();
        } else {
          showFeedback(socialFeedback, data.error || "保存失败", true);
        }
      } catch {
        showFeedback(socialFeedback, "请求失败", true);
      } finally {
        saveSocialBtn.disabled = false;
      }
    });
  }

  // ── temperature 滑块 ──
  if (tempSlider && tempVal) {
    tempSlider.addEventListener("input", () => {
      tempVal.textContent = parseFloat(tempSlider.value).toFixed(2);
    });
  }
  if (saveTempBtn) {
    saveTempBtn.addEventListener("click", async () => {
      const temperature = parseFloat(tempSlider?.value ?? "0.5");
      saveTempBtn.disabled = true;
      try {
        const res = await fetch(`${API}/settings/temperature`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ temperature }),
        });
        const data = await res.json();
        if (data.ok) {
          showFeedback(tempFeedback, `已设置 ${data.temperature.toFixed(2)}`);
        } else {
          showFeedback(tempFeedback, data.error || "保存失败", true);
        }
      } catch { showFeedback(tempFeedback, "请求失败", true); }
      finally { saveTempBtn.disabled = false; }
    });
  }

  // ── 语音设置持久化 ──
  const VOICE_LANG_KEY       = "pulse-voice-lang";
  const VOICE_AUTO_SEND_KEY  = "pulse-voice-auto-send";
  const VOICE_THRESHOLD_KEY  = "pulse-voice-threshold";
  const VOICE_PROVIDER_KEY   = "pulse-voice-provider";
  const VOICE_ENGINE_KEY     = "pulse-voice-engine";
  const VOICE_LOCAL_MODEL_KEY = "pulse-voice-local-model";

  function applyVoiceProviderUI(provider) {
    const panels = { aliyun: "voice-cred-aliyun", tencent: "voice-cred-tencent", xunfei: "voice-cred-xunfei" };
    for (const [key, id] of Object.entries(panels)) {
      const el = document.getElementById(id);
      if (el) el.style.display = key === provider ? "" : "none";
    }
  }

  const voiceProviderSelect = document.getElementById("voice-provider-select");
  if (voiceProviderSelect) {
    voiceProviderSelect.addEventListener("change", () => applyVoiceProviderUI(voiceProviderSelect.value));
  }

  const voiceEngineSelect = document.getElementById("voice-engine-select");
  const voiceLocalControls = document.getElementById("voice-local-controls");
  const voiceLocalModel = document.getElementById("voice-local-model");
  const voiceLocalStartBtn = document.getElementById("voice-local-start");
  const voiceLocalStopBtn = document.getElementById("voice-local-stop");
  const voiceLocalRefreshBtn = document.getElementById("voice-local-refresh");
  const voiceLocalStatusEl = document.getElementById("voice-local-status");

  function applyVoiceEngineUI(engine) {
    if (voiceLocalControls) voiceLocalControls.style.display = engine === "local" ? "" : "none";
  }

  function describeVoiceLocalStatus(voice) {
    if (!voice) return "状态未知";
    const map = { stopped: "未运行", starting: "正在启动…", running: "运行中", error: "出错" };
    const base = map[voice.status] || voice.status || "未知";
    const detail = [];
    if (voice.message) detail.push(voice.message);
    if (voice.serverPath) detail.push(`服务文件：${voice.serverExists ? "已找到" : "未找到"} ${voice.serverPath}`);
    if (voice.lastError && voice.status === "error") detail.push(`错误：${voice.lastError}`);
    return detail.length ? `${base}（${detail.join("；")}）` : base;
  }

  async function refreshVoiceLocalStatus() {
    if (!voiceLocalStatusEl) return null;
    try {
      const r = await fetch(`${API}/voice/local/status`);
      const data = await r.json().catch(() => ({}));
      const voice = data?.voice;
      voiceLocalStatusEl.textContent = describeVoiceLocalStatus(voice);
      const engine = (voiceEngineSelect?.value || localStorage.getItem(VOICE_ENGINE_KEY) || "cloud");
      const ok = engine === "local" && voice?.status === "running";
      setStatusStripCard("voice", ok ? "本地 Whisper · 运行中" : `${engine === "local" ? "本地 Whisper" : voiceProviderSelect?.value || "云端"} · ${voice?.status || "未运行"}`, ok ? "ok" : "warn");
      return voice;
    } catch {
      voiceLocalStatusEl.textContent = "无法连接本地服务";
      return null;
    }
  }

  if (voiceEngineSelect) {
    voiceEngineSelect.addEventListener("change", () => {
      const engine = voiceEngineSelect.value;
      localStorage.setItem(VOICE_ENGINE_KEY, engine);
      applyVoiceEngineUI(engine);
      if (engine === "local") refreshVoiceLocalStatus();
    });
  }

  if (voiceLocalStartBtn) {
    voiceLocalStartBtn.addEventListener("click", async () => {
      const model = voiceLocalModel?.value || "small";
      localStorage.setItem(VOICE_LOCAL_MODEL_KEY, model);
      voiceLocalStartBtn.disabled = true;
      try {
        await fetch(`${API}/voice/local/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        });
        await refreshVoiceLocalStatus();
      } finally {
        voiceLocalStartBtn.disabled = false;
      }
    });
  }

  if (voiceLocalStopBtn) {
    voiceLocalStopBtn.addEventListener("click", async () => {
      voiceLocalStopBtn.disabled = true;
      try {
        await fetch(`${API}/voice/local/stop`, { method: "POST" });
        await refreshVoiceLocalStatus();
      } finally {
        voiceLocalStopBtn.disabled = false;
      }
    });
  }

  if (voiceLocalRefreshBtn) {
    voiceLocalRefreshBtn.addEventListener("click", () => refreshVoiceLocalStatus());
  }

  async function loadVoiceSettings() {
    const langSelect = document.getElementById("voice-lang-select");
    const autoSend   = document.getElementById("voice-auto-send");
    if (langSelect) langSelect.value = localStorage.getItem(VOICE_LANG_KEY) || "zh-CN";
    if (autoSend) autoSend.checked = localStorage.getItem(VOICE_AUTO_SEND_KEY) !== "false";
    const savedThresh = parseFloat(localStorage.getItem(VOICE_THRESHOLD_KEY) || "0.008");
    if (voiceThreshSlider) voiceThreshSlider.value = String(savedThresh);
    if (voiceThreshVal)    voiceThreshVal.textContent = savedThresh.toFixed(3);

    const savedProvider = localStorage.getItem(VOICE_PROVIDER_KEY) || "aliyun";
    if (voiceProviderSelect) voiceProviderSelect.value = savedProvider;
    applyVoiceProviderUI(savedProvider);

    const savedEngine = localStorage.getItem(VOICE_ENGINE_KEY) || "cloud";
    if (voiceEngineSelect) voiceEngineSelect.value = savedEngine;
    applyVoiceEngineUI(savedEngine);
    if (voiceLocalModel) voiceLocalModel.value = localStorage.getItem(VOICE_LOCAL_MODEL_KEY) || "small";

    if (savedEngine === "local") {
      await refreshVoiceLocalStatus();
      return;
    }

    try {
      const cfgRes = await fetch(`${API}/settings/voice`);
      if (cfgRes.ok) {
        const data = await cfgRes.json();
        const v = data?.voice || {};
        const hasKey = !!(
          v.aliyunApiKey?.configured ||
          v.tencentSecretId?.configured ||
          v.xunfeiApiKey?.configured ||
          v.xunfeiApiSecret?.configured
        );
        setStatusStripCard(
          "voice",
          hasKey ? `${savedProvider} · 已配置` : `${savedProvider} · 未配置`,
          hasKey ? "ok" : "warn"
        );
      } else {
        setStatusStripCard("voice", `${savedProvider} · 本地缓存`, "warn");
      }
    } catch {
      setStatusStripCard("voice", `${savedProvider} · 本地缓存`, "warn");
    }
  }

  if (voiceThreshSlider && voiceThreshVal) {
    voiceThreshSlider.addEventListener("input", () => {
      voiceThreshVal.textContent = parseFloat(voiceThreshSlider.value).toFixed(3);
    });
  }


  if (saveVoiceBtn) {
    saveVoiceBtn.addEventListener("click", async () => {
      const lang      = document.getElementById("voice-lang-select")?.value || "zh-CN";
      const autoSend  = document.getElementById("voice-auto-send")?.checked ?? true;
      const threshold = parseFloat(voiceThreshSlider?.value ?? "0.008");
      const provider  = voiceProviderSelect?.value || "aliyun";

      localStorage.setItem(VOICE_LANG_KEY,      lang);
      localStorage.setItem(VOICE_AUTO_SEND_KEY,  String(autoSend));
      localStorage.setItem(VOICE_THRESHOLD_KEY,  String(threshold));
      localStorage.setItem(VOICE_PROVIDER_KEY,   provider);

      window.dispatchEvent(new CustomEvent("pulse:voice-threshold", { detail: { threshold } }));

      // 将云端 ASR 凭证发送到后端
      const body = {};
      const aliyunKey = document.getElementById("voice-aliyun-key")?.value?.trim();
      if (aliyunKey) body.aliyunApiKey = aliyunKey;
      const tencentSid = document.getElementById("voice-tencent-sid")?.value?.trim();
      if (tencentSid) body.tencentSecretId = tencentSid;
      const tencentSkey = document.getElementById("voice-tencent-skey")?.value?.trim();
      if (tencentSkey) body.tencentSecretKey = tencentSkey;
      const tencentAppid = document.getElementById("voice-tencent-appid")?.value?.trim();
      if (tencentAppid) body.tencentAppId = tencentAppid;
      const xunfeiAppid = document.getElementById("voice-xunfei-appid")?.value?.trim();
      if (xunfeiAppid) body.xunfeiAppId = xunfeiAppid;
      const xunfeiApikey = document.getElementById("voice-xunfei-apikey")?.value?.trim();
      if (xunfeiApikey) body.xunfeiApiKey = xunfeiApikey;
      const xunfeiApiSecret = document.getElementById("voice-xunfei-apisecret")?.value?.trim();
      if (xunfeiApiSecret) body.xunfeiApiSecret = xunfeiApiSecret;

      if (Object.keys(body).length > 0) {
        try {
          saveVoiceBtn.disabled = true;
          const resp = await fetch("http://127.0.0.1:52557/settings/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!resp.ok) throw new Error("保存失败");
          // 清空密钥输入框（避免再次保存时误传旧值）
          ["voice-aliyun-key","voice-tencent-sid","voice-tencent-skey","voice-xunfei-apikey","voice-xunfei-apisecret"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
          });
          await loadVoiceSettings();
          showFeedback(voiceFeedback, "已保存");
        } catch { showFeedback(voiceFeedback, "保存失败", true); }
        finally { saveVoiceBtn.disabled = false; }
      } else {
        showFeedback(voiceFeedback, "已保存");
      }
    });
  }

  // ── TTS 设置 ──
  initTTSSettings();

  // ── 记忆节点图开关 ──
  const memoryGraphToggle = document.getElementById("settings-memory-graph-toggle");
  const memoryGraphFeedback = document.getElementById("settings-memory-graph-feedback");
  if (memoryGraphToggle) {
    // 默认关闭（未设置任何值时也是关闭）
    memoryGraphToggle.checked = localStorage.getItem(MEMORY_GRAPH_STORAGE_KEY) === "true";
    memoryGraphToggle.addEventListener("change", () => {
      localStorage.setItem(MEMORY_GRAPH_STORAGE_KEY, String(memoryGraphToggle.checked));
      if (memoryGraphFeedback) {
        memoryGraphFeedback.textContent = "下次刷新页面后生效";
        memoryGraphFeedback.className = "settings-feedback";
        setTimeout(() => { memoryGraphFeedback.textContent = ""; }, 3000);
      }
    });
  }

  // ── 开发指标开关 ──
  const DEV_STATS_KEY = "pulse_show_dev_stats";
  const devStatsToggle = document.getElementById("settings-dev-stats-toggle");
  const devStatsFeedback = document.getElementById("settings-dev-stats-feedback");
  const applyDevStats = (show) => {
    document.querySelectorAll(".stat.dev-only").forEach((el) => {
      el.hidden = !show;
    });
  };
  const devStatsInit = localStorage.getItem(DEV_STATS_KEY) === "true";
  applyDevStats(devStatsInit);
  if (devStatsToggle) {
    devStatsToggle.checked = devStatsInit;
    devStatsToggle.addEventListener("change", () => {
      localStorage.setItem(DEV_STATS_KEY, String(devStatsToggle.checked));
      applyDevStats(devStatsToggle.checked);
      if (devStatsFeedback) {
        devStatsFeedback.textContent = "已应用";
        devStatsFeedback.className = "settings-feedback ok";
        setTimeout(() => { devStatsFeedback.textContent = ""; }, 1500);
      }
    });
  }

  // ── 开发者模式总开关 ──
  // 关闭时隐藏「高级（开发者模式）」导航组（社交媒体 + 开发调试），并在 body 上加 class
  // 让其他需要根据模式调整的 UI 也能用 CSS 钩子
  const DEVELOPER_MODE_KEY = "pulse_developer_mode";
  const devModeToggle = document.getElementById("settings-developer-mode-toggle");
  const devModeFeedback = document.getElementById("settings-developer-mode-feedback");
  const advancedNavGroup = document.getElementById("settings-nav-group-advanced");

  const applyDeveloperMode = (on) => {
    document.body.classList.toggle("developer-mode", !!on);
    if (advancedNavGroup) advancedNavGroup.hidden = !on;
    // 如果当前正在查看的是 social / developer tab，但模式被关闭了，自动跳回外观
    if (!on) {
      const active = overlay.querySelector(".settings-nav-item.active")?.dataset.tab;
      if (active === "social" || active === "developer") {
        overlay.querySelectorAll(".settings-nav-item").forEach((b) => {
          b.classList.toggle("active", b.dataset.tab === "appearance");
        });
        overlay.querySelectorAll(".settings-tab").forEach((t) => {
          t.classList.toggle("active", t.dataset.tab === "appearance");
        });
      }
    }
  };
  const devModeInit = localStorage.getItem(DEVELOPER_MODE_KEY) === "true";
  applyDeveloperMode(devModeInit);
  if (devModeToggle) {
    devModeToggle.checked = devModeInit;
    devModeToggle.addEventListener("change", () => {
      localStorage.setItem(DEVELOPER_MODE_KEY, String(devModeToggle.checked));
      applyDeveloperMode(devModeToggle.checked);
      if (devModeFeedback) {
        devModeFeedback.textContent = devModeToggle.checked ? "已开启" : "已关闭";
        devModeFeedback.className = "settings-feedback ok";
        setTimeout(() => { devModeFeedback.textContent = ""; }, 1500);
      }
    });
  }

  // ── L2 原始流开关 ──
  const L2_STREAM_KEY = "pulse_show_l2_stream";
  const l2StreamToggle = document.getElementById("settings-l2-stream-toggle");
  const l2StreamFeedback = document.getElementById("settings-l2-stream-feedback");
  const applyL2Stream = (show) => {
    const stream = document.querySelector("#ai-workbench .stream");
    if (stream) stream.hidden = !show;
  };
  // 默认关闭 AI 后台明细：销售/老板不需要看原始流，只看状态摘要更清爽
  // 显式打开过的用户保留他们的偏好（localStorage 里存了 "true"）
  const l2StreamInit = localStorage.getItem(L2_STREAM_KEY) === "true";
  applyL2Stream(l2StreamInit);
  if (l2StreamToggle) {
    l2StreamToggle.checked = l2StreamInit;
    l2StreamToggle.addEventListener("change", () => {
      localStorage.setItem(L2_STREAM_KEY, String(l2StreamToggle.checked));
      applyL2Stream(l2StreamToggle.checked);
      if (l2StreamFeedback) {
        l2StreamFeedback.textContent = "已应用";
        l2StreamFeedback.className = "settings-feedback ok";
        setTimeout(() => { l2StreamFeedback.textContent = ""; }, 1500);
      }
    });
  }

  // ── 开关 ──
  function openSettings(tab = null) {
    if (typeof window.pulseSetView === "function") {
      window.pulseSetView("settings");
    } else {
      overlay.hidden = false;
    }
    loadSettings();
    loadVoiceSettings();
    loadSocialSettings();
    loadIndustrySettings();
    loadProactiveSettings();
    if (tab) {
      overlay.querySelectorAll(".settings-nav-item").forEach(b => {
        b.classList.toggle("active", b.dataset.tab === tab);
      });
      overlay.querySelectorAll(".settings-tab").forEach(t => {
        t.classList.toggle("active", t.dataset.tab === tab);
      });
      if (tab === "social") loadSocialSettings();
      if (tab === "industry") loadIndustrySettings();
      if (tab === "proactive") loadProactiveSettings();
    }
  }

  function closeSettings() {
    if (typeof window.pulseSetView === "function") {
      window.pulseSetView("chat");
    } else {
      overlay.hidden = true;
    }
    if (llmKeyInput) llmKeyInput.value = "";
    if (minimaxKeyInput) minimaxKeyInput.value = "";
  }

  settingsBtn.addEventListener("click", () => openSettings());
  closeBtn.addEventListener("click", closeSettings);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSettings(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) closeSettings(); });

  // 顶部状态条点击跳转到对应 tab
  overlay.querySelectorAll(".sss-card[data-jump]").forEach((card) => {
    card.addEventListener("click", () => {
      const tab = card.getAttribute("data-jump");
      if (!tab) return;
      overlay.querySelectorAll(".settings-nav-item").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
      overlay.querySelectorAll(".settings-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
      if (tab === "social") loadSocialSettings();
      if (tab === "industry") loadIndustrySettings();
      if (tab === "proactive") loadProactiveSettings();
    });
  });

  if (providerSelect) {
    providerSelect.addEventListener("change", () => {
      const provider = providerSelect.value;
      const customSection = document.getElementById("settings-custom-llm-section");
      const modelRow = document.getElementById("settings-model-row");
      if (provider === "custom") {
        if (customSection) customSection.style.display = "";
        if (modelRow) modelRow.style.display = "none";
      } else {
        if (customSection) customSection.style.display = "none";
        if (modelRow) modelRow.style.display = "";
        if (cachedProviders?.[provider]) populateModelSelect(cachedProviders[provider].models, null);
      }
    });
  }

  saveLlmBtn?.addEventListener("click", async () => {
    const provider = providerSelect?.value || "auto";
    const apiKey = llmKeyInput.value.trim();
    saveLlmBtn.disabled = true;

    // 自定义端点走独立激活流程
    if (provider === "custom") {
      const baseURL = document.getElementById("settings-custom-baseurl")?.value?.trim();
      const model   = document.getElementById("settings-custom-model")?.value?.trim();
      if (!baseURL || !model) {
        showFeedback(llmFeedback, "请填写 Base URL 和模型名称", true);
        saveLlmBtn.disabled = false;
        return;
      }
      try {
        const res = await fetch(`${API}/activate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "custom", baseURL, model, apiKey: apiKey || "none" }),
        });
        const data = await res.json();
        if (data.ok) {
          showFeedback(llmFeedback, `已连接：${data.model}`);
          llmKeyInput.value = "";
          loadSettings();
        } else {
          showFeedback(llmFeedback, data.error || "连接失败", true);
        }
      } catch { showFeedback(llmFeedback, "请求失败", true); }
      finally { saveLlmBtn.disabled = false; }
      return;
    }

    const model = modelSelect.value;
    try {
      const body = apiKey
        ? { provider, apiKey, ...(provider === "auto" ? {} : { model }) }
        : { model };
      const res = await fetch(apiKey ? `${API}/activate` : `${API}/settings/model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        showFeedback(llmFeedback, "已保存");
        llmKeyInput.value = "";
        loadSettings();
      } else {
        showFeedback(llmFeedback, data.error || "保存失败", true);
      }
    } catch { showFeedback(llmFeedback, "请求失败", true); }
    finally { saveLlmBtn.disabled = false; }
  });

  saveMinimaxBtn?.addEventListener("click", async () => {
    const apiKey = minimaxKeyInput.value.trim();
    if (!apiKey) { showFeedback(minimaxFeedback, "Key 不能为空", true); return; }
    saveMinimaxBtn.disabled = true;
    try {
      const res = await fetch(`${API}/settings/minimax`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (data.ok) {
        showFeedback(minimaxFeedback, "已保存");
        minimaxKeyInput.value = "";
        loadSettings();
      } else {
        showFeedback(minimaxFeedback, data.error || "保存失败", true);
      }
    } catch { showFeedback(minimaxFeedback, "请求失败", true); }
    finally { saveMinimaxBtn.disabled = false; }
  });

  // ── 微信 ClawBot 扫码 ──
  const clawbotConnectBtn = document.getElementById("clawbot-connect-btn");
  const clawbotLogoutBtn  = document.getElementById("clawbot-logout-btn");
  const clawbotQrArea     = document.getElementById("clawbot-qr-area");
  const clawbotQrImg      = document.getElementById("clawbot-qr-img");
  const clawbotQrHint     = document.getElementById("clawbot-qr-hint");
  const clawbotFeedback   = document.getElementById("clawbot-feedback");
  const clawbotStatus     = document.getElementById("social-status-clawbot");
  let clawbotPollTimer    = null;

  function setClawbotStatus(text, ok) {
    if (!clawbotStatus) return;
    clawbotStatus.textContent = ok ? `● ${text}` : `○ ${text}`;
    clawbotStatus.className = `settings-platform-status ${ok ? "ok" : "miss"}`;
  }

  function stopClawbotPoll() {
    if (clawbotPollTimer) { clearInterval(clawbotPollTimer); clawbotPollTimer = null; }
  }

  function renderClawbotQr(raw) {
    if (!clawbotQrImg || !raw) return;
    const qr = String(raw || "").trim();
    const fallback = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
    clawbotQrImg.onerror = () => {
      if (clawbotQrImg.src !== fallback) clawbotQrImg.src = fallback;
    };
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(qr)) {
      clawbotQrImg.src = qr;
    } else {
      clawbotQrImg.src = fallback;
    }
  }

  async function pollClawbotQR() {
    try {
      const data = await fetch(`${API}/social/wechat-clawbot/qr`).then(r => r.json());
      if (data.status === "connected") {
        stopClawbotPoll();
        if (clawbotQrArea) clawbotQrArea.style.display = "none";
        setClawbotStatus("已连接", true);
        if (clawbotFeedback) showFeedback(clawbotFeedback, "微信绑定成功！");
        loadSocialSettings();
      } else if (data.status === "qr_ready" && data.qr_url) {
        renderClawbotQr(data.qr_url);
        if (clawbotQrArea) clawbotQrArea.style.display = "block";
        if (clawbotQrHint) clawbotQrHint.textContent = "等待扫码…";
        setClawbotStatus("等待扫码", false);
      } else if (data.status === "qr_pending") {
        if (clawbotQrArea) clawbotQrArea.style.display = "block";
        if (clawbotQrImg) clawbotQrImg.removeAttribute("src");
        if (clawbotQrHint) clawbotQrHint.textContent = "正在生成二维码…";
        setClawbotStatus("正在生成二维码", false);
      } else if (data.status === "idle") {
        stopClawbotPoll();
        if (clawbotQrArea) clawbotQrArea.style.display = "none";
        setClawbotStatus("未连接", false);
        if (clawbotFeedback) showFeedback(clawbotFeedback, data.error || "微信连接器未启动，请重新点击连接微信", true);
      } else if (data.status === "error") {
        stopClawbotPoll();
        if (clawbotQrArea) clawbotQrArea.style.display = "none";
        setClawbotStatus("连接失败", false);
        if (clawbotFeedback) showFeedback(clawbotFeedback, data.error || "连接失败", true);
      }
    } catch {}
  }

  // 初始化时检查一次当前状态
  if (clawbotConnectBtn) {
    pollClawbotQR();
  }

  clawbotConnectBtn?.addEventListener("click", async () => {
    if (clawbotQrArea) clawbotQrArea.style.display = "none";
    setClawbotStatus("正在启动…", false);
    stopClawbotPoll();
    // 触发后端重启 ClawBot 连接器
    try {
      const resp = await fetch(`${API}/social/wechat-clawbot/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      let body = null;
      try { body = await resp.json(); } catch {}
      if (!resp.ok) {
        let message = `HTTP ${resp.status}`;
        message = body?.error || body?.message || message;
        throw new Error(message);
      }
      if (body?.status === "qr_ready" && body.qr_url) {
        renderClawbotQr(body.qr_url);
        if (clawbotQrArea) clawbotQrArea.style.display = "block";
        if (clawbotQrHint) clawbotQrHint.textContent = "等待扫码…";
        setClawbotStatus("等待扫码", false);
      } else if (body?.status === "qr_pending") {
        if (clawbotQrArea) clawbotQrArea.style.display = "block";
        if (clawbotQrHint) clawbotQrHint.textContent = "正在生成二维码…";
        setClawbotStatus("正在生成二维码", false);
      }
    } catch (err) {
      stopClawbotPoll();
      setClawbotStatus("启动失败", false);
      if (clawbotFeedback) showFeedback(clawbotFeedback, err?.message || "微信连接器启动失败", true);
      return;
    }
    // 开始轮询 QR 状态
    await pollClawbotQR();
    clawbotPollTimer = setInterval(pollClawbotQR, 2000);
  });

  clawbotLogoutBtn?.addEventListener("click", async () => {
    stopClawbotPoll();
    if (clawbotQrArea) clawbotQrArea.style.display = "none";
    try {
      await fetch(`${API}/social/wechat-clawbot/logout`, { method: "POST" });
      setClawbotStatus("已断开", false);
      showFeedback(clawbotFeedback, "已断开微信连接");
    } catch {
      showFeedback(clawbotFeedback, "请求失败", true);
    }
  });

  // 监听 SSE 事件更新 ClawBot 状态
  window.addEventListener("pulse:social_status", (e) => {
    const d = e.detail;
    if (d?.platform !== "wechat-clawbot") return;
    if (d.status === "connected") {
      stopClawbotPoll();
      if (clawbotQrArea) clawbotQrArea.style.display = "none";
      setClawbotStatus("已连接", true);
    } else if (d.status === "qr_ready") {
      if (!clawbotPollTimer) clawbotPollTimer = setInterval(pollClawbotQR, 2000);
      pollClawbotQR();
    } else if (d.status === "session_expired") {
      stopClawbotPoll();
      setClawbotStatus("会话过期，请重新扫码", false);
    } else if (d.status === "idle") {
      setClawbotStatus("未连接", false);
    }
  });
})();

// ── Voice panel ──
initVoicePanel({
  btnId:      "voice-btn",
  panelId:    "voice-panel",
  canvasId:   "voice-canvas",
  statusId:   "voice-status",
  transcriptId: "voice-transcript",
  getChatInput:  () => document.getElementById("msg-input"),
  getSendBtn:    () => document.getElementById("send-btn"),
  getSendMessage: (options) => chat?.send?.(options),
  getLang:       () => localStorage.getItem("pulse-voice-lang") || "zh-CN",
  getAutoSend:   () => localStorage.getItem("pulse-voice-auto-send") !== "false",
});

// ── Hotspot mode ──
initHotspot().catch((err) => console.warn('[Hotspot] 初始化失败:', err));

// ── Media modes (video / image) ──
(function initMediaModes() {
  const videoBtn      = document.getElementById("video-btn");
  const videoExitBtn  = document.getElementById("video-exit-btn");
  const videoFeed     = document.getElementById("video-feed");
  const videoFrame    = document.getElementById("video-frame");
  const videoSurface  = document.getElementById("video-surface");
  const videoBackdrop = document.getElementById("video-backdrop");
  const videoTitle    = document.getElementById("video-title");
  const imageExitBtn  = document.getElementById("image-exit-btn");
  const imageDisplay  = document.getElementById("image-display");
  const imageSurface  = document.getElementById("image-surface");
  const imageTitle    = document.getElementById("image-title");

  let videoStream = null;
  let videoActive = false;
  let imageActive = false;
  let videoKind   = "empty";
  let currentVideoSource = "";
  let currentVideoStart = null;

  function normalizeUrl(url = "") {
    return String(url || "").trim();
  }

  function localPathToUrl(src) {
    const s = String(src || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    // Local path (file:// or absolute) → backend HTTP media endpoint，避免 file:// 跨源限制
    let resolved = s;
    if (/^file:\/\//i.test(s)) {
      resolved = decodeURIComponent(s.replace(/^file:\/\/\//i, "").replace(/^file:\/\//i, ""));
    }
    const filename = resolved.split(/[\\/]/).filter(Boolean).pop() || "";
    if (!filename) return s;
    return "/media/music/" + encodeURIComponent(filename);
  }

  function extractYoutubeId(url) {
    return normalizeUrl(url).match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/
    )?.[1] || null;
  }

  function youtubeEmbedUrl(url, { autoplay = false, start = null } = {}) {
    const id = extractYoutubeId(url);
    if (!id) return null;
    const params = new URLSearchParams({
      enablejsapi: "1",
      playsinline: "1",
      rel: "0",
      autoplay: autoplay ? "1" : "0",
    });
    if (Number.isFinite(Number(start))) params.set("start", String(Math.max(0, Math.round(Number(start)))));
    return `https://www.youtube.com/embed/${id}?${params.toString()}`;
  }

  function extractBilibiliId(url) {
    const raw = normalizeUrl(url);
    return raw.match(/\/video\/(BV[A-Za-z0-9]+)/i)?.[1]
        || raw.match(/\b(BV[A-Za-z0-9]+)\b/i)?.[1]
        || null;
  }

  function bilibiliEmbedUrl(url, { autoplay = false, start = null } = {}) {
    const bvid = extractBilibiliId(url);
    if (!bvid) return null;
    const params = new URLSearchParams({
      bvid,
      autoplay: autoplay ? "1" : "0",
      high_quality: "1",
    });
    if (Number.isFinite(Number(start))) params.set("t", String(Math.max(0, Math.round(Number(start)))));
    return `https://player.bilibili.com/player.html?${params.toString()}`;
  }

  function iframeUrlFor(url, options) {
    return youtubeEmbedUrl(url, options) || bilibiliEmbedUrl(url, options);
  }

  // ── 历史记录 ──────────────────────────────────────────────────────────────
  function saveMediaHistory({ url, title, kind, videoId = null, platform = null }) {
    fetch(`${API}/media/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, title: title || "", kind, videoId, platform }),
    }).catch(() => {});
  }

  // ── YouTube oEmbed 预验证（异步，不阻塞显示） ────────────────────────────
  async function validateYoutubeUrl(url) {
    try {
      const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const res = await fetch(oembed, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return null; // 网络失败时不做判断，允许继续
    }
  }

  // ── 摄像头 ────────────────────────────────────────────────────────────────
  function stopCamera() {
    videoStream?.getTracks().forEach(t => t.stop());
    videoStream = null;
  }

  // ── 面板纯显示状态（不销毁内容）────────────────────────────────────────
  function setPanelVisible(visible) {
    videoActive = Boolean(visible);
    document.body.classList.toggle("video-mode", videoActive);
    videoBtn?.classList.toggle("active", videoActive);
    if (videoActive) moveVoicePanelToBody();
    else restoreVoicePanel();
    window.dispatchEvent(new CustomEvent("pulse:video-mode", {
      detail: { active: videoActive, kind: videoKind },
    }));
  }

  // ── 暂停当前视频 ──────────────────────────────────────────────────────────
  function pauseCurrentVideo() {
    if (videoKind === "youtube") {
      postFrameCommand("pauseVideo");
    } else if (videoKind === "bilibili") {
      reloadFrameAutoplay(false);
    } else if (videoKind === "file") {
      try { videoFeed?.pause?.(); } catch {}
    }
  }

  // ── 恢复当前视频 ──────────────────────────────────────────────────────────
  function resumeCurrentVideo() {
    if (videoKind === "youtube") {
      postFrameCommand("playVideo");
    } else if (videoKind === "bilibili") {
      reloadFrameAutoplay(true);
    } else if (videoKind === "file") {
      videoFeed?.play?.().catch(() => {});
    }
  }

  // ── 清空内容（退出按钮专用）────────────────────────────────────────────
  function resetVideoSurface() {
    stopCamera();
    if (videoFeed) {
      try { videoFeed.pause(); } catch {}
      videoFeed.removeAttribute("src");
      videoFeed.srcObject = null;
      videoFeed.hidden = true;
      videoFeed.load?.();
    }
    if (videoFrame) {
      videoFrame.src = "about:blank";
      videoFrame.hidden = true;
    }
    if (videoBackdrop) videoBackdrop.style.backgroundImage = "";
    videoSurface?.classList.remove("has-media");
    videoKind = "empty";
    currentVideoSource = "";
    currentVideoStart = null;
  }

  // ── V 键 / 顶栏按钮：暂停+收起 / 继续播放+展开 ────────────────────────
  function toggleVideoPanelVisibility() {
    if (videoActive) {
      pauseCurrentVideo();
      setPanelVisible(false);
    } else {
      if (musicActive) closeMusicPanel();
      setPanelVisible(true);
      if (videoKind !== "empty") resumeCurrentVideo();
    }
  }

  // ── 退出按钮：完全关闭并销毁 ─────────────────────────────────────────
  function closeAndDestroyVideo() {
    setPanelVisible(false);
    resetVideoSurface();
  }

  // ── Agent 调用 hide/close 时：同退出按钮 ────────────────────────────────
  function setVideoModeActive(active) {
    if (!active) {
      closeAndDestroyVideo();
    } else {
      setPanelVisible(true);
    }
  }

  function setBackdrop(kind, url) {
    if (!videoBackdrop) return;
    if (kind === "youtube") {
      const id = extractYoutubeId(url);
      if (id) {
        videoBackdrop.style.backgroundImage =
          `url(https://img.youtube.com/vi/${id}/maxresdefault.jpg)`;
        return;
      }
    }
    // Bilibili / file / camera：纯色兜底（CSS 已有 #000 背景）
    videoBackdrop.style.backgroundImage = "";
  }

  async function showCamera({ title = "Camera", autoplay = true } = {}) {
    setPanelVisible(true);
    resetVideoSurface();
    if (videoTitle) videoTitle.textContent = title;
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoFeed) {
        videoFeed.hidden = false;
        videoFeed.muted = true;
        videoFeed.srcObject = videoStream;
        if (autoplay) videoFeed.play?.().catch(() => {});
      }
      videoSurface?.classList.add("has-media");
      videoKind = "camera";
    } catch (e) {
      console.warn("摄像头访问失败:", e);
    }
  }

  async function showVideo({
    url = "", title = "Video", autoplay = false,
    muted = false, volume = null, currentTime = null, camera = false,
  } = {}) {
    if (camera) { showCamera({ title, autoplay }); return; }

    const source = normalizeUrl(url);
    if (musicActive) closeMusicPanel();
    setPanelVisible(true);
    resetVideoSurface();
    currentVideoSource = source;
    currentVideoStart = Number.isFinite(Number(currentTime)) ? Math.max(0, Number(currentTime)) : null;
    if (videoTitle) videoTitle.textContent = title || "Video";

    const embedUrl = iframeUrlFor(source, { autoplay, start: currentTime });
    if (embedUrl && videoFrame) {
      videoFrame.hidden = false;
      videoFrame.src = embedUrl;
      videoSurface?.classList.add("has-media");
      videoKind = embedUrl.includes("youtube.com") ? "youtube" : "bilibili";

      setBackdrop(videoKind, source);
      saveMediaHistory({
        url: source,
        title,
        kind: videoKind,
        videoId: videoKind === "youtube" ? extractYoutubeId(source) : extractBilibiliId(source),
        platform: videoKind,
      });

      // 后台验证 YouTube 可访问性，不可用时给控制台警告
      if (videoKind === "youtube") {
        validateYoutubeUrl(source).then(ok => {
          if (ok === false) console.warn("[Media] YouTube 视频可能无法播放（区域限制/私有/已删除）:", source);
        });
      }
      return;
    }

    if (videoFeed && source) {
      videoFeed.hidden = false;
      videoFeed.src = source;
      videoFeed.muted = Boolean(muted);
      if (Number.isFinite(Number(volume))) videoFeed.volume = Math.max(0, Math.min(1, Number(volume)));
      if (Number.isFinite(Number(currentTime))) videoFeed.currentTime = Math.max(0, Number(currentTime));
      videoSurface?.classList.add("has-media");
      videoKind = "file";
      saveMediaHistory({ url: source, title, kind: "file" });
      if (autoplay) videoFeed.play?.().catch(() => {});
    }
  }

  function postFrameCommand(command, args = []) {
    if (!videoFrame?.contentWindow || videoFrame.hidden) return;
    if (videoKind === "youtube") {
      videoFrame.contentWindow.postMessage(JSON.stringify({
        event: "command",
        func: command,
        args,
      }), "*");
    }
  }

  function reloadFrameAutoplay(autoplay) {
    if (!videoFrame || videoFrame.hidden || !currentVideoSource) return;
    const nextUrl = iframeUrlFor(currentVideoSource, {
      autoplay,
      start: currentVideoStart,
    });
    if (nextUrl) videoFrame.src = nextUrl;
  }

  function controlVideo({ action, volume, currentTime, autoplay } = {}) {
    const op = action || (autoplay ? "play" : null);
    if (op === "hide" || op === "close") { closeAndDestroyVideo(); return; }
    if (op === "play") resumeCurrentVideo();
    if (op === "pause") pauseCurrentVideo();
    if (Number.isFinite(Number(volume))) {
      const v = Math.max(0, Math.min(1, Number(volume)));
      if (videoFeed) { videoFeed.volume = v; videoFeed.muted = v === 0; }
      postFrameCommand("setVolume", [Math.round(v * 100)]);
    }
    if (Number.isFinite(Number(currentTime))) {
      const t = Math.max(0, Number(currentTime));
      currentVideoStart = t;
      if (videoFeed) videoFeed.currentTime = t;
      postFrameCommand("seekTo", [t, true]);
    }
  }

  function setImageModeActive(active) {
    imageActive = Boolean(active);
    document.body.classList.toggle("image-mode", imageActive);
    if (!imageActive && imageDisplay) {
      imageDisplay.removeAttribute("src");
      imageDisplay.alt = "";
      imageSurface?.classList.remove("has-media");
    }
  }

  function showImage({ url = "", title = "Image", alt = "" } = {}) {
    const source = normalizeUrl(url);
    setImageModeActive(true);
    if (imageTitle) imageTitle.textContent = title || "Image";
    if (imageDisplay && source) {
      imageDisplay.src = source;
      imageDisplay.alt = alt || title || "";
      imageSurface?.classList.add("has-media");
    }
  }

  function handleMediaCommand(payload = {}) {
    const mode   = payload.mode || payload.kind;
    const action = payload.action || "show";
    if (mode === "image") {
      if (action === "hide" || action === "close") setImageModeActive(false);
      else showImage(payload);
      return { ok: true, mode: "image", action };
    }
    if (mode === "camera") {
      if (action === "hide" || action === "close") closeAndDestroyVideo();
      else showCamera(payload);
      return { ok: true, mode: "camera", action };
    }
    if (mode === "video") {
      if (action === "show" || payload.url || payload.camera) showVideo(payload);
      else controlVideo(payload);
      return { ok: true, mode: "video", action };
    }
    if (mode === "music") {
      if (action === "show" || payload.src || payload.playlist) showMusic(payload);
      else controlMusic(payload);
      return { ok: true, mode: "music", action };
    }
    return { ok: false, error: "unknown media mode" };
  }

  // ── Music mode ────────────────────────────────────────────────────────────
  const musicBtn       = document.getElementById("music-btn");
  const musicExitBtn   = document.getElementById("music-exit-btn");
  const musicAudio     = document.getElementById("music-audio");
  const musicPlayBtn   = document.getElementById("music-play");
  const musicPrevBtn   = document.getElementById("music-prev");
  const musicNextBtn   = document.getElementById("music-next");
  const musicSeek      = document.getElementById("music-seek");
  const musicVolInput  = document.getElementById("music-vol");
  const musicTimeCur   = document.getElementById("music-time-cur");
  const musicTimeTotal = document.getElementById("music-time-total");
  const musicMetaTitle  = document.getElementById("music-meta-title");
  const musicMetaArtist = document.getElementById("music-meta-artist");
  const musicCoverEl    = document.getElementById("music-cover");
  const musicCoverTitle = document.getElementById("music-cover-title");
  const musicCoverArtist = document.getElementById("music-cover-artist");
  const musicLyricsScroll = document.getElementById("music-lyrics-scroll");
  const musicNoLyrics     = document.getElementById("music-no-lyrics");

  let musicActive  = false;
  let musicPlaying = false;
  let musicWasPlayingBeforeHide = false;
  let lrcLines     = [];
  let playlist     = [];
  let playlistIdx  = 0;
  let isSeeking    = false;

  function parseLrc(text) {
    const lines = [];
    const re = /\[(\d+):(\d{1,2}(?:\.\d+)?)\](.*)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const t = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
      const txt = m[3].trim();
      if (txt) lines.push({ time: t, text: txt });
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  function setMusicPanelVisible(visible) {
    musicActive = Boolean(visible);
    document.body.classList.toggle("music-mode", musicActive);
    musicBtn?.classList.toggle("active", musicActive);
    window.dispatchEvent(new CustomEvent("pulse:music-mode", {
      detail: { active: musicActive },
    }));
  }

  function setMusicPlaying(playing) {
    musicPlaying = Boolean(playing);
    document.body.classList.toggle("music-playing", musicPlaying);
    if (musicPlayBtn) musicPlayBtn.textContent = musicPlaying ? "⏸" : "▶";
    if (musicPlaying) {
      musicAudio?.play?.().catch(() => {});
    } else {
      musicAudio?.pause?.();
    }
  }

  function loadLrc(lrcText) {
    lrcLines = lrcText ? parseLrc(lrcText) : [];
    if (musicLyricsScroll) {
      musicLyricsScroll.innerHTML = lrcLines
        .map((l, i) => `<div class="lrc-line" data-idx="${i}">${l.text}</div>`)
        .join("");
    }
    if (musicNoLyrics) musicNoLyrics.hidden = lrcLines.length > 0;
  }

  function syncLyrics(currentTime) {
    if (!lrcLines.length || !musicLyricsScroll) return;
    let active = -1;
    for (let i = 0; i < lrcLines.length; i++) {
      if (lrcLines[i].time <= currentTime + 0.3) active = i;
      else break;
    }
    if (active < 0) return;
    const lines = musicLyricsScroll.querySelectorAll(".lrc-line");
    lines.forEach((el, i) => el.classList.toggle("active", i === active));
    const activeLine = lines[active];
    if (activeLine) {
      const pane = document.getElementById("music-lyrics-pane");
      if (pane) pane.scrollTo({ top: activeLine.offsetTop - pane.clientHeight / 2 + activeLine.clientHeight / 2, behavior: "smooth" });
    }
  }

  function loadTrack(index, autoplay = true) {
    const track = playlist[index];
    if (!track || !musicAudio) return;

    musicAudio.src = localPathToUrl(track.src || "");
    musicAudio.volume = parseFloat(musicVolInput?.value ?? "0.8");

    const title  = track.title  || "未知曲目";
    const artist = track.artist || "";
    if (musicMetaTitle)  musicMetaTitle.textContent  = title;
    if (musicMetaArtist) musicMetaArtist.textContent = artist;
    if (musicCoverTitle)  musicCoverTitle.textContent  = title.slice(0, 14);
    if (musicCoverArtist) musicCoverArtist.textContent = artist;
    if (musicTimeCur)   musicTimeCur.textContent   = "0:00";
    if (musicTimeTotal) musicTimeTotal.textContent = "0:00";
    if (musicSeek)      { musicSeek.value = "0"; musicSeek.max = "100"; }

    if (track.cover && musicCoverEl) {
      musicCoverEl.style.backgroundImage = `url(${track.cover})`;
      musicCoverEl.style.background = "";
    } else if (musicCoverEl) {
      musicCoverEl.style.backgroundImage = "";
      let hash = 0;
      for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
      const hue = Math.abs(hash) % 360;
      musicCoverEl.style.background = `hsl(${hue}, 45%, 32%)`;
    }

    loadLrc(track.lrc || "");
    if (autoplay) setMusicPlaying(true);
  }

  function showMusic({
    src = "", title = "", artist = "", lrc = "", cover = "",
    autoplay = true, playlist: pl = null,
  } = {}) {
    if (videoActive) closeAndDestroyVideo();
    setMusicPanelVisible(true);
    if (pl && pl.length) {
      playlist = pl;
    } else {
      playlist = [{ src, title, artist, lrc, cover }];
    }
    playlistIdx = 0;
    loadTrack(0, autoplay);
  }

  function closeMusicPanel() {
    setMusicPlaying(false);
    setMusicPanelVisible(false);
    if (musicAudio) musicAudio.src = "";
    lrcLines = [];
    if (musicLyricsScroll) musicLyricsScroll.innerHTML = "";
    if (musicNoLyrics) musicNoLyrics.hidden = false;
  }

  function controlMusic({ action, volume, currentTime } = {}) {
    if (action === "hide" || action === "close") { closeMusicPanel(); return; }
    if (action === "play")  setMusicPlaying(true);
    if (action === "pause") setMusicPlaying(false);
    if (Number.isFinite(Number(volume))) {
      const v = Math.max(0, Math.min(1, Number(volume)));
      if (musicAudio) musicAudio.volume = v;
      if (musicVolInput) musicVolInput.value = String(v);
    }
    if (Number.isFinite(Number(currentTime)) && musicAudio) {
      musicAudio.currentTime = Math.max(0, Number(currentTime));
    }
  }

  function toggleMusicPanelVisibility() {
    if (musicActive) {
      musicWasPlayingBeforeHide = musicPlaying;
      setMusicPlaying(false);
      setMusicPanelVisible(false);
    } else if (musicAudio?.src) {
      if (videoActive) closeAndDestroyVideo();
      setMusicPanelVisible(true);
      if (musicWasPlayingBeforeHide) setMusicPlaying(true);
    }
  }

  if (musicAudio) {
    musicAudio.addEventListener("loadedmetadata", () => {
      if (musicTimeTotal) musicTimeTotal.textContent = fmtTime(musicAudio.duration);
      if (musicSeek) musicSeek.max = String(musicAudio.duration || 100);
    });
    musicAudio.addEventListener("timeupdate", () => {
      if (isSeeking) return;
      const t = musicAudio.currentTime;
      if (musicTimeCur) musicTimeCur.textContent = fmtTime(t);
      if (musicSeek && musicAudio.duration) musicSeek.value = String(t);
      syncLyrics(t);
    });
    musicAudio.addEventListener("ended", () => {
      setMusicPlaying(false);
      if (playlistIdx < playlist.length - 1) {
        playlistIdx++;
        loadTrack(playlistIdx, true);
      }
    });
  }

  musicPlayBtn?.addEventListener("click", () => setMusicPlaying(!musicPlaying));
  musicPrevBtn?.addEventListener("click", () => {
    if (playlistIdx > 0) { playlistIdx--; loadTrack(playlistIdx, musicPlaying); }
    else if (musicAudio) musicAudio.currentTime = 0;
  });
  musicNextBtn?.addEventListener("click", () => {
    if (playlistIdx < playlist.length - 1) { playlistIdx++; loadTrack(playlistIdx, musicPlaying); }
  });
  musicVolInput?.addEventListener("input", () => {
    if (musicAudio) musicAudio.volume = parseFloat(musicVolInput.value);
  });
  musicSeek?.addEventListener("mousedown", () => { isSeeking = true; });
  musicSeek?.addEventListener("input", () => {
    if (musicTimeCur) musicTimeCur.textContent = fmtTime(parseFloat(musicSeek.value));
  });
  musicSeek?.addEventListener("change", () => {
    if (musicAudio) musicAudio.currentTime = parseFloat(musicSeek.value);
    isSeeking = false;
  });
  musicExitBtn?.addEventListener("click", closeMusicPanel);
  musicBtn?.addEventListener("click", toggleMusicPanelVisibility);

  window.addEventListener("keydown", (e) => {
    if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA" || e.target?.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      toggleMusicPanelVisibility();
    }
  });

  window.pulseMedia = { handle: handleMediaCommand, showVideo, controlVideo, showImage, showCamera, showMusic, controlMusic };
  window.addEventListener("pulse:media", (event) => handleMediaCommand(event.detail || {}));

  // 顶栏按钮：暂停+收起 / 展开+继续（不销毁）
  videoBtn?.addEventListener("click", toggleVideoPanelVisibility);
  // 退出按钮：完全关闭
  videoExitBtn?.addEventListener("click", closeAndDestroyVideo);
  imageExitBtn?.addEventListener("click", () => setImageModeActive(false));

  // V 键：同顶栏按钮逻辑
  window.addEventListener("keydown", (e) => {
    if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA" || e.target?.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "v" || e.key === "V") {
      e.preventDefault();
      toggleVideoPanelVisibility();
    }
    // H 键：切换热点模式
    if (e.key === "h" || e.key === "H") {
      e.preventDefault();
      toggleHotspot();
    }
  });
})();
