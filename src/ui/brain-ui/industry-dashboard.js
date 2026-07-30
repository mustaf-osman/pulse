import { API } from "./api-client.js";

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encodeAttr(input) {
  return encodeURIComponent(String(input ?? ""));
}

function decodeAttr(input) {
  try { return decodeURIComponent(String(input || "")); } catch { return String(input || ""); }
}

function itemTitle(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return item.name || item.title || item.label || item.id || "";
}

function itemDetail(item) {
  if (!item || typeof item !== "object") return "";
  if (item.focus) return item.focus;
  if (item.description) return item.description;
  if (item.output) return `输出：${item.output}`;
  if (Array.isArray(item.outputs) && item.outputs.length) return `输出：${item.outputs.join("、")}`;
  if (Array.isArray(item.steps) && item.steps.length) return item.steps.slice(0, 4).join(" → ");
  return "";
}

function capabilityPrompt(pack, type, item) {
  const industryName = pack?.name || "当前";
  const title = itemTitle(item);
  const detail = itemDetail(item);
  if (!title) return "";
  if (item && typeof item === "object" && (item.prompt || item.template)) {
    return String(item.prompt || item.template);
  }
  if (type === "object") {
    return `请基于「${industryName}」行业对象「${title}」帮我做专业分析。\n\n请先判断这个对象最关键的背景信息是什么，再输出：\n1. 需要补充的关键信息\n2. 当前可能的机会或风险\n3. 下一步最可执行的动作\n4. 如果要沉淀为长期档案，应该记录哪些字段。`;
  }
  if (type === "expert") {
    return `请以「${title}」身份，基于「${industryName}」行业帮我处理这个问题。\n\n专业重点：${detail || "按该行业真实业务逻辑分析"}\n\n请先问我 2-3 个必要背景问题，然后给出结构化判断、风险提醒和下一步行动。`;
  }
  if (type === "skill") {
    const outputs = Array.isArray(item?.outputs) && item.outputs.length ? `\n期望输出：${item.outputs.join("、")}` : "";
    return `请使用「${title}」这个「${industryName}」行业 Skill 帮我完成任务。\n\n能力说明：${detail || "按该行业专业流程处理"}${outputs}\n\n请先确认必要输入，再给出可直接执行的方案。`;
  }
  const steps = Array.isArray(item?.steps) && item.steps.length ? `\n工作流步骤：${item.steps.join(" → ")}` : "";
  const output = item?.output ? `\n最终输出：${item.output}` : "";
  return `请执行「${title}」这个「${industryName}」行业工作流。${steps}${output}\n\n请先判断缺少哪些信息，再按步骤推进，并输出可直接使用的结果。`;
}

function renderCapabilityAction(pack, type, item) {
  const title = itemTitle(item);
  if (!title) return "";
  const detail = itemDetail(item);
  const prompt = capabilityPrompt(pack, type, item);
  return `<li>
    <button type="button" class="ind-dash-action" data-capability-prompt="${encodeAttr(prompt)}">
      <span class="ind-dash-action-main">${escapeHtml(title)}</span>
      ${detail ? `<span class="ind-dash-action-sub">${escapeHtml(detail)}</span>` : ""}
      <span class="ind-dash-action-cta">使用</span>
    </button>
  </li>`;
}

function sendCapabilityToChat(prompt) {
  if (!prompt) return;
  try { window.pulseSetView?.("chat"); } catch {}
  setTimeout(() => {
    const input = document.getElementById("msg-input");
    if (!input) return;
    input.value = prompt;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }, 60);
}

function takeFirstOptions(fields, key, fallback = []) {
  const field = (fields || []).find((item) => item.key === key);
  const options = Array.isArray(field?.options) ? field.options : [];
  return (options.length ? options : fallback).slice(0, 4);
}

function renderEcommerce(pack) {
  const fields = pack.customerFields || [];
  const platforms = takeFirstOptions(fields, "platforms", ["淘宝", "抖音", "小红书", "拼多多"]);
  const pains = takeFirstOptions(fields, "pain_points", ["流量贵", "没爆款", "复购低", "库存压"]);
  const widgets = (pack.dashboard?.widgets || []).map((w) => w.title).slice(0, 3);

  return `
<div class="ind-dash-grid ind-dash-grid--ecom">
  <article class="ind-dash-card ind-dash-card--highlight">
    <div class="ind-dash-card-title">电商作战重点</div>
    <div class="ind-dash-card-main">先保动销，再拉利润</div>
    <div class="ind-dash-card-sub">建议顺序：选品池清理 → 内容提效 → 复购召回</div>
  </article>
  <article class="ind-dash-card">
    <div class="ind-dash-card-title">高频平台</div>
    <div class="ind-dash-tags">${platforms.map((p) => `<span>${escapeHtml(p)}</span>`).join("")}</div>
  </article>
  <article class="ind-dash-card">
    <div class="ind-dash-card-title">常见痛点</div>
    <div class="ind-dash-tags ind-dash-tags--warn">${pains.map((p) => `<span>${escapeHtml(p)}</span>`).join("")}</div>
  </article>
  <article class="ind-dash-card">
    <div class="ind-dash-card-title">可用看板</div>
    <ul class="ind-dash-list">
      ${widgets.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}
    </ul>
  </article>
</div>
${renderCapabilityGrid(pack)}`;
}

