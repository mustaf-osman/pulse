import { API, apiUrl } from "./api-client.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let allPacks = [];

// 客户字段：industry pack 调查 + 下面这几个······“通用销售字段”一起拼接
// 这些字段在所有行业都用到，不适合写到某个行业包里
const COMMON_CUSTOMER_FIELDS = [
  { key: "contact_person", label: "联系人", type: "text" },
  { key: "contact_phone", label: "联系电话", type: "text" },
  { key: "next_follow_at", label: "下次跟进日期", type: "date" },
  { key: "notes", label: "备注", type: "textarea" },
];

// 客户表单内部状态
let customerIndustryFields = [];
let customerActiveIndustry = null;     // { id, name, icon }
let customerEditingId = null;           // null = 新建模式
let customerDraft = {};                 // { fieldKey: value }

function objectCopy() {
  const labels = customerActiveIndustry?.objectLabels || {};
  const pharma = customerActiveIndustry?.id === "pharma";
  const singular = labels.singular || "客户";
  const profile = labels.profile || `${singular}资料`;
  return {
    singular,
    profile,
    workspaceTitle: labels.workspaceTitle || (pharma ? "科研课题资料台" : "公司与团队资料台"),
    workspaceSub: labels.workspaceSub || (pharma ? "统一管理课题资料、研究记录和团队成员 —— AI 会基于这些辅助课题分析" : "统一管理公司信息、客户跟进、员工资料 —— AI 会用这些做更准确的回应"),
    shellSub: labels.shellSub || (pharma ? "把课题、资料、成员都放在一个窗口统一管理" : "把公司、客户、员工都放在一个窗口统一管理（支持电商 / 科技等模块）"),
    tabCompany: labels.companyTab || (pharma ? "团队信息" : "公司信息"),
    tabCustomer: labels.customerTab || (pharma ? "课题管理" : "客户管理"),
    tabEmployee: labels.employeeTab || (pharma ? "成员管理" : "员工管理"),
    companyStat: labels.companyStat || (pharma ? "团队信息" : "公司信息"),
    customerStat: labels.customerStat || singular,
    customerStatSub: labels.customerStatSub || (pharma ? "在研科研课题" : "在册客户"),
    pageTitle: labels.customerPageTitle || profile,
    pageSub: labels.customerPageSub || (pharma ? "先查看科研课题列表，需要时再新增或编辑课题资料。" : "先查看客户列表，需要时再新增或编辑。"),
    savedTitle: labels.savedCustomersTitle || (pharma ? "已保存课题" : "已保存客户"),
    newText: labels.newCustomer || (pharma ? "新增课题" : "新增客户"),
    addText: labels.addCustomer || (pharma ? "添加课题" : "添加客户"),
    editText: labels.editCustomer || (pharma ? "编辑课题" : "编辑客户"),
    saveText: labels.saveCustomer || "保存修改",
    emptyList: labels.emptyCustomers || (pharma ? "暂无课题，点击“新增课题”添加第一个研究任务。" : "暂无客户，点击“新增客户”添加第一位。"),
    loadFail: labels.customerLoadFail || (pharma ? "课题加载失败" : "客户加载失败"),
    emptyNoIndustryTitle: labels.emptyNoIndustryTitle || "尚未选择行业",
    emptyNoIndustrySub: labels.emptyNoIndustrySub || (pharma ? "课题字段会跟随行业变化。请先选择制药医药，再回来添加课题。" : "客户字段会跟随行业变化。请先在对话页顶部切换器选择一个行业（科技 / 电商等），再回来添加客户。"),
    quotaName: labels.quotaName || (pharma ? "课题管理" : "客户管理"),
    savedMessage: labels.savedMessage || (pharma ? "课题已添加，AI 已感知" : "客户已添加，AI 已感知"),
    updatedMessage: labels.updatedMessage || "修改已保存，AI 已感知",
    noIndustryError: labels.noIndustryError || (pharma ? "请先选择行业后再添加课题" : "请先选择行业后再添加客户"),
    nextDateLabel: labels.nextDateLabel || (pharma ? "下次推进日期" : "下次跟进日期"),
    ownerLabel: labels.ownerLabel || (pharma ? "负责人/导师" : "联系人"),
    phoneLabel: labels.phoneLabel || "联系电话",
    notesLabel: labels.notesLabel || (pharma ? "研究备注" : "备注"),
  };
}

