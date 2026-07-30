import { apiUrl } from "./api-client.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let overlay = null;
let bodyEl = null;
let mounted = false;

function ensureDom() {
  if (mounted) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="pulse-persona-overlay" class="pulse-mm-overlay" hidden>
  <div class="pulse-mm-backdrop" data-pp-close="1" tabindex="-1"></div>
  <div class="pulse-mm-modal pulse-persona-modal" role="dialog" aria-modal="true" aria-label="Pulse 对我的认识">
    <header class="pulse-mm-head">
      <span class="pulse-mm-title">Pulse 对我的认识</span>
      <div class="pulse-persona-head-actions">
        <button type="button" class="pulse-mm-btn" id="pulse-persona-refresh">刷新</button>
        <button type="button" class="pulse-mm-close" id="pulse-persona-close" aria-label="关闭">×</button>
      </div>
    </header>
    <div class="pulse-persona-body" id="pulse-persona-body"></div>
  </div>
</div>`
  );
  overlay = document.getElementById("pulse-persona-overlay");
  bodyEl = document.getElementById("pulse-persona-body");
  overlay.querySelector(".pulse-mm-backdrop")?.addEventListener("click", close);
  document.getElementById("pulse-persona-close")?.addEventListener("click", close);
  document.getElementById("pulse-persona-refresh")?.addEventListener("click", load);
  bodyEl.addEventListener("click", onBodyClick);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && !overlay.hidden) close();
  });
  mounted = true;
}

function close() {
  if (overlay) overlay.hidden = true;
}

function categorize(rows) {
  const buckets = {
    person: [],
    fact: [],
    knowledge: [],
    other: [],
  };
  for (const r of rows) {
    const t = r.event_type;
    if (t === "person") buckets.person.push(r);
    else if (t === "fact") buckets.fact.push(r);
    else if (t === "knowledge" || t === "concept") buckets.knowledge.push(r);
    else buckets.other.push(r);
  }
  return buckets;
}

function renderRow(r) {
  const title = r.title ? esc(r.title) : "";
  const content = esc(String(r.content || "").slice(0, 240));
  const more = String(r.content || "").length > 240 ? "…" : "";
  const meta = [r.event_type, r.mem_id].filter(Boolean).join(" · ");
  return `<article class="pulse-persona-item" data-id="${r.id}">
    <div class="pulse-persona-item-meta">${esc(meta)}</div>
    ${title ? `<div class="pulse-persona-item-title">${title}</div>` : ""}
    <div class="pulse-persona-item-content" id="pulse-persona-content-${r.id}">${content}${more}</div>
    <div class="pulse-persona-item-actions">
      <button type="button" class="pulse-mm-btn ghost" data-pp-edit="${r.id}">编辑</button>
      <button type="button" class="pulse-mm-btn danger" data-pp-delete="${r.id}">删除</button>
    </div>
    <div class="pulse-persona-edit" id="pulse-persona-edit-${r.id}" hidden>
      <textarea class="pulse-mm-ta" data-field="content" rows="3">${esc(r.content || "")}</textarea>
      <div class="pulse-mm-edit-actions">
        <button type="button" class="pulse-mm-btn ghost" data-pp-cancel="${r.id}">取消</button>
        <button type="button" class="pulse-mm-btn primary" data-pp-save="${r.id}">保存</button>
      </div>
    </div>
  </article>`;
}

function render(data) {
  if (!bodyEl) return;
  if (!data || (!data.root && (!data.children || data.children.length === 0))) {
    bodyEl.innerHTML = `<div class="pulse-persona-empty">
      <h3>Pulse 还在认识你…</h3>
      <p>多和它聊几轮，或在「记忆」里手动新建一条关于自己的记忆（类型选「人物」），它就会把这里填满。</p>
    </div>`;
    return;
  }
  const buckets = categorize(data.children || []);
  const rootBlock = data.root
    ? `<section class="pulse-persona-root">
        <div class="pulse-persona-root-label">根记忆 · ${esc(data.root.mem_id || "")}</div>
        <div class="pulse-persona-root-content" id="pulse-persona-content-${data.root.id}">${esc(data.root.content || "")}</div>
        <div class="pulse-persona-item-actions">
          <button type="button" class="pulse-mm-btn ghost" data-pp-edit="${data.root.id}">编辑</button>
        </div>
        <div class="pulse-persona-edit" id="pulse-persona-edit-${data.root.id}" hidden>
          <textarea class="pulse-mm-ta" data-field="content" rows="4">${esc(data.root.content || "")}</textarea>
          <div class="pulse-mm-edit-actions">
            <button type="button" class="pulse-mm-btn ghost" data-pp-cancel="${data.root.id}">取消</button>
            <button type="button" class="pulse-mm-btn primary" data-pp-save="${data.root.id}">保存</button>
          </div>
        </div>
      </section>`
    : `<section class="pulse-persona-root pulse-persona-root-missing">
        <div class="pulse-persona-root-label">尚无根记忆 person_000001</div>
        <div class="pulse-persona-root-content">在「记忆」面板里新建一条人物类型的记忆，mem_id 填 person_000001，即可成为根。</div>
      </section>`;

  const section = (title, rows) =>
    rows.length === 0
      ? ""
      : `<section class="pulse-persona-section">
          <div class="pulse-persona-section-title">${esc(title)} <span class="pulse-persona-section-count">${rows.length}</span></div>
          <div class="pulse-persona-list">${rows.map(renderRow).join("")}</div>
        </section>`;

  bodyEl.innerHTML = [
    rootBlock,
    section("人物特征", buckets.person),
    section("事实 / 偏好", buckets.fact),
    section("知识 / 方法", buckets.knowledge),
    section("其他", buckets.other),
  ].join("");
}

async function load() {
  ensureDom();
  if (!bodyEl) return;
  bodyEl.innerHTML = `<div class="pulse-mm-loading">加载中…</div>`;
  try {
    const r = await fetch(apiUrl(`/persona`), { credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    render(data);
  } catch (e) {
    bodyEl.innerHTML = `<div class="pulse-mm-error">加载失败：${esc(e.message)}</div>`;
  }
}

async function onBodyClick(e) {
  const editBtn = e.target.closest("[data-pp-edit]");
  if (editBtn) {
    const id = editBtn.getAttribute("data-pp-edit");
    const box = document.getElementById(`pulse-persona-edit-${id}`);
    if (box) box.hidden = !box.hidden;
    return;
  }
  const cancelBtn = e.target.closest("[data-pp-cancel]");
  if (cancelBtn) {
    const id = cancelBtn.getAttribute("data-pp-cancel");
    const box = document.getElementById(`pulse-persona-edit-${id}`);
    if (box) box.hidden = true;
    return;
  }
  const saveBtn = e.target.closest("[data-pp-save]");
  if (saveBtn) {
    const id = saveBtn.getAttribute("data-pp-save");
    const box = document.getElementById(`pulse-persona-edit-${id}`);
    if (!box) return;
    const content = box.querySelector('[data-field="content"]')?.value ?? "";
    try {
      const r = await fetch(apiUrl(`/memories/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ content }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      box.hidden = true;
      await load();
      window.dispatchEvent(new CustomEvent("pulse:memories-changed"));
    } catch (err) {
      alert(`保存失败：${err.message}`);
    }
    return;
  }
  const delBtn = e.target.closest("[data-pp-delete]");
  if (delBtn) {
    const id = delBtn.getAttribute("data-pp-delete");
    if (!confirm("确定删除这条画像记忆？")) return;
    try {
      const r = await fetch(apiUrl(`/memories/${id}`), { method: "DELETE", credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
      window.dispatchEvent(new CustomEvent("pulse:memories-changed"));
    } catch (err) {
      alert(`删除失败：${err.message}`);
    }
  }
}

export function openPersona() {
  // 「Pulse 对我的认识」已合并进记忆视图：直接跳过去，不再弹独立浮层
  if (typeof window !== "undefined" && typeof window.pulseSetView === "function") {
    window.dispatchEvent(new CustomEvent("pulse:open-memory-manager"));
    return;
  }
  // 兜底：旧逻辑（pulseSetView 还没就绪时）
  ensureDom();
  overlay.hidden = false;
  load();
}

export function initPersonaCard() {
  // 不再预创建浮层 DOM，避免被记忆视图样式波及
  // 顶栏头像入口 → 跳转记忆视图
  document.querySelectorAll("#pulse-app-bar .nb-user").forEach((el) => {
    el.style.cursor = "pointer";
    el.title = "查看 AI 对你的认识（在记忆库）";
    el.addEventListener("click", openPersona);
  });
  window.addEventListener("pulse:open-persona", openPersona);
}