function renderTech(pack) {
  const fields = pack.customerFields || [];
  const roles = takeFirstOptions(fields, "decision_role", ["CEO", "CTO", "产品负责人", "增长负责人"]);
  const cycle = takeFirstOptions(fields, "decision_cycle", ["1 周内", "1 月内", "1 季度", "半年以上"]);
  const widgets = (pack.dashboard?.widgets || []).map((w) => w.title).slice(0, 3);

  return `
<div class="ind-dash-grid ind-dash-grid--tech">
  <article class="ind-dash-card ind-dash-card--highlight">
    <div class="ind-dash-card-title">科技销售重点</div>
    <div class="ind-dash-card-main">角色识别 + 决策路径前置</div>
    <div class="ind-dash-card-sub">建议顺序：线索分层 → Demo 资格审查 → POC 到签约推进</div>
  </article>
  <article class="ind-dash-card">
    <div class="ind-dash-card-title">关键决策角色</div>
    <div class="ind-dash-tags">${roles.map((r) => `<span>${escapeHtml(r)}</span>`).join("")}</div>
  </article>
  <article class="ind-dash-card">
    <div class="ind-dash-card-title">典型决策周期</div>
    <div class="ind-dash-tags">${cycle.map((c) => `<span>${escapeHtml(c)}</span>`).join("")}</div>
  </article>
  <article class="ind-dash-card">
    <div class="ind-dash-card-title">可用看板</div>
    <ul class="ind-dash-list">
      ${widgets.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}
    </ul>
  </article>
</div>
${renderCapabilityGrid(pack)}`;
}

function renderCapabilityGrid(pack) {
  const objects = (pack.domainObjects || []).slice(0, 6);
  const experts = (pack.experts || []).slice(0, 5);
  const skills = (pack.skills || []).slice(0, 6);
  const workflows = (pack.workflows || []).slice(0, 4);
  const objectTags = objects.map((item) => {
    const title = itemTitle(item);
    if (!title) return "";
    return `<button type="button" class="ind-dash-tag ind-dash-tag--action" data-capability-prompt="${encodeAttr(capabilityPrompt(pack, "object", item))}">${escapeHtml(title)}</button>`;
  }).join("");
  const expertItems = experts.map((item) => renderCapabilityAction(pack, "expert", item)).join("");
  const skillItems = skills.map((item) => renderCapabilityAction(pack, "skill", item)).join("");
  const workflowItems = workflows.map((item) => renderCapabilityAction(pack, "workflow", item)).join("");
  if (!objectTags && !expertItems && !skillItems && !workflowItems) return "";
  return `
<div class="ind-dash-grid">
  ${objectTags ? `<article class="ind-dash-card">
    <div class="ind-dash-card-title">行业对象</div>
    <div class="ind-dash-tags">${objectTags}</div>
  </article>` : ""}
  ${expertItems ? `<article class="ind-dash-card">
    <div class="ind-dash-card-title">专家角色</div>
    <ul class="ind-dash-list ind-dash-list--actions">${expertItems}</ul>
  </article>` : ""}
  ${skillItems ? `<article class="ind-dash-card">
    <div class="ind-dash-card-title">可用 Skill</div>
    <ul class="ind-dash-list ind-dash-list--actions">${skillItems}</ul>
  </article>` : ""}
  ${workflowItems ? `<article class="ind-dash-card">
    <div class="ind-dash-card-title">行业工作流</div>
    <ul class="ind-dash-list ind-dash-list--actions">${workflowItems}</ul>
  </article>` : ""}
</div>`;
}