function setText(selector, text, root = document) {
  const el = root.querySelector(selector);
  if (el) el.textContent = text;
}

function applyWorkspaceCopy(root = document) {
  const copy = objectCopy();
  const overlay = root.querySelector?.("#org-overlay") || document.getElementById("org-overlay");
  const scope = overlay || document;
  const modal = scope.querySelector?.(".org-modal");
  if (modal) modal.setAttribute("aria-label", copy.workspaceTitle);
  setText(".org-title", copy.workspaceTitle, scope);
  setText(".org-subtitle", copy.shellSub, scope);
  setText('.org-tab[data-tab="company"]', copy.tabCompany, scope);
  setText('.org-tab[data-tab="customer"]', copy.tabCustomer, scope);
  setText('.org-tab[data-tab="employee"]', copy.tabEmployee, scope);
  setText('.view-hero-title', copy.workspaceTitle, scope);
  setText('.view-hero-sub', copy.workspaceSub, scope);
  setText('.view-hero-stat[data-org-tab-jump="customer"] .view-hero-stat-label', copy.customerStat, scope);
  setText('.view-hero-stat[data-org-tab-jump="customer"] .view-hero-stat-sub', copy.customerStatSub, scope);
  setText('.view-hero-stat[data-org-tab-jump="company"] .view-hero-stat-label', copy.companyStat, scope);
  const customerPane = scope.querySelector?.('.org-pane[data-pane="customer"]');
  if (customerPane) {
    setText(".org-page-title", copy.pageTitle, customerPane);
    setText(".org-page-sub", copy.pageSub, customerPane);
    setText(".org-list-title", copy.savedTitle, customerPane);
    customerPane.querySelectorAll("#org-customer-new, [data-org-open-customer]").forEach((btn) => {
      btn.textContent = copy.newText;
    });
    setText("#org-customer-mode-label", customerEditingId ? copy.editText : copy.newText, customerPane);
    const submit = customerPane.querySelector("#org-customer-submit");
    if (submit) submit.textContent = customerEditingId ? copy.saveText : copy.addText;
    setText("#org-customer-empty .org-empty-title", copy.emptyNoIndustryTitle, customerPane);
    setText("#org-customer-empty .org-empty-sub", copy.emptyNoIndustrySub, customerPane);
  }
}

function showFeedback(id, text, isErr = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || "";
  el.className = `org-feedback ${isErr ? "error" : "ok"}`;
  setTimeout(() => {
    el.textContent = "";
    el.className = "org-feedback";
  }, 2500);
}

