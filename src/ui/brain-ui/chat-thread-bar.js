// 多会话线程：与后端 /chat-threads、GET /conversations?thread_id= 配合
// UI：自定义下拉（thread-picker）+ 列表内 inline 改名 / 悬浮删除 / 顶部新建输入框

import { API } from "./api-client.js";

const STORAGE_THREAD = "pulse-active-thread-id";

function safeReadActive() {
  try { return localStorage.getItem(STORAGE_THREAD) || "main"; } catch { return "main"; }
}
function safeWriteActive(id) {
  try { localStorage.setItem(STORAGE_THREAD, id); } catch {}
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toast(text, kind = "info") {
  try {
    window.dispatchEvent(new CustomEvent("pulse:toast", { detail: { kind, text } }));
  } catch {}
}

export async function initChatThreadBar({ onThreadChanged } = {}) {
  const picker = document.getElementById("thread-picker");
  const toggleBtn = document.getElementById("thread-picker-toggle");
  const closeBtn = document.getElementById("thread-picker-close");
  const labelEl = document.getElementById("thread-picker-label");
  const popover = document.getElementById("thread-picker-popover");
  const listEl = document.getElementById("thread-list");
  const newForm = document.getElementById("thread-new-form");
  const newInput = document.getElementById("thread-new-input");
  const custFilter = document.getElementById("chat-thread-customer-filter");
  if (!picker || !toggleBtn || !listEl || !newForm || !newInput) return null;

  let threads = [];
  let customers = [];
  let activeId = safeReadActive();

  // ── 工具：取得"应该显示"的线程列表（按 custFilter 过滤；main 永远兜底） ──
  function visibleThreads() {
    const key = custFilter?.value || "";
    let list = threads;
    if (key) list = threads.filter((t) => String(t.customer_id || "") === key);
    if (!list.some((t) => t.id === "main")) {
      list = [{ id: "main", title: "主会话", customer_id: "" }, ...list];
    }
    return list;
  }

  function customerLabel(cid) {
    const c = customers.find((x) => String(x.id ?? "") === String(cid));
    return c ? String(c.name ?? c.label ?? cid).trim() : "";
  }

  function findThread(id) {
    return threads.find((t) => t.id === id) || (id === "main" ? { id: "main", title: "主会话", customer_id: "" } : null);
  }

  function isIndustryThread(id) {
    return /^industry_[a-z0-9_-]+$/i.test(String(id || ""));
  }

  function activeIndustryLabel() {
    const t = findThread(activeId);
    return isIndustryThread(activeId) ? String(t?.title || "").replace(/工作台$/, "").trim() : "";
  }

  function renderHeader() {
    const t = findThread(activeId);
    labelEl.textContent = t?.title || "主会话";
  }

  function renderList() {
    const list = visibleThreads();
    if (!list.length) {
      listEl.innerHTML = `<li class="thread-list-empty">没有会话</li>`;
      return;
    }
    const renderThread = (t) => {
      const isActive = t.id === activeId;
      const isMain = t.id === "main";
      const isIndustry = isIndustryThread(t.id);
      const cust = customerLabel(t.customer_id);
      return `
<li class="thread-item${isActive ? " is-active" : ""}${isIndustry ? " is-industry-thread" : ""}" data-id="${esc(t.id)}" role="option" aria-selected="${isActive}">
  <div class="thread-item-pick" data-action="pick" role="button" tabindex="0" title="切到此会话">
    <span class="thread-item-dot" aria-hidden="true"></span>
    <span class="thread-item-title" data-role="title">${esc(t.title || t.id)}</span>
    ${cust ? `<span class="thread-item-cust">· ${esc(cust)}</span>` : ""}
    ${isIndustry ? `<span class="thread-item-cust">· 行业默认</span>` : ""}
  </div>
  <span class="thread-item-actions">
    <button type="button" class="thread-icon-btn" data-action="rename" title="重命名" aria-label="重命名">✎</button>
    ${isMain || isIndustry ? "" : `<button type="button" class="thread-icon-btn thread-icon-danger" data-action="delete" title="删除会话" aria-label="删除会话">🗑</button>`}
  </span>
</li>`;
    };
    const industry = list.filter((t) => isIndustryThread(t.id));
    const regular = list.filter((t) => !isIndustryThread(t.id));
    const parts = [];
    if (industry.length) {
      parts.push(`<li class="thread-list-section">行业工作台</li>`);
      parts.push(...industry.map(renderThread));
    }
    if (regular.length) {
      parts.push(`<li class="thread-list-section">普通会话</li>`);
      parts.push(...regular.map(renderThread));
    }
    listEl.innerHTML = parts.join("");
  }

  function openPopover() {
    if (!popover.hidden) return;
    popover.hidden = false;
    toggleBtn.setAttribute("aria-expanded", "true");
    picker.classList.add("is-open");
    renderList();
    // 不主动 focus 输入框，避免抢键盘焦点；想新建时手动点输入框
  }

  function closePopover() {
    if (popover.hidden) return;
    popover.hidden = true;
    toggleBtn.setAttribute("aria-expanded", "false");
    picker.classList.remove("is-open");
    newInput.value = "";
    // 关闭时取消任何 inline 编辑
    listEl.querySelectorAll("[data-role='title'][contenteditable='true']").forEach((el) => {
      el.removeAttribute("contenteditable");
      el.textContent = el.dataset.originalText || el.textContent;
    });
  }

  function togglePopover() {
    if (popover.hidden) openPopover(); else closePopover();
  }

  // 切换到某个 thread
  function selectThread(id) {
    if (!id || id === activeId) { closePopover(); return; }
    activeId = id;
    safeWriteActive(id);
    renderHeader();
    renderList();
    onThreadChanged?.(id);
    closePopover();
  }

  async function ensureThread({ id, title, customer_id = "" } = {}) {
    const nextId = String(id || "").trim();
    if (!nextId) return activeId;
    if (!threads.some((t) => t.id === nextId)) {
      await fetchJson(`${API}/chat-threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: nextId, title: title || "新会话", customer_id }),
      });
      await refreshThreads({ keepSelection: true, skipNotify: true });
    }
    selectThread(nextId);
    return nextId;
  }

  async function refreshThreads({ keepSelection = true, skipNotify = false } = {}) {
    try {
      const rows = await fetchJson(`${API}/chat-threads`);
      threads = Array.isArray(rows) ? rows : [];
    } catch {
      threads = [];
    }
    if (!threads.some((t) => t.id === "main")) {
      threads.unshift({ id: "main", title: "主会话", customer_id: "" });
    }

    if (!keepSelection) activeId = safeReadActive();
    if (!threads.some((t) => t.id === activeId)) activeId = "main";

    safeWriteActive(activeId);
    renderHeader();
    if (!popover.hidden) renderList();
    // 调用方如果接下来要 selectThread，就别在这里先发一次 onThreadChanged，
    // 否则会出现"先切到旧 id → 再切到新 id"的 race condition
    if (!skipNotify) onThreadChanged?.(activeId);
  }

  async function loadCustomers() {
    if (!custFilter) return;
    try {
      // 后端 /customers 返回 { ok: true, customers: [...] }；
      // 兼容历史返回直接是数组的情况。
      const data = await fetchJson(`${API}/customers`);
      const rows = Array.isArray(data?.customers)
        ? data.customers
        : Array.isArray(data) ? data : [];
      if (!rows.length) {
        customers = [];
        return;
      }
      customers = rows;
      const v = custFilter.value;
      custFilter.innerHTML = `<option value="">全部客户</option>`;
      for (const c of rows) {
        const id = String(c.id ?? "").trim();
        const name = String(c.displayName ?? c.name ?? c.label ?? id).trim() || id;
        if (!id) continue;
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = name;
        custFilter.appendChild(opt);
      }
      if ([...custFilter.options].some((o) => o.value === v)) custFilter.value = v;
    } catch {}
  }

  // ─── 事件绑定 ──────────────────────────────────────────
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    togglePopover();
  });
  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    closePopover();
  });

  // 点列表项 / 改名 / 删除
  listEl.addEventListener("click", async (e) => {
    const li = e.target.closest(".thread-item");
    if (!li) return;
    const id = li.getAttribute("data-id");
    if (!id) return;
    // 任何一个 title 正处于 inline 编辑态时，整个列表都不允许 pick/del 等动作
    const editing = listEl.querySelector("[data-role='title'][contenteditable='true']");
    if (editing && editing.contains(e.target)) return;
    const actionBtn = e.target.closest("[data-action]");
    const action = actionBtn?.getAttribute("data-action");

    if (action === "pick") {
      if (editing) return;
      selectThread(id);
      return;
    }
    if (action === "rename") {
      e.stopPropagation();
      startInlineRename(li);
      return;
    }
    if (action === "delete") {
      e.stopPropagation();
      if (id === "main") return;
      if (isIndustryThread(id)) {
        toast("行业默认会话不能删除，可切换行业或新建普通会话。", "warn");
        return;
      }
      if (!window.confirm("确定删除这个会话？该会话下的对话记录也会一并删除。")) return;
      try {
        const res = await fetch(`${API}/chat-threads/${encodeURIComponent(id)}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "删除失败");
        const wasActive = activeId === id;
        if (wasActive) {
          activeId = "main";
          safeWriteActive("main");
          onThreadChanged?.("main");
        }
        // 删除完只需要刷列表，活跃会话切换已经手动通知过了
        await refreshThreads({ keepSelection: true, skipNotify: true });
        renderList();
        toast("会话已删除", "info");
      } catch (err) {
        console.warn("[thread] delete failed", err);
        toast(`删除失败：${err.message || "请稍后重试"}`, "warn");
      }
    }
  });

  // 双击标题 → inline 改名
  listEl.addEventListener("dblclick", (e) => {
    const li = e.target.closest(".thread-item");
    if (!li) return;
    const titleEl = e.target.closest("[data-role='title']");
    if (!titleEl) return;
    startInlineRename(li);
  });

  function startInlineRename(li) {
    const titleEl = li.querySelector("[data-role='title']");
    const id = li.getAttribute("data-id");
    if (!titleEl || !id) return;
    titleEl.dataset.originalText = titleEl.textContent;
    titleEl.setAttribute("contenteditable", "true");
    titleEl.focus();
    // 全选
    try {
      const range = document.createRange();
      range.selectNodeContents(titleEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
    const finish = async (commit) => {
      titleEl.removeEventListener("keydown", onKey);
      titleEl.removeEventListener("blur", onBlur);
      titleEl.removeAttribute("contenteditable");
      const next = titleEl.textContent.trim();
      const prev = titleEl.dataset.originalText || "";
      if (!commit || !next || next === prev) {
        titleEl.textContent = prev;
        return;
      }
      try {
        const res = await fetch(`${API}/chat-threads/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "改名失败");
        // 本地同步
        const t = threads.find((x) => x.id === id);
        if (t) t.title = next;
        if (id === activeId) renderHeader();
        toast("已重命名", "info");
      } catch (err) {
        console.warn("[thread] rename failed", err);
        titleEl.textContent = prev;
        toast(`改名失败：${err.message || "请稍后重试"}`, "warn");
      }
    };
    const onKey = (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    };
    const onBlur = () => finish(true);
    titleEl.addEventListener("keydown", onKey);
    titleEl.addEventListener("blur", onBlur);
  }

  // 新建会话
  newForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    let title = String(newInput.value || "").trim();
    const customer_id = String(custFilter?.value || "").trim();
    if (!title) {
      // 留空：自动取一个名（带客户名或时间戳）
      if (customer_id) {
        const name = customerLabel(customer_id);
        title = name ? `新会话 · ${name}` : "新会话";
      } else {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        const label = activeIndustryLabel();
        title = `${label ? `${label} · ` : ""}新会话 ${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
      }
    }
    try {
      const data = await fetchJson(`${API}/chat-threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, customer_id }),
      });
      const id = data?.id;
      if (!id) throw new Error("后端未返回 id");
      newInput.value = "";
      // 先刷列表，但抑制通知——避免和接下来的 selectThread 互相覆盖
      await refreshThreads({ keepSelection: true, skipNotify: true });
      selectThread(id);
      toast(`已创建会话「${title}」`, "info");
    } catch (err) {
      console.warn("[thread] create failed", err);
      toast(`新建会话失败：${err.message || "请稍后重试"}`, "warn");
    }
  });

  // popover 外点击关闭
  document.addEventListener("click", (e) => {
    if (popover.hidden) return;
    if (picker.contains(e.target)) return;
    closePopover();
  });

  // Esc 关闭
  window.addEventListener("keydown", (e) => {
    if (popover.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closePopover(); }
  });

  // 客户筛选变化 → 重渲列表（但不切当前会话）
  custFilter?.addEventListener("change", () => {
    if (!popover.hidden) renderList();
  });

  window.addEventListener("pulse:customers-changed", () => {
    loadCustomers().then(() => {
      if (!popover.hidden) renderList();
    });
  });
  window.addEventListener("pulse:industry-changed", () => {
    loadCustomers().then(() => {
      if (!popover.hidden) renderList();
    });
  });

  await refreshThreads({ keepSelection: true });
  await loadCustomers();
  renderHeader();

  return { refreshThreads, ensureThread, getActiveId: () => activeId };
}