function renderPharma(pack) {
  const modules = [
    {
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v17H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h12"/><path d="M8 7h7"/><path d="M8 11h6"/></svg>`,
      tag: "01",
      title: "精读论文",
      desc: "拆结构、讲人话、整理证据链",
      prompt: "请进入「文献精读室」。我会粘贴一篇药学/生命科学论文摘要或片段，请按学生学习版输出：研究背景与科学问题、方法和实验设计、关键结果与结论、疾病-靶点-药物-指标证据表、专业术语解释、局限性和可延伸课题。"
    },
    {
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3c0 5 14 5 14 14"/><path d="M19 3c0 5-14 5-14 14"/><path d="M7 6h10"/><path d="M7 18h10"/><path d="M9 9h6"/><path d="M9 15h6"/></svg>`,
      tag: "02",
      title: "孵化课题",
      desc: "生成研究方向、假设与路线图",
      prompt: "请进入「课题孵化器」。我会输入一个疾病、靶点、药物或研究方向，请帮我生成课题方向、研究假设、文献调研路线、实验/数据验证路线图、可行性风险和导师确认问题。"
    },
    {
      svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3"/><path d="M7 14h10"/></svg>`,
      tag: "03",
      title: "设计实验",
      desc: "变量、对照、指标和合规边界",
      prompt: "请进入「实验设计台」。我会输入一个药学课题或研究假设，请输出教学/组会讨论级实验设计：研究目的、变量、对照、模型选择、分组逻辑、关键检测指标、数据分析思路、失败风险、替代方案、伦理安全和合规边界。"
    }
  ];
  return `
<div class="ind-dash-pharma ind-dash-pharma-compact">
  <div class="ind-dash-pharma-modules">
    ${modules.map((item) => `
      <button type="button" class="ind-dash-pharma-module" data-capability-prompt="${encodeAttr(item.prompt)}">
        <span class="ind-dash-pharma-icon">${item.svg}</span>
        <span class="ind-dash-pharma-tag">${escapeHtml(item.tag)}</span>
        <span class="ind-dash-pharma-title">${escapeHtml(item.title)}</span>
        <span class="ind-dash-pharma-desc">${escapeHtml(item.desc)}</span>
      </button>
    `).join("")}
  </div>
</div>`;
}

function renderGeneric(pack) {
  const widgets = (pack.dashboard?.widgets || []).map((w) => w.title).slice(0, 4);
  const sources = (pack.hotspotSources || []).slice(0, 4);
  return `
<div class="ind-dash-grid">
  <article class="ind-dash-card ind-dash-card--highlight">
    <div class="ind-dash-card-title">当前行业模式</div>
    <div class="ind-dash-card-main">${escapeHtml(pack.name || "行业")}</div>
    <div class="ind-dash-card-sub">${escapeHtml(pack.tagline || "已启用行业专属策略")}</div>
  </article>
  <article class="ind-dash-card">
    <div class="ind-dash-card-title">热点来源</div>
    <div class="ind-dash-tags">${sources.map((s) => `<span>${escapeHtml(s)}</span>`).join("")}</div>
  </article>
  <article class="ind-dash-card">
    <div class="ind-dash-card-title">看板组件</div>
    <ul class="ind-dash-list">${widgets.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>
  </article>
</div>
${renderCapabilityGrid(pack)}`;
}

function objectLabels(pack = {}) {
  const labels = pack.objectLabels || {};
  return {
    statsTitle: labels.statsTitle || "当前行业客户",
    statsSub: labels.statsSub || "默认仅显示当前行业客户资产",
    diagnosticsHeader: labels.diagnosticsHeader || "客户",
  };
}

function renderStats(stats = {}, pack = {}) {
  const customerCount = Number.isFinite(stats.customerCount) ? stats.customerCount : 0;
  const memoryCount = Number.isFinite(stats.memoryCount) ? stats.memoryCount : 0;
  const knowledgeCount = Number.isFinite(stats.knowledgeCount) ? stats.knowledgeCount : 0;
  const labels = objectLabels(pack);
  return `
<div class="ind-dash-grid">
  <article class="ind-dash-card">
    <div class="ind-dash-card-title">${escapeHtml(labels.statsTitle)}</div>
    <div class="ind-dash-card-main">${customerCount}</div>
    <div class="ind-dash-card-sub">${escapeHtml(labels.statsSub)}</div>
  </article>
  <article class="ind-dash-card">
    <div class="ind-dash-card-title">可用记忆</div>
    <div class="ind-dash-card-main">${memoryCount}</div>
    <div class="ind-dash-card-sub">当前行业 + 全局记忆</div>
  </article>
  <article class="ind-dash-card">
    <div class="ind-dash-card-title">行业知识文件</div>
    <div class="ind-dash-card-main">${knowledgeCount}</div>
    <div class="ind-dash-card-sub">按问题相关性注入上下文</div>
  </article>
</div>`;
}