function selectedModules(containerId) {
  const host = document.getElementById(containerId);
  if (!host) return [];
  return [...host.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
}

async function consumeQuota(featureKey, friendlyName) {
  const consume = (typeof window !== "undefined") ? window.NewPulseCloudAuth?.consumeFeature : null;
  if (typeof consume !== "function") return;
  try {
    await consume(featureKey, 1);
  } catch (error) {
    const code = String(error?.message || "");
    if (/quota_exceeded/i.test(code)) {
      throw new Error(`今日「${friendlyName}」免费额度已用完，请联系管理员开通或续费`);
    }
    if (/feature_not_allowed/i.test(code)) {
      throw new Error(`当前账号未开通「${friendlyName}」功能，请联系管理员`);
    }
    if (/account_not_active|session_revoked|session_expired|session_not_found|invalid_token/i.test(code)) {
      throw new Error("云端授权已失效，请重新登录后再试");
    }
    throw error;
  }
}

function renderModuleChecks(containerId, selected = []) {
  const host = document.getElementById(containerId);
  if (!host) return;
  const selectedSet = new Set(selected);
  const packs = customerActiveIndustry?.id ? allPacks.filter((p) => p.id === customerActiveIndustry.id) : allPacks;
  host.innerHTML = packs.map((p) => `
    <label class="org-module-pill">
      <input type="checkbox" value="${esc(p.id)}" ${selectedSet.has(p.id) ? "checked" : ""}>
      <span>${esc(p.icon || "📦")} ${esc(p.name || p.id)}</span>
    </label>
  `).join("");
}

function renderCustomerModuleSelect(selectedId = "") {
  const el = document.getElementById("org-customer-module");
  if (!el) return;
  el.innerHTML = allPacks.map((p) =>
    `<option value="${esc(p.id)}" ${p.id === selectedId ? "selected" : ""}>${esc(p.icon || "📦")} ${esc(p.name || p.id)}</option>`
  ).join("");
}

async function loadIndustryPacks() {
  try {
    const data = await fetch(`${API}/industry`).then((r) => r.json());
    allPacks = Array.isArray(data?.allPacks) ? data.allPacks : [];
    const pack = data?.activePack || null;
    if (pack) {
      customerActiveIndustry = { id: pack.id, name: pack.name, icon: pack.icon, objectLabels: pack.objectLabels || {} };
      customerIndustryFields = Array.isArray(pack.customerFields) ? pack.customerFields : [];
    } else {
      customerActiveIndustry = null;
      customerIndustryFields = [];
    }
  } catch {
    allPacks = [];
    customerActiveIndustry = null;
    customerIndustryFields = [];
  }
  renderModuleChecks("org-company-modules", []);
  renderModuleChecks("org-employee-modules", []);
  applyWorkspaceCopy();
}

function industryQuery() {
  const params = new URLSearchParams();
  if (customerActiveIndustry?.id) params.set("industry", customerActiveIndustry.id);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function allCustomerFields() {
  const copy = objectCopy();
  const common = COMMON_CUSTOMER_FIELDS.map((field) => {
    if (field.key === "contact_person") return { ...field, label: copy.ownerLabel };
    if (field.key === "contact_phone") return { ...field, label: copy.phoneLabel };
    if (field.key === "next_follow_at") return { ...field, label: copy.nextDateLabel };
    if (field.key === "notes") return { ...field, label: copy.notesLabel };
    return field;
  });
  return [...customerIndustryFields, ...common];
}

function updateCustomerDraftField(key, value) {
  if (value === "" || value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
    delete customerDraft[key];
  } else {
    customerDraft[key] = value;
  }
}

function renderCustomerTagsField(field, current) {
  const wrap = document.createElement("div");
  wrap.className = "cust-tags";
  const list = Array.isArray(current) ? [...current] : [];
  if (Array.isArray(field.options) && field.options.length) {
    for (const opt of field.options) {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "cust-tag" + (list.includes(opt) ? " active" : "");
      tag.textContent = opt;
      tag.addEventListener("click", () => {
        const idx = list.indexOf(opt);
        if (idx >= 0) { list.splice(idx, 1); tag.classList.remove("active"); }
        else { list.push(opt); tag.classList.add("active"); }
        updateCustomerDraftField(field.key, [...list]);
      });
      wrap.appendChild(tag);
    }
  } else {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "cust-tag-input";
    input.placeholder = "输入后回车添加…";
    const refresh = () => {
      wrap.querySelectorAll(".cust-tag").forEach((el) => el.remove());
      for (const t of list) {
        const tag = document.createElement("button");
        tag.type = "button";
        tag.className = "cust-tag active";
        tag.textContent = t + " ×";
        tag.addEventListener("click", () => {
          const idx = list.indexOf(t);
          if (idx >= 0) list.splice(idx, 1);
          updateCustomerDraftField(field.key, [...list]);
          refresh();
        });
        wrap.insertBefore(tag, input);
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        e.preventDefault();
        const v = input.value.trim();
        if (!list.includes(v)) list.push(v);
        updateCustomerDraftField(field.key, [...list]);
        input.value = "";
        refresh();
      }
    });
    wrap.appendChild(input);
    refresh();
  }
  return wrap;
}

function renderCustomerForm() {
  const host = document.getElementById("org-customer-form-host");
  const emptyEl = document.getElementById("org-customer-empty");
  const metaEl = document.getElementById("org-customer-form-meta");
  const modeLabelEl = document.getElementById("org-customer-mode-label");
  const industryTagEl = document.getElementById("org-customer-industry-tag");
  const submitBtn = document.getElementById("org-customer-submit");
  const cancelBtn = document.getElementById("org-customer-cancel-edit");
  if (!host) return;

  // 无行业时提示，隐藏表单
  if (!customerActiveIndustry) {
    host.innerHTML = "";
    if (emptyEl) emptyEl.hidden = false;
    if (metaEl) metaEl.hidden = true;
    if (submitBtn) submitBtn.disabled = true;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;
  if (metaEl) metaEl.hidden = false;
  if (submitBtn) submitBtn.disabled = false;
  const copy = objectCopy();
  if (modeLabelEl) modeLabelEl.textContent = customerEditingId ? copy.editText : copy.newText;
  if (industryTagEl) {
    industryTagEl.innerHTML = `${esc(customerActiveIndustry.icon || "📐")} ${esc(customerActiveIndustry.name || "")}`;
  }
  if (submitBtn) submitBtn.textContent = customerEditingId ? copy.saveText : copy.addText;
  if (cancelBtn) cancelBtn.hidden = !customerEditingId;

  host.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "org-grid";
  for (const field of allCustomerFields()) {
    const wrap = document.createElement("div");
    wrap.className = field.type === "textarea" ? "org-field org-field-span2" : "org-field";
    const label = document.createElement("label");
    label.innerHTML = `${esc(field.label)}${field.required ? '<span class="cust-required">*</span>' : ""}`;
    wrap.appendChild(label);

    let inputEl;
    const cur = customerDraft[field.key];
    if (field.type === "select") {
      inputEl = document.createElement("select");
      inputEl.className = "org-input";
      const opts = ["<option value=\"\">— 请选择 —</option>"].concat(
        (field.options || []).map((opt) => `<option value="${esc(opt)}">${esc(opt)}</option>`)
      );
      inputEl.innerHTML = opts.join("");
      inputEl.value = cur || "";
      inputEl.addEventListener("change", () => updateCustomerDraftField(field.key, inputEl.value));
    } else if (field.type === "tags") {
      inputEl = renderCustomerTagsField(field, cur);
    } else if (field.type === "number") {
      inputEl = document.createElement("input");
      inputEl.type = "number";
      inputEl.className = "org-input";
      inputEl.placeholder = `填入${field.label}…`;
      inputEl.value = cur ?? "";
      inputEl.addEventListener("input", () => updateCustomerDraftField(field.key, inputEl.value));
    } else if (field.type === "date") {
      inputEl = document.createElement("input");
      inputEl.type = "date";
      inputEl.className = "org-input";
      inputEl.value = cur || "";
      inputEl.addEventListener("input", () => updateCustomerDraftField(field.key, inputEl.value));
    } else if (field.type === "textarea") {
      inputEl = document.createElement("textarea");
      inputEl.className = "org-input org-textarea";
      inputEl.rows = 2;
      inputEl.placeholder = `填入${field.label}…`;
      inputEl.value = cur || "";
      inputEl.addEventListener("input", () => updateCustomerDraftField(field.key, inputEl.value));
    } else {
      inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.className = "org-input";
      inputEl.placeholder = `填入${field.label}…`;
      inputEl.value = cur || "";
      inputEl.addEventListener("input", () => updateCustomerDraftField(field.key, inputEl.value));
    }
    wrap.appendChild(inputEl);
    grid.appendChild(wrap);
  }
  host.appendChild(grid);
}

function setCustomerEditorVisible(visible) {
  const editor = document.getElementById("org-customer-editor");
  if (editor) editor.hidden = !visible;
}

function setEmployeeEditorVisible(visible) {
  const editor = document.getElementById("org-employee-editor");
  if (editor) editor.hidden = !visible;
}

function resetCustomerForm() {
  customerEditingId = null;
  customerDraft = {};
  renderCustomerForm();
  setCustomerEditorVisible(false);
}

function startCustomerEdit(customer) {
  customerEditingId = customer.id;
  customerDraft = { ...(customer.fields || {}) };
  renderCustomerForm();
  setCustomerEditorVisible(true);
  document.getElementById("org-customer-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openNewCustomerEditor() {
  customerEditingId = null;
  customerDraft = {};
  renderCustomerForm();
  setCustomerEditorVisible(true);
  document.getElementById("org-customer-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openNewEmployeeEditor() {
  setEmployeeEditorVisible(true);
  document.getElementById("org-employee-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadCompany() {
  try {
    const data = await fetch(apiUrl(`/org/company${industryQuery()}`)).then((r) => r.json());
    const c = data?.company || {};
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };
    set("org-company-name", c.name);
    set("org-company-short", c.shortName);
    set("org-company-owner", c.ownerName);
    set("org-company-phone", c.phone);
    set("org-company-website", c.website);
    set("org-company-address", c.address);
    set("org-company-notes", c.notes);
    renderModuleChecks("org-company-modules", c.moduleIds || []);
    // 公司信息完整度统计：6 项字段，按非空计数
    const fields = [c.name, c.shortName, c.ownerName, c.phone, c.website, c.address];
    const filled = fields.filter((v) => (v || "").toString().trim().length > 0).length;
    const percent = Math.round((filled / fields.length) * 100);
    const fillEl = document.getElementById("org-stat-company-fill");
    if (fillEl) fillEl.textContent = percent + "%";
  } catch {}
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function pickCustomerSummary(c) {
  const fields = c.fields || {};
  // 主显示名：displayName 优先，其次是 company_name / shop_name / contact_person
  const name = c.displayName
    || fields.company_name
    || fields.shop_name
    || fields.contact_person
    || c.id;
  const stage = fields.stage || "未分阶段";
  const contact = fields.contact_person ? `${fields.contact_person}` : "";
  const phone = fields.contact_phone ? ` · ${fields.contact_phone}` : "";
  const subParts = [stage];
  if (contact) subParts.push(contact + phone);
  if (c.industryName) subParts.push(`${c.industryIcon || ""} ${c.industryName}`.trim());
  if (c.updatedAt) subParts.push(fmtDate(c.updatedAt));
  return { name, sub: subParts.filter(Boolean).join(" · ") };
}

async function loadCustomers() {
  const host = document.getElementById("org-customer-list");
  if (!host) return;
  try {
    const data = await fetch(apiUrl(`/customers${industryQuery()}`)).then((r) => r.json());
    const rows = Array.isArray(data?.customers) ? data.customers : Array.isArray(data) ? data : [];
    const copy = objectCopy();
    const statEl = document.getElementById("org-stat-customer");
    if (statEl) statEl.textContent = String(rows.length);
    if (!rows.length) {
      host.innerHTML = `<div class="org-empty">${esc(copy.emptyList)}</div>`;
      return;
    }
    host.innerHTML = rows.slice(0, 60).map((r) => {
      const summary = pickCustomerSummary(r);
      return `<div class="org-row" data-customer-id="${esc(r.id)}">
        <div class="org-row-main">
          <div class="org-row-title">${esc(summary.name)}</div>
          <div class="org-row-sub">${esc(summary.sub)}</div>
        </div>
        <div class="org-row-actions">
          <button class="org-mini-btn" data-edit-customer="${esc(r.id)}">编辑</button>
          <button class="org-mini-btn" data-del-customer="${esc(r.id)}">删除</button>
        </div>
      </div>`;
    }).join("");
  } catch {
    host.innerHTML = `<div class="org-empty">${esc(objectCopy().loadFail)}</div>`;
  }
}

async function loadEmployees() {
  const host = document.getElementById("org-employee-list");
  if (!host) return;
  try {
    const data = await fetch(apiUrl(`/org/employees${industryQuery()}`)).then((r) => r.json());
    const rows = Array.isArray(data?.employees) ? data.employees : [];
    const statEl = document.getElementById("org-stat-employee");
    if (statEl) statEl.textContent = String(rows.length);
    if (!rows.length) {
      host.innerHTML = `<div class="org-empty">暂无员工，点击“新增员工”添加成员。</div>`;
      return;
    }
    host.innerHTML = rows.map((r) => `<div class="org-row">
      <div class="org-row-main">
        <div class="org-row-title">${esc(r.name)}${r.role ? ` · ${esc(r.role)}` : ""}</div>
        <div class="org-row-sub">${esc(r.phone || "未填电话")}${r.moduleIds?.length ? ` · ${esc(r.moduleIds.join("/"))}` : ""}</div>
      </div>
      <button class="org-mini-btn" data-del-employee="${esc(r.id)}">删除</button>
    </div>`).join("");
  } catch {
    host.innerHTML = `<div class="org-empty">员工加载失败</div>`;
  }
}

function bindTabs(root) {
  root.querySelectorAll(".org-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      root.querySelectorAll(".org-tab").forEach((b) => b.classList.toggle("active", b === tab));
      root.querySelectorAll(".org-pane").forEach((pane) => pane.classList.toggle("active", pane.dataset.pane === name));
    });
  });
  root.addEventListener("click", (e) => {
    const card = e.target.closest("[data-org-tab-jump]");
    if (!card || !root.contains(card)) return;
    setOrgActiveTab(root, card.dataset.orgTabJump);
  });
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest("[data-org-tab-jump]");
    if (!card || !root.contains(card)) return;
    e.preventDefault();
    setOrgActiveTab(root, card.dataset.orgTabJump);
  });
  document.addEventListener("click", (e) => {
    const card = e.target.closest("#org-overlay [data-org-tab-jump]");
    if (!card) return;
    setOrgActiveTab(root, card.dataset.orgTabJump);
  });
}

