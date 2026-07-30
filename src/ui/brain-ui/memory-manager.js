import { apiUrl } from "./api-client.js";
import { syncCompanyMemory } from "./company-sync.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setNavActive(navKey) {
  document.querySelectorAll("#pulse-app-bar .nb-nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.nav === navKey);
  });
}

// ── 记忆类型分组（用户视角） ─────────────────────────────────────────
const GROUPS = [
  {
    key: "about_me",
    label: "关于我",
    desc: "Nimo 记住的关于你的习惯、偏好、约束、人物关系和重要事实",
    types: ["person", "fact", "self_constraint"],
    showByDefault: true,
  },
  {
    key: "knowledge",
    label: "知识",
    desc: "Nimo 从文档、对话和手动补充中沉淀的方法、概念、技能和文章摘要",
    types: ["knowledge", "concept", "article", "skill"],
    showByDefault: true,
  },
  {
    key: "object",
    label: "物体",
    desc: "Nimo 记住的具体物品、设备、资源或实体",
    types: ["object"],
    showByDefault: true,
  },
  {
    key: "system",
    label: "系统档案",
    desc: "心跳、自检结果等系统副产物，对客户演示和日常使用通常不重要。",
    types: ["hotspot_event", "system", "tick", "task_complete", "system_shadow"],
    showByDefault: false,
    hiddenInDemo: true,
  },
];

const TYPE_LABELS = {
  person: "人物",
  fact: "偏好",
  self_constraint: "原则",
  knowledge: "知识",
  concept: "概念",
  article: "文章",
  skill: "技能",
  object: "物体",
  hotspot_event: "热点曝光",
  system: "系统",
  tick: "心跳",
  task_complete: "已完成任务",
  system_shadow: "系统档案",
};

const TYPE_COLORS = {
  person: "var(--mm-color-person, #2563eb)",
  fact: "var(--mm-color-fact, #16a34a)",
  knowledge: "var(--mm-color-knowledge, #7c3aed)",
  concept: "var(--mm-color-knowledge, #7c3aed)",
  article: "var(--mm-color-article, #0891b2)",
  object: "var(--mm-color-object, #d97706)",
  hotspot_event: "var(--mm-color-system, #9aa3ad)",
  system: "var(--mm-color-system, #9aa3ad)",
  tick: "var(--mm-color-system, #9aa3ad)",
  task_complete: "var(--mm-color-system, #9aa3ad)",
  system_shadow: "var(--mm-color-system, #9aa3ad)",
};

function groupOf(type) {
  for (const g of GROUPS) if (g.types.includes(type)) return g.key;
  return "knowledge";
}

const SYSTEM_TERM_PATTERNS = [
  /\btick\b/i,
  /\bl1\b/i,
  /\bl2\b/i,
  /system core/i,
  /startup self-check/i,
  /injector/i,
  /tool[_\s-]?call/i,
  /识别器|注入器|系统核心架构|自检|心跳|协议兜底|启动自检|流程心跳/,
];

function isSystemShadow(row) {
  if (!row) return false;
  const text = [
    row.title,
    row.content,
    row.detail,
    row.mem_id,
    row.source_ref,
  ]
    .filter(Boolean)
    .join(" ");
  return SYSTEM_TERM_PATTERNS.some((re) => re.test(text));
}

function effectiveType(row) {
  if (!row) return "";
  const nativeType = String(row.event_type || "");
  if (["hotspot_event", "system", "tick", "task_complete"].includes(nativeType)) return nativeType;
  if (isSystemShadow(row)) return "system_shadow";
  return nativeType;
}

function rowInGroup(row, group) {
  return group.types.includes(effectiveType(row));
}

// ── 文本清洗：把系统模板剥离，呈现给用户的"人话" ─────────────────────
function cleanContent(row) {
  let txt = String(row.content || "").trim();
  // "The user mentioned a recent hotspot: 汶川地震18周年" → 取冒号后内容
  const mentionMatch = txt.match(/^The user mentioned a recent hotspot:\s*(.+)$/i);
  if (mentionMatch) return mentionMatch[1].trim();
  return txt;
}

function cleanTitle(row) {
  let title = String(row.title || "").trim();
  if (!title) return "";
  // "Hotspot event: XYZ" → "XYZ"
  return title.replace(/^Hotspot event:\s*/i, "").trim();
}