function renderDiagnostics(diagnostics = {}, pack = {}) {
  const industries = Array.isArray(diagnostics.industries) ? diagnostics.industries : [];
  if (!industries.length) return "";
  const labels = objectLabels(pack);
  const rows = industries.map((item) => `
    <tr class="${item.active ? "active" : ""}">
      <td>${escapeHtml(`${item.icon || ""} ${item.name || item.id}`.trim())}</td>
      <td>${item.enabled ? "已启用" : "未启用"}</td>
      <td>${Number.isFinite(item.customerCount) ? item.customerCount : 0}</td>
      <td>${Number.isFinite(item.memoryCount) ? item.memoryCount : 0}</td>
      <td>${Number.isFinite(item.knowledgeCount) ? item.knowledgeCount : 0}</td>
    </tr>
  `).join("");
  const globalMemory = Number.isFinite(diagnostics.global?.memoryCount) ? diagnostics.global.memoryCount : 0;
  return `
<article class="ind-dash-card ind-dash-card--wide">
  <div class="ind-dash-card-title">行业隔离诊断</div>
  <div class="ind-dash-card-sub">全局记忆 ${globalMemory} 条；下表为每个行业的专属数据数量。</div>
  <table class="ind-dash-diagnostics">
    <thead>
      <tr><th>行业</th><th>状态</th><th>${escapeHtml(labels.diagnosticsHeader)}</th><th>行业记忆</th><th>知识</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</article>`;
}

const STORAGE_KEY = "pulse_industry_dashboard_expanded";

function isExpanded() {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

function setExpandedState(expanded) {
  try { localStorage.setItem(STORAGE_KEY, expanded ? "1" : "0"); } catch {}
}

function renderPack(host, pack, stats = {}, diagnostics = {}) {
  if (!host) return;
  if (!pack) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  host.hidden = false;
  host.dataset.industry = pack.id || "";
  const expanded = isExpanded();
  host.classList.toggle("is-expanded", expanded);
  host.classList.toggle("is-collapsed", !expanded);

  const body =
    pack.id === "ecommerce"
      ? renderEcommerce(pack)
      : pack.id === "tech"
        ? renderTech(pack)
        : pack.id === "pharma"
          ? renderPharma(pack)
          : renderGeneric(pack);

  const assistantLabel = pack.assistantTitle || `${pack.name || "行业"}模式`;
  const tagline = pack.assistantTagline || pack.tagline || "";

  host.innerHTML = `
<button type="button" class="ind-dash-chip" data-action="toggle" aria-expanded="${expanded ? "true" : "false"}">
  <span class="ind-dash-chip-icon">${escapeHtml(pack.icon || "🏢")}</span>
  <span class="ind-dash-chip-name">${escapeHtml(assistantLabel)}</span>
  <span class="ind-dash-chip-sub">${escapeHtml(tagline)}</span>
  <span class="ind-dash-chip-toggle">${expanded ? "收起 ▴" : "展开 ▾"}</span>
</button>
<div class="ind-dash-body" ${expanded ? "" : "hidden"}>
  ${body}
  ${renderStats(stats, pack)}
  ${renderDiagnostics(diagnostics, pack)}
</div>`;

  const toggleBtn = host.querySelector('[data-action="toggle"]');
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const next = !isExpanded();
      setExpandedState(next);
      renderPack(host, pack, stats, diagnostics);
    });
  }
}

export async function initIndustryDashboard() {
  const host = document.getElementById("industry-dashboard");
  if (!host) return;

  if (!host.dataset.capabilityMounted) {
    host.dataset.capabilityMounted = "1";
    host.addEventListener("click", (event) => {
      const action = event.target.closest("[data-capability-prompt]");
      if (!action || !host.contains(action)) return;
      event.preventDefault();
      sendCapabilityToChat(decodeAttr(action.getAttribute("data-capability-prompt")));
    });
  }

  let currentState = null;
  let currentDiagnostics = null;
  const applyFromState = (state, diagnostics = currentDiagnostics) => {
    currentState = state;
    currentDiagnostics = diagnostics;
    renderPack(host, state?.activePack || null, state?.stats || {}, diagnostics || {});
  };
  const refreshDiagnostics = async () => {
    try {
      const res = await fetch(`${API}/industry/diagnostics`);
      const data = await res.json();
      if (data?.ok) applyFromState(currentState, data);
    } catch {}
  };

  try {
    const [stateRes, diagnosticsRes] = await Promise.all([
      fetch(`${API}/industry`),
      fetch(`${API}/industry/diagnostics`),
    ]);
    const state = await stateRes.json();
    const diagnostics = await diagnosticsRes.json();
    applyFromState(state, diagnostics?.ok ? diagnostics : null);
  } catch {
    renderPack(host, null);
  }

  window.addEventListener("pulse:industry-changed", (event) => {
    applyFromState(event.detail || null);
    refreshDiagnostics();
  });
}