function setOrgActiveTab(root, tabName) {
  const name = tabName === "customer" || tabName === "employee" || tabName === "company" ? tabName : "company";
  const tab = root.querySelector(`.org-tab[data-tab="${name}"]`);
  if (tab) tab.click();
}

export function initOrgWorkspace() {
  const overlay = document.getElementById("org-overlay");
  const closeBtn = document.getElementById("org-close");
  const quickBtn = document.getElementById("org-btn");
  if (!overlay || !closeBtn) return;

  const open = async (ev) => {
    const tab = ev?.detail?.tab;
    if (typeof window !== "undefined" && typeof window.pulseSetView === "function") {
      window.pulseSetView("workspace");
    } else {
      overlay.hidden = false;
    }
    await loadIndustryPacks();
    applyWorkspaceCopy();
    // 重新打开时默认退出编辑态，并按当前行业重新渲染客户表单
    resetCustomerForm();
    await Promise.all([loadCompany(), loadCustomers(), loadEmployees()]);
    if (tab) setOrgActiveTab(overlay, tab);
  };
  const close = () => {
    if (typeof window !== "undefined" && typeof window.pulseSetView === "function") {
      window.pulseSetView("chat");
    } else {
      overlay.hidden = true;
    }
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  window.addEventListener("pulse:open-org-workspace", open);
  window.addEventListener("pulse:workspace-layout-ready", () => applyWorkspaceCopy());
  quickBtn?.addEventListener("click", open);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });
  bindTabs(overlay);

  document.getElementById("org-save-company")?.addEventListener("click", async () => {
    const body = {
      industryId: customerActiveIndustry?.id || "",
      name: document.getElementById("org-company-name")?.value || "",
      shortName: document.getElementById("org-company-short")?.value || "",
      ownerName: document.getElementById("org-company-owner")?.value || "",
      phone: document.getElementById("org-company-phone")?.value || "",
      website: document.getElementById("org-company-website")?.value || "",
      address: document.getElementById("org-company-address")?.value || "",
      notes: document.getElementById("org-company-notes")?.value || "",
      moduleIds: selectedModules("org-company-modules"),
    };
    try {
      await consumeQuota("company_knowledge", "公司知识库");
      const res = await fetch(apiUrl(`/org/company${industryQuery()}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "保存失败");
      showFeedback("org-company-feedback", "已保存");
      window.dispatchEvent(new CustomEvent("pulse:org-profile-changed"));
    } catch (e) {
      showFeedback("org-company-feedback", `保存失败：${e.message}`, true);
    }
  });

  document.getElementById("org-customer-new")?.addEventListener("click", () => {
    openNewCustomerEditor();
  });

  document.getElementById("org-customer-submit")?.addEventListener("click", async () => {
    if (!customerActiveIndustry) {
      showFeedback("org-customer-feedback", objectCopy().noIndustryError, true);
      return;
    }
    // 校验必填字段
    const fields = allCustomerFields();
    const missing = fields.filter((f) => f.required && (customerDraft[f.key] === undefined || customerDraft[f.key] === "" || (Array.isArray(customerDraft[f.key]) && customerDraft[f.key].length === 0)));
    if (missing.length) {
      showFeedback("org-customer-feedback", `请填写必填字段：${missing.map((f) => f.label).join("、")}`, true);
      return;
    }
    // 主显示名：优先取第一个 required text 字段的值；其次取 contact_person
    const nameField = fields.find((f) => f.required && f.type === "text");
    const displayName = (nameField ? customerDraft[nameField.key] : customerDraft.contact_person) || customerDraft.company_name || customerDraft.shop_name || "";
    const fieldLabels = {};
    for (const f of fields) fieldLabels[f.key] = f.label;

    const body = {
      id: customerEditingId || undefined,
      displayName,
      industryId: customerActiveIndustry.id || "",
      industryName: customerActiveIndustry.name || "",
      industryIcon: customerActiveIndustry.icon || "",
      setCurrent: true,
      fields: { ...customerDraft },
      fieldLabels,
    };
    try {
      if (!customerEditingId) {
        await consumeQuota("customer_crm", objectCopy().quotaName);
      }
      const res = await fetch(apiUrl(`/customers${industryQuery()}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "保存失败");
      showFeedback("org-customer-feedback", customerEditingId ? objectCopy().updatedMessage : objectCopy().savedMessage);
      resetCustomerForm();
      await loadCustomers();
      window.dispatchEvent(new CustomEvent("pulse:customer-saved", { detail: data.customer }));
      window.dispatchEvent(new CustomEvent("pulse:memories-changed"));
      window.dispatchEvent(new CustomEvent("pulse:customers-changed"));
    } catch (e) {
      showFeedback("org-customer-feedback", `保存失败：${e.message}`, true);
    }
  });

  document.getElementById("org-customer-cancel-edit")?.addEventListener("click", () => {
    resetCustomerForm();
    showFeedback("org-customer-feedback", "已收起");
  });

  document.getElementById("org-employee-new")?.addEventListener("click", () => {
    openNewEmployeeEditor();
  });

  document.getElementById("org-employee-cancel")?.addEventListener("click", () => {
    setEmployeeEditorVisible(false);
  });

  document.getElementById("org-add-employee")?.addEventListener("click", async () => {
    const name = (document.getElementById("org-employee-name")?.value || "").trim();
    if (!name) {
      showFeedback("org-employee-feedback", "员工姓名不能为空", true);
      return;
    }
    const body = {
      industryId: customerActiveIndustry?.id || "",
      name,
      role: document.getElementById("org-employee-role")?.value || "",
      phone: document.getElementById("org-employee-phone")?.value || "",
      email: document.getElementById("org-employee-email")?.value || "",
      notes: document.getElementById("org-employee-notes")?.value || "",
      moduleIds: selectedModules("org-employee-modules"),
    };
    try {
      const res = await fetch(apiUrl(`/org/employees${industryQuery()}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "添加失败");
      showFeedback("org-employee-feedback", "员工已添加");
      ["org-employee-name", "org-employee-role", "org-employee-phone", "org-employee-email", "org-employee-notes"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      renderModuleChecks("org-employee-modules", []);
      setEmployeeEditorVisible(false);
      await loadEmployees();
      window.dispatchEvent(new CustomEvent("pulse:org-profile-changed"));
    } catch (e) {
      showFeedback("org-employee-feedback", `添加失败：${e.message}`, true);
    }
  });

  overlay.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button");
    const row = ev.target.closest("[data-customer-id]");
    if (row && !btn) {
      const cid = row.dataset.customerId;
      if (cid) {
        try {
          const res = await fetch(apiUrl("/customer/current"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: cid }),
          });
          const data = await res.json();
          if (!res.ok || data?.ok === false) throw new Error(data?.error || "切换失败");
          showFeedback("org-customer-feedback", "已切换为当前客户，AI 已感知");
          window.dispatchEvent(new CustomEvent("pulse:customer-saved", { detail: data.customer }));
          window.dispatchEvent(new CustomEvent("pulse:customers-changed"));
        } catch (e) {
          showFeedback("org-customer-feedback", `切换失败：${e.message}`, true);
        }
      }
      return;
    }
    if (!btn) return;

    // 编辑客户
    const editId = btn.dataset.editCustomer;
    if (editId) {
      try {
        const data = await fetch(apiUrl(`/customers${industryQuery()}`)).then((r) => r.json());
        const rows = Array.isArray(data?.customers) ? data.customers : Array.isArray(data) ? data : [];
        const target = rows.find((r) => r.id === editId);
        if (target) startCustomerEdit(target);
      } catch {
        showFeedback("org-customer-feedback", "加载客户详情失败", true);
      }
      return;
    }

    if (btn.dataset.orgOpenCustomer !== undefined) {
      openNewCustomerEditor();
      return;
    }

    if (btn.dataset.orgOpenEmployee !== undefined) {
      openNewEmployeeEditor();
      return;
    }

    // 删除客户
    const cid = btn.dataset.delCustomer;
    if (cid) {
      if (!window.confirm("确定删除这位客户吗？这个操作不可恢复。")) return;
      try {
        await fetch(apiUrl(`/customers/${encodeURIComponent(cid)}${industryQuery()}`), { method: "DELETE" });
        if (customerEditingId === cid) resetCustomerForm();
        await loadCustomers();
        window.dispatchEvent(new CustomEvent("pulse:customers-changed"));
      } catch {}
      return;
    }

    // 删除员工
    const eid = btn.dataset.delEmployee;
    if (eid) {
      try {
        await fetch(apiUrl(`/org/employees/${encodeURIComponent(eid)}${industryQuery()}`), { method: "DELETE" });
        await loadEmployees();
        window.dispatchEvent(new CustomEvent("pulse:org-profile-changed"));
      } catch {}
    }
  });

  // 行业包切换后，资料台的客户表单要跟着重新渲染
  window.addEventListener("pulse:industry-changed", async () => {
    await loadIndustryPacks();
    resetCustomerForm();
    await Promise.all([loadCompany(), loadCustomers(), loadEmployees()]);
  });
}