function relativeTime(row) {
  const raw = row.timestamp || row.created_at;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

// 隐藏 detail 里只对开发者有意义的行
function cleanDetail(detail) {
  if (!detail) return "";
  const text = String(detail).trim();
  if (!text) return "";
  // 系统说明、Trigger 信息直接过滤
  const lines = text.split(/\r?\n/).filter((line) => {
    const l = line.trim();
    if (!l) return false;
    if (/^This is an automatically archived/i.test(l)) return false;
    if (/^Trigger message excerpt:/i.test(l)) return false;
    if (/^Fetched at:/i.test(l)) return false;
    return true;
  });
  return lines.join("\n").trim();
}

export function initMemoryManager() {
  let overlay;
  let listEl;
  let searchInput;
  let scopeSelect;
  let searchTimer;
  let currentGroup = "about_me";
  let currentScope = "current";
  let activeIndustry = null;
  let cachedRows = [];

  function ensureDom() {
    if (document.getElementById("pulse-memory-overlay")) {
      overlay = document.getElementById("pulse-memory-overlay");
      listEl = document.getElementById("pulse-mm-list");
      searchInput = document.getElementById("pulse-mm-search");
      scopeSelect = document.getElementById("pulse-mm-scope");
      return;
    }
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="pulse-memory-overlay" class="pulse-mm-overlay" hidden>
  <div class="pulse-mm-backdrop" data-mm-close="1" tabindex="-1"></div>
  <div class="pulse-mm-modal" role="dialog" aria-modal="true" aria-label="记忆管理">
    <header class="pulse-mm-head">
      <div>
        <div class="pulse-mm-title">Nimo 记忆中心</div>
        <div class="pulse-mm-subtitle" id="pulse-mm-subtitle"></div>
      </div>
      <button type="button" class="pulse-mm-close" id="pulse-mm-close" aria-label="关闭">×</button>
    </header>

    <div class="pulse-mm-tabs" id="pulse-mm-tabs">
      ${GROUPS.filter((g) => !g.hiddenInDemo).map((g, i) => `<button type="button" class="pulse-mm-tab${i === 0 ? " active" : ""}" data-group="${g.key}">
        ${g.label}
        <span class="pulse-mm-tab-count" id="pulse-mm-count-${g.key}"></span>
      </button>`).join("")}
    </div>

    <div class="pulse-mm-toolbar">
      <input type="search" class="pulse-mm-search" id="pulse-mm-search" placeholder="搜索内容或关键词…" autocomplete="off">
      <select class="pulse-mm-select pulse-mm-scope-select" id="pulse-mm-scope" title="按行业范围筛选记忆">
        <option value="current">当前行业 + 全局</option>
        <option value="industry">仅当前行业</option>
        <option value="global">仅全局</option>
        <option value="all">全部行业</option>
      </select>
      <button type="button" class="pulse-mm-btn primary" id="pulse-mm-new" title="手动添加一条长期记忆">
        <span class="pulse-mm-new-spark" aria-hidden="true">＋</span>
        <span data-mm-new-label>添加记忆</span>
      </button>
      <button type="button" class="pulse-mm-btn" id="pulse-mm-export" title="导出当前分组为 JSON">导出</button>
      <button type="button" class="pulse-mm-btn danger" id="pulse-mm-clean" hidden>清空本组</button>
      <button type="button" class="pulse-mm-btn" id="pulse-mm-refresh">刷新</button>
    </div>

    <div class="pulse-mm-new pulse-mm-wizard" id="pulse-mm-new-form" hidden>
      <div class="pulse-mm-wizard-head">
        <div class="pulse-mm-wizard-title">让 Nimo 记住一件事</div>
        <div class="pulse-mm-wizard-sub">按下面 3 个问题填，Nimo 会把它变成长期记忆，后续提醒、陪读和聊天都会用到</div>
      </div>

      <div class="pulse-mm-qa-block">
        <div class="pulse-mm-qa-step">01</div>
        <div class="pulse-mm-qa-q">想让 Nimo 记住什么类型的信息？</div>
        <select class="pulse-mm-select pulse-mm-qa-control" id="pulse-mm-new-type">
          <option value="fact">偏好 / 事实 · 你的喜好、约束、反感、动机</option>
          <option value="person">人物 · 客户 / 同事 / 上司的信息</option>
          <option value="knowledge">知识 · 行业知识 / 流程 / 业务规则</option>
          <option value="article">文章 · 摘要 / 新闻 / 资讯</option>
          <option value="object">物体 · 产品 / 物品 / 资源</option>
        </select>
      </div>

      <div class="pulse-mm-qa-block">
        <div class="pulse-mm-qa-step">02</div>
        <div class="pulse-mm-qa-q">具体是什么内容？</div>
        <div class="pulse-mm-qa-hint">用一两句话说清楚就行，Nimo 会按这段内容索引和回忆</div>
        <textarea class="pulse-mm-ta pulse-mm-qa-control" id="pulse-mm-new-content" rows="4" placeholder="比如：我喜欢简洁不啰嗦的提醒方式；或：我最近重点在看技术封锁这篇论文，希望后续围绕它继续陪读"></textarea>
      </div>

      <div class="pulse-mm-qa-block">
        <div class="pulse-mm-qa-step">03</div>
        <div class="pulse-mm-qa-q">给它起个名字方便检索？<span class="pulse-mm-qa-optional">（可选）</span></div>
        <input type="text" class="pulse-mm-input pulse-mm-qa-control" id="pulse-mm-new-title" placeholder="一句话标题，比如：偏好 / 产品风格">
      </div>

      <div class="pulse-mm-edit-actions">
        <button type="button" class="pulse-mm-btn ghost" id="pulse-mm-new-cancel">取消</button>
        <button type="button" class="pulse-mm-btn primary" id="pulse-mm-new-save">存入记忆库</button>
      </div>
    </div>

    <div class="pulse-mm-list-head">
      <strong>已记住的内容</strong>
      <span>点击「详情」查看完整内容，点击「添加记忆」才会展开新增表单。</span>
    </div>
    <div class="pulse-mm-list" id="pulse-mm-list"></div>
  </div>
</div>`
    );
    overlay = document.getElementById("pulse-memory-overlay");
    listEl = document.getElementById("pulse-mm-list");
    searchInput = document.getElementById("pulse-mm-search");
    scopeSelect = document.getElementById("pulse-mm-scope");
    if (scopeSelect) scopeSelect.value = currentScope;

    document.getElementById("pulse-mm-close")?.addEventListener("click", close);
    overlay.querySelector(".pulse-mm-backdrop")?.addEventListener("click", close);
    document.getElementById("pulse-mm-refresh")?.addEventListener("click", () => refresh());
    document.getElementById("pulse-mm-export")?.addEventListener("click", exportRows);
    document.getElementById("pulse-mm-new")?.addEventListener("click", toggleNewForm);
    document.getElementById("pulse-mm-new-cancel")?.addEventListener("click", () => toggleNewForm(false));
    document.getElementById("pulse-mm-new-save")?.addEventListener("click", submitNewMemory);
    document.getElementById("pulse-mm-clean")?.addEventListener("click", cleanCurrentGroup);

    document.getElementById("pulse-mm-tabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-group]");
      if (!btn) return;
      currentGroup = btn.getAttribute("data-group");
      overlay.querySelectorAll(".pulse-mm-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderForCurrent();
    });

    searchInput?.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => refresh(), 280);
    });
    scopeSelect?.addEventListener("change", () => {
      currentScope = scopeSelect.value || "current";
      refresh();
    });

    listEl?.addEventListener("click", onListClick);
  }

  async function loadIndustryForMemoryScope() {
    try {
      const r = await fetch(apiUrl("/industry"), { credentials: "same-origin" });
      const data = await r.json();
      activeIndustry = data?.activePack
        ? { id: data.activePack.id || "", name: data.activePack.name || "", icon: data.activePack.icon || "" }
        : null;
    } catch {
      activeIndustry = null;
    }
  }

  function parseTags(row) {
    const raw = row?.tags;
    if (Array.isArray(raw)) return raw.map(String);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return String(raw).split(/[,\s]+/).filter(Boolean);
    }
  }

  function industryTag(row) {
    return parseTags(row).find((tag) => /^industry:[\w-]+$/i.test(tag)) || "";
  }

  function memoryScopeLabel(row) {
    const tag = industryTag(row);
    if (!tag) return "全局";
    const id = tag.slice("industry:".length);
    if (activeIndustry?.id === id && activeIndustry?.name) return `行业：${activeIndustry.name}`;
    return `行业：${id}`;
  }

  function close() {
    // 统一交给 setActiveView 处理 hidden / display / nav 高亮
    if (typeof window !== "undefined" && typeof window.pulseSetView === "function") {
      window.pulseSetView("chat");
    } else if (overlay) {
      overlay.hidden = true;
    }
  }

  function toggleNewForm(force) {
    const form = document.getElementById("pulse-mm-new-form");
    if (!form) return;
    form.hidden = typeof force === "boolean" ? !force : !form.hidden;
    const button = document.getElementById("pulse-mm-new");
    const label = button?.querySelector("[data-mm-new-label]");
    if (label) label.textContent = form.hidden ? "添加记忆" : "收起添加";
    if (!form.hidden) document.getElementById("pulse-mm-new-content")?.focus();
  }

  async function submitNewMemory() {
    const event_type = document.getElementById("pulse-mm-new-type")?.value || "fact";
    const title = document.getElementById("pulse-mm-new-title")?.value || "";
    const content = (document.getElementById("pulse-mm-new-content")?.value || "").trim();
    if (!content) { alert("正文不能为空"); return; }
    try {
      const r = await fetch(apiUrl(`/memories`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          event_type,
          title,
          content,
          tags: currentScope === "global" ? [] : (activeIndustry?.id ? [`industry:${activeIndustry.id}`] : []),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) throw new Error(data.error || `HTTP ${r.status}`);
      ["pulse-mm-new-title", "pulse-mm-new-content"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      toggleNewForm(false);
      // 切到对应分组
      currentGroup = groupOf(event_type);
      overlay.querySelectorAll(".pulse-mm-tab").forEach((b) =>
        b.classList.toggle("active", b.getAttribute("data-group") === currentGroup)
      );
      await refresh();
      window.dispatchEvent(new CustomEvent("pulse:memories-changed"));
      syncCompanyMemory({
        title,
        content,
        sourceType: event_type,
        tags: currentScope === "global" ? [] : (activeIndustry?.id ? [`industry:${activeIndustry.id}`] : []),
      }).catch(() => {});
    } catch (err) {
      alert(`新建失败：${err.message}`);
    }
  }

  async function cleanCurrentGroup() {
    const group = GROUPS.find((g) => g.key === currentGroup);
    if (!group || group.key !== "system") return;
    if (!confirm("确定清空所有「系统档案」吗？这些是热点曝光、自检结果等系统副产物，不影响关于你的真正记忆。")) return;
    let totalDeleted = 0;
    const removableTypes = ["hotspot_event", "system", "tick", "task_complete"];
    for (const t of removableTypes) {
      try {
        const r = await fetch(apiUrl(`/memories/by-type/${encodeURIComponent(t)}`), {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          totalDeleted += Number(d.deleted || 0);
        }
      } catch { /* ignore */ }
    }
    await refresh();
    window.dispatchEvent(new CustomEvent("pulse:memories-changed"));
    alert(`已清空 ${totalDeleted} 条系统档案`);
  }

  function exportRows() {
    const rows = filteredRows();
    if (!rows.length) { alert("当前分组为空"); return; }
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    a.download = `pulse-memories-${currentGroup}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function filteredRows() {
    const group = GROUPS.find((g) => g.key === currentGroup) || GROUPS[0];
    return cachedRows.filter((r) => rowInGroup(r, group));
  }

  function updateCounts() {
    const byGroup = {};
    for (const g of GROUPS) {
      const n = cachedRows.filter((r) => rowInGroup(r, g)).length;
      byGroup[g.key] = n;
      const el = document.getElementById(`pulse-mm-count-${g.key}`);
      if (el) el.textContent = n ? n : "";
    }
    // hero stats（全屏页头部摘要）—— 只统计非系统档案的"有效"记忆
    const total = cachedRows.length;
    const meaningful = total - (byGroup.system || 0);
    const setStat = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val ?? 0);
    };
    setStat("mm-stat-total", meaningful);
    setStat("mm-stat-about", byGroup.about_me || 0);
    setStat("mm-stat-knowledge", byGroup.knowledge || 0);
    setStat("mm-stat-object", byGroup.object || 0);
  }

  function renderForCurrent() {
    const group = GROUPS.find((g) => g.key === currentGroup) || GROUPS[0];
    const subtitle = document.getElementById("pulse-mm-subtitle");
    if (subtitle) subtitle.textContent = group.desc;
    const cleanBtn = document.getElementById("pulse-mm-clean");
    if (cleanBtn) cleanBtn.hidden = group.key !== "system";
    renderRows(filteredRows());
  }

  async function refresh() {
    ensureDom();
    if (!listEl) return;
    listEl.innerHTML = `<div class="pulse-mm-loading">加载中…</div>`;
    try {
      const q = (searchInput?.value || "").trim();
      const params = new URLSearchParams({ limit: "200", scope: currentScope });
      if (q) params.set("search", q);
      if (activeIndustry?.id) params.set("industry", activeIndustry.id);
      const path = `/memories?${params.toString()}`;
      const r = await fetch(apiUrl(path), { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows = await r.json();
      cachedRows = Array.isArray(rows) ? rows : [];
      updateCounts();
      renderForCurrent();
    } catch (e) {
      cachedRows = [];
      updateCounts();
      listEl.innerHTML = `<div class="pulse-mm-error">加载失败：${esc(e.message)}</div>`;
    }
  }

  function renderRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      const group = GROUPS.find((g) => g.key === currentGroup) || GROUPS[0];
      const hint = group.key === "about_me"
        ? "Nimo 还没有积累关于你的记忆。你可以多聊几句，或点「告诉 Nimo 一件事」主动补充偏好、习惯和重要安排。"
        : group.key === "system"
          ? "暂无系统档案"
          : "暂无记忆。导入文档、陪读问答或手动补充后，这里会逐渐沉淀。";
      listEl.innerHTML = `<div class="pulse-mm-empty">${esc(hint)}</div>`;
      return;
    }
    listEl.innerHTML = rows
      .map((row) => {
        const id = row.id;
        const t = effectiveType(row);
        const typeLabel = TYPE_LABELS[t] || t;
        const color = TYPE_COLORS[t] || "#525252";
        const scopeLabel = memoryScopeLabel(row);
        const scopeClass = industryTag(row) ? "industry" : "global";
        const title = cleanTitle(row);
        const content = cleanContent(row);
        const headLine = title || (content.length > 56 ? content.slice(0, 56) + "…" : content);
        const subLine = title && content && content !== title ? (content.length > 72 ? content.slice(0, 72) + "…" : content) : "";
        const cleanedDetail = cleanDetail(row.detail);
        const rawTypeText = t === "system_shadow"
          ? `${row.event_type || "unknown"} → system`
          : (row.event_type || "");

        return `<article class="pulse-mm-item" data-id="${id}">
  <div class="pulse-mm-item-row">
    <span class="pulse-mm-badge" style="--badge-color:${color}">${esc(typeLabel)}</span>
    <span class="pulse-mm-scope-badge ${esc(scopeClass)}">${esc(scopeLabel)}</span>
    <span class="pulse-mm-headline">${esc(headLine)}</span>
    <span class="pulse-mm-time">${esc(relativeTime(row))}</span>
  </div>
  ${subLine ? `<div class="pulse-mm-subline">${esc(subLine)}</div>` : ""}
  <div class="pulse-mm-actions">
    <button type="button" class="pulse-mm-link" data-mm-expand="${id}">详情</button>
    <button type="button" class="pulse-mm-link" data-mm-edit="${id}">编辑</button>
    <button type="button" class="pulse-mm-link danger" data-mm-delete="${id}">删除</button>
  </div>
  <div class="pulse-mm-expand" id="pulse-mm-expand-${id}" hidden>
    ${cleanedDetail ? `<div class="pulse-mm-detail-label">详情</div><pre class="pulse-mm-detail">${esc(cleanedDetail)}</pre>` : ""}
    <div class="pulse-mm-meta-grid">
      <div><span class="pulse-mm-meta-key">类型</span><span class="pulse-mm-meta-val">${esc(rawTypeText)}</span></div>
      <div><span class="pulse-mm-meta-key">范围</span><span class="pulse-mm-meta-val">${esc(scopeLabel)}</span></div>
      ${row.mem_id ? `<div><span class="pulse-mm-meta-key">mem_id</span><span class="pulse-mm-meta-val mono">${esc(row.mem_id)}</span></div>` : ""}
      <div><span class="pulse-mm-meta-key">时间</span><span class="pulse-mm-meta-val">${esc(row.timestamp || row.created_at || "")}</span></div>
    </div>
  </div>
  <div class="pulse-mm-edit" id="pulse-mm-edit-${id}" hidden>
    <label class="pulse-mm-label">正文</label>
    <textarea class="pulse-mm-ta" data-field="content" rows="3">${esc(row.content || "")}</textarea>
    <div class="pulse-mm-edit-actions">
      <button type="button" class="pulse-mm-btn ghost" data-mm-cancel-edit="${id}">取消</button>
      <button type="button" class="pulse-mm-btn primary" data-mm-save="${id}">保存</button>
    </div>
  </div>
</article>`;
      })
      .join("");
  }

  async function onListClick(e) {
    const expandBtn = e.target.closest("[data-mm-expand]");
    if (expandBtn) {
      const id = expandBtn.getAttribute("data-mm-expand");
      const box = document.getElementById(`pulse-mm-expand-${id}`);
      if (box) box.hidden = !box.hidden;
      return;
    }

    const delBtn = e.target.closest("[data-mm-delete]");
    if (delBtn) {
      const id = delBtn.getAttribute("data-mm-delete");
      if (!id || !confirm("删除这条记忆？")) return;
      try {
        const r = await fetch(apiUrl(`/memories/${id}`), { method: "DELETE", credentials: "same-origin" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        await refresh();
        window.dispatchEvent(new CustomEvent("pulse:memories-changed"));
      } catch (err) {
        alert(`删除失败：${err.message}`);
      }
      return;
    }

    const editBtn = e.target.closest("[data-mm-edit]");
    if (editBtn) {
      const id = editBtn.getAttribute("data-mm-edit");
      const box = document.getElementById(`pulse-mm-edit-${id}`);
      if (box) box.hidden = !box.hidden;
      return;
    }

    const cancelBtn = e.target.closest("[data-mm-cancel-edit]");
    if (cancelBtn) {
      const id = cancelBtn.getAttribute("data-mm-cancel-edit");
      const box = document.getElementById(`pulse-mm-edit-${id}`);
      if (box) box.hidden = true;
      return;
    }

    const saveBtn = e.target.closest("[data-mm-save]");
    if (saveBtn) {
      const id = saveBtn.getAttribute("data-mm-save");
      const box = document.getElementById(`pulse-mm-edit-${id}`);
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
        await refresh();
        window.dispatchEvent(new CustomEvent("pulse:memories-changed"));
      } catch (err) {
        alert(`保存失败：${err.message}`);
      }
    }
  }

  // 提前注入 DOM，让顶部 nav 在恢复 saved view 时能找到容器
  try { ensureDom(); } catch {}

  window.addEventListener("pulse:open-memory-manager", () => {
    ensureDom();
    if (typeof window !== "undefined" && typeof window.pulseSetView === "function") {
      window.pulseSetView("memory");
    } else {
      overlay.hidden = false;
    }
    if (searchInput) searchInput.value = "";
    currentGroup = "about_me";
    overlay?.querySelectorAll(".pulse-mm-tab").forEach((b) =>
      b.classList.toggle("active", b.getAttribute("data-group") === currentGroup)
    );
    toggleNewForm(false);
    loadIndustryForMemoryScope().then(() => refresh());
  });

  window.addEventListener("pulse:industry-changed", (event) => {
    const pack = event.detail?.activePack;
    activeIndustry = pack ? { id: pack.id || "", name: pack.name || "", icon: pack.icon || "" } : null;
    if (overlay && !overlay.hidden) refresh();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && overlay && !overlay.hidden) close();
  });
}

// 兼容旧入口
export { showMemoryWrittenToast } from "./toast.js";
