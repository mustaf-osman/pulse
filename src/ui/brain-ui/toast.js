/**
 * 通用 toast 系统（右下角）
 *   - showInfo / showWarn / showError 三种级别
 *   - showMemoryWrittenToast 兼容旧入口（在 memory-manager 中也有别名）
 *   - translateError 把技术报错翻译成人话
 */

let hostCreated = false;
let toastSeq = 0;

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureHost() {
  if (hostCreated) return;
  hostCreated = true;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="pulse-toast-host" class="pulse-toast-host" aria-live="polite"></div>`
  );
}

function pushToast({ level = "info", title, lines = [], moreText = "", ttl = 6500 }) {
  ensureHost();
  const host = document.getElementById("pulse-toast-host");
  if (!host) return null;
  const id = `pulse-toast-${++toastSeq}`;
  host.insertAdjacentHTML(
    "beforeend",
    `<div class="pulse-toast pulse-toast--${level}" id="${id}" role="status">
      <div class="pulse-toast-title">${esc(title)}</div>
      ${lines.map((t) => `<div class="pulse-toast-line">${esc(t)}</div>`).join("")}
      ${moreText ? `<div class="pulse-toast-more">${esc(moreText)}</div>` : ""}
    </div>`
  );
  const el = document.getElementById(id);
  const remove = () => {
    try { el?.remove(); } catch { /* ignore */ }
  };
  el?.addEventListener("click", remove);
  if (ttl > 0) setTimeout(remove, ttl);
  return id;
}

export function showInfo(title, lines = [], ttl = 5000) {
  return pushToast({ level: "info", title, lines: Array.isArray(lines) ? lines : [String(lines)], ttl });
}

export function showWarn(title, lines = [], ttl = 7000) {
  return pushToast({ level: "warn", title, lines: Array.isArray(lines) ? lines : [String(lines)], ttl });
}

export function showError(title, lines = [], ttl = 9000) {
  return pushToast({ level: "error", title, lines: Array.isArray(lines) ? lines : [String(lines)], ttl });
}

/** 把后端 SSE 的 error.data.error 字符串翻译成人话 */
export function translateError(raw) {
  const msg = String(raw || "").trim();
  if (!msg) return "未知错误";

  // DeepSeek thinking 与 reasoning_effort 冲突
  if (/thinking.*disabled.*reasoning_effort|reasoning_effort.*thinking/i.test(msg)) {
    return "当前模型不支持在禁用思考时设置 reasoning_effort，已自动降级重试";
  }
  // 429 rate limit
  if (/\b429\b|rate.?limit|too many requests/i.test(msg)) {
    return "API 请求过快被限流，稍后将自动重试（或在用量面板查看占用）";
  }
  // 余额/账户问题
  if (/insufficient.*balance|insufficient.*quota|payment required|402/i.test(msg)) {
    return "账户余额不足或配额耗尽，请检查 API Key 对应账户";
  }
  // 401 鉴权
  if (/\b401\b|unauthorized|invalid.*api.?key/i.test(msg)) {
    return "API Key 无效或已过期，请在设置中重新激活";
  }
  // 404 模型
  if (/model.*not.*found|404.*model|invalid.*model/i.test(msg)) {
    return "模型不存在或对当前账户不可用，请在设置中切换模型";
  }
  // 网络
  if (/timeout|timed out|fetch failed|network|ECONN|EAI_AGAIN|socket hang up/i.test(msg)) {
    return "网络不稳定或连接超时，已尝试重试";
  }
  // LLM busy
  if (/server.*busy|please.*retry|service.*unavailable|503/i.test(msg)) {
    return "上游 LLM 服务繁忙，已尝试重试";
  }
  // context length
  if (/context.*length|maximum.*tokens|too.*long/i.test(msg)) {
    return "上下文超出模型最大长度，请尝试清理记忆或缩短对话";
  }
  // 400 通用
  if (/^4\d\d|\b400\b|bad request/i.test(msg)) {
    return `请求被服务端拒绝：${msg.slice(0, 120)}`;
  }
  return msg.slice(0, 200);
}

/** 兼容旧入口：识别器写入记忆后的提示 */
export function showMemoryWrittenToast(data) {
  if (!Array.isArray(data?.memories) || data.memories.length === 0) return;
  const lines = data.memories.slice(0, 3).map((m) => {
    const label = m.action === "updated" ? "更新" : "新建";
    const head = m.title || m.content || m.mem_id || "记忆";
    const short = String(head).slice(0, 72);
    return `${label}：${short}${String(head).length > 72 ? "…" : ""}`;
  });
  const more = data.memories.length > 3 ? `还有 ${data.memories.length - 3} 条…` : "";
  pushToast({ level: "info", title: "已记住", lines, moreText: more, ttl: 6500 });
}

/** SSE 事件入口：app.js 调用 */
let lastErrorAt = 0;
let lastErrorMsg = "";
export function handleErrorEvent(type, data) {
  if (type === "llm_retry") {
    const reason = data?.reason === "config_strip"
      ? "配置不兼容，已自动剥离冲突字段重试"
      : `自动重试中（${data?.attempt || 1}/${data?.maxAttempts || "?"}）`;
    showInfo("已自动重试", [reason], 4000);
    return;
  }
  if (type === "error") {
    const raw = String(data?.error || data?.message || "").trim();
    if (!raw) return;
    // 去抖：相同错误 4s 内不重复弹
    const now = Date.now();
    if (raw === lastErrorMsg && now - lastErrorAt < 4000) return;
    lastErrorMsg = raw;
    lastErrorAt = now;
    const friendly = translateError(raw);
    showError("出错了", [friendly], 9000);
    return;
  }
  if (type === "rate_limited" || type === "protocol_violation") {
    showWarn("注意", [translateError(data?.message || type)], 6000);
  }
}
