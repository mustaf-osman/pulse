import { createMarkdownBody } from "./markdown.js";

export function initChat({
  apiBase,
  maxHistory,
  activationWarmupKey,
  getAgentName,
  defaultInputPlaceholder,
  onUserMessage = null,
  getThreadId = null,
} = {}) {
  const chatHistory = document.getElementById("chat-history");
  const chatMessages = document.getElementById("chat-messages");
  const msgInput = document.getElementById("msg-input");
  const chatArea = document.getElementById("chat-area");
  const sendBtn = document.getElementById("send-btn");

  let inputLocked = false;
  let closeTimer = null;
  let hasPendingPulseMessage = false;
  let pendingMessageDismissed = false;
  let audioCtx = null;
  let audioUnlocked = false;
  let warmupTimer = null;

  function setComposerLocked(locked, reason = "") {
    inputLocked = locked;
    msgInput.disabled = locked;
    sendBtn.disabled = locked;
    msgInput.placeholder = locked ? (reason || "系统正在准备中…") : defaultInputPlaceholder();
  }

  function releaseWarmupLock() {
    if (warmupTimer) {
      clearTimeout(warmupTimer);
      warmupTimer = null;
    }
    try { sessionStorage.removeItem(activationWarmupKey); } catch {}
    setComposerLocked(false);
  }

  function applyActivationWarmupLock() {
    let until = 0;
    try {
      until = Number(sessionStorage.getItem(activationWarmupKey) || 0);
    } catch {}

    const remaining = until - Date.now();
    if (remaining <= 0) {
      releaseWarmupLock();
      return;
    }

    const seconds = Math.max(1, Math.ceil(remaining / 1000));
    setComposerLocked(true, `系统刚激活，正在准备模型…约 ${seconds}s`);
    if (warmupTimer) clearTimeout(warmupTimer);
    warmupTimer = setTimeout(releaseWarmupLock, remaining);
  }

  function isHoveringChat() {
    return chatArea.matches(":hover") || chatHistory.matches(":hover") || chatMessages.matches(":hover");
  }

  function ensureAudioContext() {
    if (!audioCtx) {
      if (!audioUnlocked) return null;  // 手势前不创建，避免 Chrome autoplay 警告
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      try { audioCtx = new AudioCtx(); } catch { return null; }
    }
    return audioCtx;
  }

  function unlockAudioOnFirstGesture() {
    const unlock = () => {
      if (audioUnlocked) return;
      audioUnlocked = true;
      // 首次手势后才创建/恢复 AudioContext，避免 Chrome autoplay 策略警告
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    window.addEventListener("touchstart", unlock, true);
  }

  async function playPulseAlert() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    try { if (ctx.state === "suspended") await ctx.resume(); } catch { return; }
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.28);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    master.connect(ctx.destination);

    const oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.setValueAtTime(740, now);
    oscA.frequency.exponentialRampToValueAtTime(880, now + 0.18);
    oscA.connect(master);

    const oscB = ctx.createOscillator();
    oscB.type = "triangle";
    oscB.frequency.setValueAtTime(1110, now + 0.12);
    oscB.frequency.exponentialRampToValueAtTime(1320, now + 0.34);
    oscB.connect(master);

    oscA.start(now); oscA.stop(now + 0.32);
    oscB.start(now + 0.12); oscB.stop(now + 0.5);

    oscA.addEventListener("ended", () => oscA.disconnect(), { once: true });
    oscB.addEventListener("ended", () => oscB.disconnect(), { once: true });
    setTimeout(() => master.disconnect(), 700);
  }

  function isTyping() {
    return document.activeElement === msgInput || msgInput.value.trim().length > 0;
  }

  function currentThreadId() {
    try {
      const t = getThreadId?.();
      const s = t != null ? String(t).trim() : "";
      return s || "main";
    } catch {
      return "main";
    }
  }

  function autosizeComposer() {
    if (!msgInput || msgInput.tagName !== "TEXTAREA") return;
    msgInput.style.height = "0px";
    const max = Math.min(180, Math.floor(window.innerHeight * 0.26));
    const min = 30;
    const next = Math.min(max, Math.max(min, msgInput.scrollHeight));
    msgInput.style.height = `${next}px`;
  }

  function humanizeSendError(raw) {
    const s = String(raw || "").trim();
    if (!s) return "这条消息没能发出去，原因不明。请稍后重试，或检查一下 Pulse 是否还在运行。";
    if (/quota_exceeded/i.test(s)) return "今日 AI 对话免费额度已用完。请联系管理员开通或续费后继续使用。";
    if (/feature_not_allowed/i.test(s)) return "当前账号未开通 AI 对话功能。请联系管理员开通权限。";
    if (/account_not_active|session_revoked|session_expired|session_not_found|invalid_token/i.test(s)) return "云端授权已失效，请重新登录后继续使用。";
    if (/Failed to fetch|NetworkError|network|fetch/i.test(s)) {
      return "连不上本地的 Pulse 服务。请确认应用没有关掉，防火墙也没有拦端口（默认 3721）。";
    }
    if (/\b400\b/i.test(s) || /content required/i.test(s)) return "这一条是空的，写几句话再发送就可以。";
    if (/\b401\b|\b403\b|Unauthorized/i.test(s)) return "密钥或权限没通过验证。请到「设置 → 模型 / API」重新填一下可用的 Key。";
    if (/429|限流|rate/i.test(s)) return "短时间内请求太多了，被对方限流。请歇几秒再问。";
    if (/\b5\d\d\b/.test(s)) return "远端模型服务开小差了（服务器 5xx）。可以换一家模型或过会儿再试。";
    const short = s.length > 120 ? `${s.slice(0, 120)}…` : s;
    return `没能发出：${short}`;
  }

  async function fetchChatHistory() {
    try {
      const tid = encodeURIComponent(currentThreadId());
      const res = await fetch(`${apiBase}/conversations?limit=${maxHistory}&thread_id=${tid}`);
      if (!res.ok) return [];
      const rows = await res.json();
      if (!Array.isArray(rows)) return [];
      return rows
        .filter(r => r && (r.role === "user" || r.role === "pulse") && typeof r.content === "string")
        .map(r => {
          if (r.role === "user" && r.from_id && r.from_id !== "ID:000001") {
            return { role: "external", text: r.content, label: r.from_id };
          }
          return { role: r.role, text: r.content };
        });
    } catch { return []; }
  }

  function openChat(autoClose = false) {
    chatHistory.classList.add("open");
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (autoClose && (!hasPendingPulseMessage || pendingMessageDismissed) && !isTyping()) scheduleClose(4500);
  }

  function closeChat() {
    if ((hasPendingPulseMessage && !pendingMessageDismissed) || isTyping() || isHoveringChat()) return;
    chatHistory.classList.remove("open");
  }

  function scheduleClose(ms = 100) {
    if ((hasPendingPulseMessage && !pendingMessageDismissed) || isTyping() || isHoveringChat()) return;
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(closeChat, ms);
  }

  function scrollChatToBottom() {
    if (!chatMessages) return;
    chatMessages.scrollTop = chatMessages.scrollHeight;
    requestAnimationFrame(() => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  function addMsg(role, text, options = {}) {
    const { alert = role === "pulse", pending = true, label } = options;
    const defaultLabel = role === "user" ? "You" : role === "pulse" ? getAgentName() : "Peer";
    const labelText = label || defaultLabel;
    const div = document.createElement("div");
    div.className = `msg msg-${role}`;
    const labelSpan = document.createElement("span");
    labelSpan.className = "msg-label";
    labelSpan.textContent = labelText;
    div.appendChild(labelSpan);
    div.appendChild(createMarkdownBody(text));
    chatMessages.appendChild(div);

    while (chatMessages.children.length > maxHistory) {
      chatMessages.removeChild(chatMessages.firstChild);
    }

    if (role === "pulse") {
      hasPendingPulseMessage = pending;
      pendingMessageDismissed = !pending;
      if (alert) playPulseAlert();
      if (pending) openChat();
    } else if (role === "user") {
      hasPendingPulseMessage = false;
      pendingMessageDismissed = false;
    }

    scrollChatToBottom();
  }

  function recentMessages(limit = 8) {
    return Array.from(chatMessages.querySelectorAll(".msg"))
      .slice(-Math.max(1, limit))
      .map((el) => ({
        role: el.classList.contains("msg-user") ? "user" : "pulse",
        text: (el.textContent || "").replace(/^(You|Pulse|PULSE|Peer)\s*/i, "").trim(),
      }))
      .filter((item) => item.text);
  }

  async function reloadThreadMessages() {
    chatMessages.innerHTML = "";
    hasPendingPulseMessage = false;
    pendingMessageDismissed = true;
    await restoreChatHistory();
    autosizeComposer();
    // 切换会话后主动把聊天区展开，让用户一眼看到"我已经切过来了"
    openChat();
    // 新会话或空会话补一个占位提示，避免看着像没反应
    if (!chatMessages.querySelector(".msg")) {
      const placeholder = document.createElement("div");
      placeholder.className = "chat-empty-placeholder";
      placeholder.textContent = "这是个新会话，直接在下方输入第一条消息开始聊吧。";
      chatMessages.appendChild(placeholder);
    }
  }

  async function restoreChatHistory() {
    const history = await fetchChatHistory();
    history.forEach(i => addMsg(i.role, i.text, { persist: false, alert: false, pending: false, label: i.label }));
    if (history.length) {
      pendingMessageDismissed = true;
      scrollChatToBottom();
    }
  }

  async function clearCurrentThread() {
    const tid = encodeURIComponent(currentThreadId());
    const res = await fetch(`${apiBase}/conversations?thread_id=${tid}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    chatMessages.innerHTML = "";
    hasPendingPulseMessage = false;
    pendingMessageDismissed = true;
    const placeholder = document.createElement("div");
    placeholder.className = "chat-empty-placeholder";
    placeholder.textContent = "聊天记录已清空。";
    chatMessages.appendChild(placeholder);
    openChat();
  }

  async function send({ channel = null, label = null } = {}) {
    if (inputLocked) return;
    const text = msgInput.value.trim();
    if (!text) return;
    msgInput.value = "";
    let consumed = false;
    // onUserMessage 返回字符串则用作后端 payload；返回 false 则不发后端
    const override = onUserMessage?.(text);
    addMsg("user", text, { label: label || undefined });
    openChat();
    scheduleClose(1000);
    if (override === false) return;

    try {
      await window.NewPulseCloudAuth?.consumeFeature?.("ai_chat", 1);
      consumed = true;
      const backendText = (typeof override === "string") ? override : text;
      const payload = { content: backendText, from_id: "ID:000001", thread_id: currentThreadId() };
      if (channel) payload.channel = channel;
      const resp = await fetch(`${apiBase}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        let message = `HTTP ${resp.status}`;
        try {
          const body = await resp.json();
          message = body.error || body.message || message;
        } catch {}
        throw new Error(message);
      }
    } catch (error) {
      console.warn("[send]", error.message);
      addMsg("pulse", humanizeSendError(error.message));
      if (!consumed) msgInput.value = text;
      openChat(true);
    }
  }

  chatArea.addEventListener("mouseenter", () => {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    openChat();
  });
  chatArea.addEventListener("mouseleave", () => scheduleClose());
  msgInput.addEventListener("focus", () => openChat());
  msgInput.addEventListener("blur", () => { if (!isTyping()) scheduleClose(); });
  msgInput.addEventListener("input", () => {
    autosizeComposer();
    if (isTyping()) openChat();
    else if (!hasPendingPulseMessage || pendingMessageDismissed) scheduleClose();
  });
  function insertNewlineAtCursor() {
    const start = msgInput.selectionStart ?? msgInput.value.length;
    const end = msgInput.selectionEnd ?? start;
    const before = msgInput.value.slice(0, start);
    const after = msgInput.value.slice(end);
    msgInput.value = `${before}\n${after}`;
    const caret = start + 1;
    try { msgInput.setSelectionRange(caret, caret); } catch {}
    autosizeComposer();
  }

  msgInput.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    if (event.isComposing || event.keyCode === 229) return; // 中文输入法候选中按 Enter 不发送
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/⌘ + Enter → 主动换行（textarea 默认 Ctrl+Enter 不插入换行，需手动写）
      event.preventDefault();
      insertNewlineAtCursor();
      return;
    }
    if (event.shiftKey || event.altKey) return; // Shift/Alt+Enter 走默认换行
    event.preventDefault();
    send();
  });
  sendBtn.addEventListener("click", send);

  autosizeComposer();
  document.addEventListener("pointerdown", event => {
    if (chatArea.contains(event.target)) return;
    if (hasPendingPulseMessage && !isTyping()) {
      pendingMessageDismissed = true;
      closeChat();
      return;
    }
    if (!isTyping()) {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      chatHistory.classList.remove("open");
    }
  });

  return {
    addMsg,
    applyActivationWarmupLock,
    clearCurrentThread,
    isComposerLocked: () => inputLocked,
    isTyping,
    openChat,
    recentMessages,
    reloadThreadMessages,
    restoreChatHistory,
    send,
    unlockAudioOnFirstGesture,
  };
}
