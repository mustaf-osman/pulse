import { apiUrl } from "./api-client.js";

let bar = null;
let mounted = false;
let hideTimer = null;
let lastSentAt = 0;

function ensureMounted() {
  if (mounted) return;
  const chatArea = document.getElementById("chat-area");
  if (!chatArea) return;
  const wrap = document.createElement("div");
  wrap.id = "pulse-thinking-bar";
  wrap.className = "pulse-thinking-bar";
  wrap.hidden = true;
  wrap.innerHTML = `
    <span class="pulse-thinking-spinner"></span>
    <span class="pulse-thinking-text" id="pulse-thinking-text">Pulse 正在思考…</span>
    <span class="pulse-thinking-elapsed" id="pulse-thinking-elapsed"></span>
    <button type="button" class="pulse-thinking-stop" id="pulse-thinking-stop" title="暂停意识循环">暂停</button>
  `;
  const chatHistory = document.getElementById("chat-history");
  if (chatHistory && chatHistory.parentNode === chatArea) {
    chatArea.insertBefore(wrap, chatHistory);
  } else {
    chatArea.insertBefore(wrap, chatArea.firstChild);
  }
  bar = wrap;
  document.getElementById("pulse-thinking-stop")?.addEventListener("click", onStop);
  mounted = true;
}

let elapsedTimer = null;
function startElapsed() {
  stopElapsed();
  const el = document.getElementById("pulse-thinking-elapsed");
  if (!el) return;
  el.textContent = "0.0s";
  const t0 = Date.now();
  elapsedTimer = setInterval(() => {
    el.textContent = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  }, 100);
}
function stopElapsed() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

function setText(text) {
  const el = document.getElementById("pulse-thinking-text");
  if (el) el.textContent = text;
}

export function showThinking(text = "Pulse 正在思考…") {
  ensureMounted();
  if (!bar) return;
  clearTimeout(hideTimer);
  bar.hidden = false;
  setText(text);
  startElapsed();
}

export function hideThinking() {
  if (!bar) return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    bar.hidden = true;
    stopElapsed();
  }, 200);
}

async function onStop() {
  try {
    await fetch(apiUrl(`/admin/stop`), { method: "POST", credentials: "same-origin" });
    setText("意识循环已暂停 · 可在设置中恢复");
    stopElapsed();
    setTimeout(hideThinking, 1500);
  } catch (e) {
    setText(`暂停失败：${e.message}`);
  }
}

/** SSE 事件入口 */
export function handleThinkingEvent(type, _data) {
  ensureMounted();
  switch (type) {
    case "message_received":
      lastSentAt = Date.now();
      showThinking("Pulse 正在思考… (L1)");
      break;
    case "stream_start":
      if (Date.now() - lastSentAt < 60000 || !bar?.hidden) {
        showThinking("Pulse 正在响应…");
      }
      break;
    case "stream_chunk":
      if (bar && !bar.hidden) setText("Pulse 正在响应…");
      break;
    case "tool_call":
      if (bar && !bar.hidden) setText("Pulse 正在调用工具…");
      break;
    case "injector_result":
      showThinking("Pulse 正在深度处理… (L2)");
      break;
    case "stream_end":
    case "response":
    case "message":
      hideThinking();
      break;
    case "error":
      setText("出错，请稍后重试");
      hideThinking();
      break;
    case "admin":
      // 暂停/启动后清理状态
      if (_data?.running === false) {
        setText("意识循环已暂停");
        setTimeout(hideThinking, 1200);
      }
      break;
    default:
      break;
  }
}

/** chat.js 发消息时调用，立刻显示思考态（不等 SSE） */
export function notifyUserSent() {
  ensureMounted();
  lastSentAt = Date.now();
  showThinking("Pulse 正在思考… (L1)");
}
