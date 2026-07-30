import { API } from "./api-client.js";

const SIM_DEVICE_ID_KEY = "nimo-sim-device-id";

const $ = (id) => document.getElementById(id);

function getSimDeviceId() {
  try {
    const saved = localStorage.getItem(SIM_DEVICE_ID_KEY);
    if (saved) return saved;
    const next = `nimo-sim-${Math.random().toString(16).slice(2, 8)}`;
    localStorage.setItem(SIM_DEVICE_ID_KEY, next);
    return next;
  } catch {
    return "nimo-sim-local";
  }
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function getDeviceBaseUrl(server = {}) {
  return server.recommendedUrl || server.lanUrls?.[0] || server.localUrl || "http://127.0.0.1:52557";
}

function addDeviceLog(message) {
  const log = $("device-log");
  if (!log) return;
  const line = document.createElement("div");
  line.textContent = `${new Date().toLocaleTimeString()} · ${message}`;
  log.prepend(line);
  while (log.children.length > 20) log.lastElementChild?.remove();
}

function renderServerInfo(server = {}) {
  const url = getDeviceBaseUrl(server);
  const accessUrl = $("device-access-url");
  const lanState = $("device-lan-state");
  const addresses = $("device-address-list");
  const hint = $("device-lan-hint");
  if (accessUrl) accessUrl.textContent = url;
  if (lanState) {
    lanState.textContent = server.lanEnabled ? "局域网已开启" : "仅本机可访问";
    lanState.dataset.state = server.lanEnabled ? "online" : "warn";
  }
  if (addresses) {
    const items = server.lanUrls?.length ? server.lanUrls : [server.localUrl || url];
    addresses.innerHTML = items.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  }
  if (hint) {
    const command = "npm run start:lan";
    const lanText = server.lanAddresses?.length ? `检测到局域网 IP：${server.lanAddresses.join(" / ")}` : "暂未检测到局域网 IP";
    hint.innerHTML = server.lanEnabled
      ? `<strong>硬件可接入</strong><span>${escapeHtml(lanText)}，ESP32-S3 请使用上方局域网地址。</span>`
      : `<strong>硬件暂不可接入</strong><span>${escapeHtml(lanText)}。需要重启到 LAN 模式：<code>${escapeHtml(command)}</code></span>`;
  }
}

function renderProtocol(protocol = {}) {
  const list = $("device-protocol-list");
  if (!list) return;
  const rows = Object.entries(protocol);
  list.innerHTML = rows.length
    ? rows.map(([name, endpoint]) => `<div><strong>${escapeHtml(name)}</strong><code>${escapeHtml(endpoint)}</code></div>`).join("")
    : "<div>暂无协议数据</div>";
}

function renderHardwareVoice(capture = {}) {
  const badge = $("device-voice-badge");
  const state = $("device-voice-state");
  const stats = capture.voiceStats || capture.stats || {};
  const enabled = !!capture.captureEnabled;
  if (badge) {
    badge.textContent = enabled ? "收音中" : "已暂停";
    badge.dataset.state = enabled ? "online" : "warn";
  }
  if (state) {
    const detail = stats.updatedAt
      ? `<span>帧 ${Number(stats.audioFrames || 0)} / PCM ${Number(stats.decodedPcmBytes || 0)} bytes / 状态 ${escapeHtml(stats.listenState || "-")}${stats.lastError ? ` / ${escapeHtml(stats.lastError)}` : ""}</span>`
      : "";
    state.innerHTML = enabled
      ? `<strong>硬件收音已开启</strong><span>ESP32-S3 发来的麦克风音频会进入 NewPulse 识别。</span>${detail}`
      : `<strong>硬件收音已暂停</strong><span>板子可以保持在线，但麦克风音频会被后端丢弃。</span>${detail}`;
  }
}

function renderDevices(devices = []) {
  const list = $("device-list");
  if (!list) return;
  if (!devices.length) {
    list.innerHTML = '<div class="device-empty">还没有设备。可以先点击“注册模拟设备”。</div>';
    return;
  }
  list.innerHTML = devices.map((device) => `
    <article class="device-card ${device.online ? "is-online" : "is-offline"}">
      <div>
        <strong>${escapeHtml(device.name || device.id)}</strong>
        <span>${escapeHtml(device.id || "")}</span>
      </div>
      <small>${device.online ? "在线" : "离线"} · ${escapeHtml(device.type || "device")} · ${formatTime(device.lastSeenAt)}</small>
    </article>
  `).join("");
}

function renderNextReminder(reminder) {
  const box = $("device-next-reminder");
  const completeBtn = $("device-complete-reminder");
  const snoozeBtn = $("device-snooze-reminder");
  if (!box) return;
  if (!reminder) {
    box.dataset.reminderId = "";
    box.innerHTML = '<div class="device-empty">当前没有可推送给硬件的 active 提醒。</div>';
    if (completeBtn) completeBtn.disabled = true;
    if (snoozeBtn) snoozeBtn.disabled = true;
    return;
  }
  box.dataset.reminderId = String(reminder.id);
  box.innerHTML = `
    <div class="device-reminder-title">#${reminder.id} ${escapeHtml(reminder.task || "未命名提醒")}</div>
    <div class="device-reminder-meta">${escapeHtml(reminder.status || "pending")} · ${formatTime(reminder.dueAt)} · 稍后 ${Number(reminder.snoozeCount || 0)} 次</div>
  `;
  if (completeBtn) completeBtn.disabled = false;
  if (snoozeBtn) snoozeBtn.disabled = false;
}

function renderDeviceConfig(config = {}) {
  const list = $("device-config-list");
  if (!list) return;
  const rows = [
    ["轮询提醒", `${Number(config.pollIntervalSeconds || 15)} 秒`],
    ["心跳频率", `${Number(config.heartbeatSeconds || 30)} 秒`],
    ["时区", config.timezone || "local"],
    ["支持动作", Array.isArray(config.actions) ? config.actions.join(" / ") : "complete / snooze"],
    ["稍后选项", Array.isArray(config.snoozeMinutes) ? `${config.snoozeMinutes.join(" / ")} 分钟` : "10 / 60 分钟"],
  ];
  list.innerHTML = rows.map(([label, value]) => `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
}

function renderFirmwareExamples(server = {}, deviceId = getSimDeviceId()) {
  const box = $("device-firmware-examples");
  if (!box) return;
  const base = getDeviceBaseUrl(server).replace(/\/$/, "");
  const firmwareDeviceId = "nimo-esp32s3-001";
  const encodedDeviceId = encodeURIComponent(firmwareDeviceId);
  const registerBody = JSON.stringify({
    id: firmwareDeviceId,
    name: "Nimo ESP32-S3",
    type: "esp32-s3",
    capabilities: ["touch", "screen", "speaker", "camera", "mic"],
  }, null, 2);
  const heartbeatBody = JSON.stringify({ deviceId: firmwareDeviceId }, null, 2);
  const completeBody = JSON.stringify({ deviceId: firmwareDeviceId, reminderId: 123 }, null, 2);
  const snoozeBody = JSON.stringify({ deviceId: firmwareDeviceId, reminderId: 123, minutes: 10 }, null, 2);
  const examples = [
    ["开机注册", `POST ${base}/device/register\nContent-Type: application/json\n\n${registerBody}`],
    ["读取配置", `GET ${base}/device/config?deviceId=${encodedDeviceId}`],
    ["发送心跳", `POST ${base}/device/heartbeat\nContent-Type: application/json\n\n${heartbeatBody}`],
    ["拉取下一条提醒", `GET ${base}/device/next-reminder?deviceId=${encodedDeviceId}`],
    ["完成提醒", `POST ${base}/device/complete\nContent-Type: application/json\n\n${completeBody}`],
    ["稍后提醒", `POST ${base}/device/snooze\nContent-Type: application/json\n\n${snoozeBody}`],
  ];
  box.innerHTML = examples.map(([title, content]) => `
    <article>
      <strong>${escapeHtml(title)}</strong>
      <pre><code>${escapeHtml(content)}</code></pre>
    </article>
  `).join("");
}

async function loadDeviceCenter() {
  const deviceId = getSimDeviceId();
  const [info, config, next] = await Promise.all([
    fetchJson("/device/info"),
    fetchJson(`/device/config?deviceId=${encodeURIComponent(deviceId)}`),
    fetchJson(`/device/next-reminder?deviceId=${encodeURIComponent(deviceId)}`),
  ]);
  renderServerInfo(info.server || {});
  renderProtocol(info.protocol || {});
  renderDevices(info.devices || []);
  renderHardwareVoice({ ...(info.voiceCapture || {}), voiceStats: info.voiceStats || {} });
  renderDeviceConfig(config.config || {});
  renderFirmwareExamples(info.server || {}, deviceId);
  renderNextReminder(next.reminder || null);
}

async function registerSimDevice() {
  const deviceId = getSimDeviceId();
  await fetchJson("/device/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: deviceId,
      name: "Nimo ESP32-S3 模拟设备",
      type: "simulator",
      capabilities: ["touch", "screen", "speaker", "camera", "mic"],
    }),
  });
  addDeviceLog(`模拟设备已注册：${deviceId}`);
  await loadDeviceCenter();
}

async function sendHeartbeat() {
  const deviceId = getSimDeviceId();
  await fetchJson("/device/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
  addDeviceLog("模拟设备心跳成功");
  await loadDeviceCenter();
}

async function testPush() {
  const deviceId = getSimDeviceId();
  await fetchJson("/device/test-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
  addDeviceLog("已发送测试推送事件");
  await loadDeviceCenter();
}

async function setHardwareVoiceCapture(enabled) {
  const result = await fetchJson("/device/voice/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  renderHardwareVoice(result.capture || {});
  addDeviceLog(enabled ? "硬件收音已开启" : "硬件收音已暂停");
  await loadDeviceCenter();
}

async function completeReminderFromDevice() {
  const reminderId = Number($("device-next-reminder")?.dataset?.reminderId || 0);
  if (!reminderId) return;
  await fetchJson("/device/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getSimDeviceId(), reminderId }),
  });
  addDeviceLog(`模拟设备完成提醒 #${reminderId}`);
  await loadDeviceCenter();
}

async function snoozeReminderFromDevice() {
  const reminderId = Number($("device-next-reminder")?.dataset?.reminderId || 0);
  if (!reminderId) return;
  await fetchJson("/device/snooze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getSimDeviceId(), reminderId, minutes: 10 }),
  });
  addDeviceLog(`模拟设备稍后提醒 #${reminderId} 10 分钟`);
  await loadDeviceCenter();
}

export function initDeviceView() {
  $("device-refresh")?.addEventListener("click", () => loadDeviceCenter().catch((err) => addDeviceLog(`刷新失败：${err.message}`)));
  $("device-copy-url")?.addEventListener("click", async () => {
    const text = $("device-access-url")?.textContent || "";
    try { await navigator.clipboard.writeText(text); addDeviceLog("接入地址已复制"); } catch { addDeviceLog("复制失败，请手动复制地址"); }
  });
  $("device-sim-register")?.addEventListener("click", () => registerSimDevice().catch((err) => addDeviceLog(`注册失败：${err.message}`)));
  $("device-sim-heartbeat")?.addEventListener("click", () => sendHeartbeat().catch((err) => addDeviceLog(`心跳失败：${err.message}`)));
  $("device-test-push")?.addEventListener("click", () => testPush().catch((err) => addDeviceLog(`测试推送失败：${err.message}`)));
  $("device-voice-enable")?.addEventListener("click", () => setHardwareVoiceCapture(true).catch((err) => addDeviceLog(`硬件收音开启失败：${err.message}`)));
  $("device-voice-disable")?.addEventListener("click", () => setHardwareVoiceCapture(false).catch((err) => addDeviceLog(`硬件收音暂停失败：${err.message}`)));
  $("device-next-refresh")?.addEventListener("click", () => loadDeviceCenter().catch((err) => addDeviceLog(`拉取提醒失败：${err.message}`)));
  $("device-complete-reminder")?.addEventListener("click", () => completeReminderFromDevice().catch((err) => addDeviceLog(`完成失败：${err.message}`)));
  $("device-snooze-reminder")?.addEventListener("click", () => snoozeReminderFromDevice().catch((err) => addDeviceLog(`稍后失败：${err.message}`)));
  window.addEventListener("nimo:device-changed", () => loadDeviceCenter().catch(() => {}));
  window.addEventListener("pulse:view-changed", (event) => {
    if (event.detail?.view === "device") loadDeviceCenter().catch((err) => addDeviceLog(`加载失败：${err.message}`));
  });
  loadDeviceCenter().catch(() => {});
}
