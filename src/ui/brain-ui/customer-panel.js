// 当前客户面板 — 根据当前行业渲染表单字段，本地保存草稿与客户列表
import { API } from './api-client.js';

const STORAGE_KEY = 'pulse_current_customer_v1';
const SAVED_KEY = 'pulse_saved_customers_v1';

let _fields = [];          // 当前行业的 customerFields
let _industryId = '';
let _industryName = '';    // 当前行业名（用于提示文案）
let _industryIcon = '';
let _objectLabels = {};
let _draft = {};           // 当前草稿数据 { fieldKey: value }

function currentObjectLabels() {
  return {
    singular: _objectLabels.singular || '客户',
    current: _objectLabels.current || `当前客户${_industryName ? '（' + _industryName + '）' : ''}`,
    save: _objectLabels.save || '保存为客户',
    clearConfirm: _objectLabels.clearConfirm || '确定清空当前客户草稿？',
  };
}

export async function initCustomerPanel() {
  const toggle = document.getElementById('cust-toggle');
  const panel = document.getElementById('cust-panel');
  const body = document.getElementById('cust-body');
  if (!toggle || !panel || !body) return;

  // 加载当前行业字段
  await loadIndustryFields();

  // 加载草稿
  loadDraft();
  renderForm();
  updateObjectCopy();
  updateToggleSummary();

  // 折叠/展开
  toggle.addEventListener('click', () => {
    const expanded = panel.classList.toggle('expanded');
    body.hidden = !expanded;
  });

  // 清空
  document.getElementById('cust-clear')?.addEventListener('click', () => {
    if (Object.keys(_draft).length === 0) return;
    if (!confirm(currentObjectLabels().clearConfirm)) return;
    _draft = {};
    saveDraft();
    renderForm();
    updateToggleSummary();
  });

  // 保存为客户
  document.getElementById('cust-save')?.addEventListener('click', () => {
    saveAsCustomer();
  });

  // 监听行业切换事件 —— 切换到对应行业的草稿
  window.addEventListener('pulse:industry-changed', async () => {
    await loadIndustryFields();
    loadDraft();
    renderForm();
    updateObjectCopy();
    updateToggleSummary();
    // 通知后端取消当前客户绑定
    try {
      await fetch(`${API}/customer/current`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: null })
      });
    } catch {}
  });
}

async function loadIndustryFields() {
  try {
    const res = await fetch(`${API}/industry`);
    const data = await res.json();
    const pack = data?.activePack;
    if (pack) {
      _fields = pack.customerFields || [];
      _industryId = pack.id || '';
      _industryName = pack.name || '';
      _industryIcon = pack.icon || '';
      _objectLabels = pack.objectLabels || {};
    } else {
      _fields = [];
      _industryId = '';
      _industryName = '';
      _industryIcon = '';
      _objectLabels = {};
    }
  } catch (e) {
    console.warn('[customer-panel] 加载行业字段失败:', e.message);
    _fields = [];
    _industryId = '';
    _objectLabels = {};
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${_industryId || 'global'}`);
    _draft = raw ? JSON.parse(raw) : {};
  } catch {
    _draft = {};
  }
}

function saveDraft() {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${_industryId || 'global'}`, JSON.stringify(_draft));
  } catch {}
}

function renderForm() {
  const formEl = document.getElementById('cust-form');
  if (!formEl) return;
  formEl.innerHTML = '';

  if (_fields.length === 0) {
    formEl.innerHTML = `<div class="cust-empty-hint">尚未选择行业。请先在顶部切换器选择行业。</div>`;
    return;
  }

  for (const field of _fields) {
    const wrap = document.createElement('div');
    wrap.className = 'cust-field';

    const label = document.createElement('label');
    label.className = 'cust-label';
    label.innerHTML = `${escapeHtml(field.label)}${field.required ? '<span class="cust-required">*</span>' : ''}`;
    wrap.appendChild(label);

    let inputEl;
    if (field.type === 'select') {
      inputEl = document.createElement('select');
      inputEl.className = 'cust-select';
      inputEl.innerHTML = `<option value="">— 请选择 —</option>` +
        (field.options || []).map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('');
      inputEl.value = _draft[field.key] || '';
      inputEl.addEventListener('change', () => updateField(field.key, inputEl.value));
    } else if (field.type === 'tags') {
      inputEl = renderTagsInput(field);
    } else if (field.type === 'number') {
      inputEl = document.createElement('input');
      inputEl.type = 'number';
      inputEl.className = 'cust-input';
      inputEl.placeholder = `填入 ${field.label}…`;
      inputEl.value = _draft[field.key] ?? '';
      inputEl.addEventListener('input', () => updateField(field.key, inputEl.value));
    } else {
      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'cust-input';
      inputEl.placeholder = `填入 ${field.label}…`;
      inputEl.value = _draft[field.key] || '';
      inputEl.addEventListener('input', () => updateField(field.key, inputEl.value));
    }
    wrap.appendChild(inputEl);
    formEl.appendChild(wrap);
  }
}

function renderTagsInput(field) {
  const wrap = document.createElement('div');
  wrap.className = 'cust-tags';
  const current = Array.isArray(_draft[field.key]) ? [..._draft[field.key]] : [];

  if (Array.isArray(field.options) && field.options.length) {
    // 预设选项：点击 toggle
    for (const opt of field.options) {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'cust-tag' + (current.includes(opt) ? ' active' : '');
      tag.textContent = opt;
      tag.addEventListener('click', () => {
        if (current.includes(opt)) {
          const idx = current.indexOf(opt);
          current.splice(idx, 1);
          tag.classList.remove('active');
        } else {
          current.push(opt);
          tag.classList.add('active');
        }
        updateField(field.key, [...current]);
      });
      wrap.appendChild(tag);
    }
  } else {
    // 自由输入：当前 tag 列表 + 输入框（回车添加）
    const renderTags = () => {
      // 移除现有的 tag
      wrap.querySelectorAll('.cust-tag').forEach(el => el.remove());
      for (const t of current) {
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = 'cust-tag active';
        tag.textContent = t + ' ×';
        tag.addEventListener('click', () => {
          const idx = current.indexOf(t);
          if (idx >= 0) current.splice(idx, 1);
          updateField(field.key, [...current]);
          renderTags();
        });
        wrap.insertBefore(tag, input);
      }
    };
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cust-tag-input';
    input.placeholder = '输入后回车添加…';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        const v = input.value.trim();
        if (!current.includes(v)) current.push(v);
        updateField(field.key, [...current]);
        input.value = '';
        renderTags();
      }
    });
    wrap.appendChild(input);
    renderTags();
  }
  return wrap;
}

function updateField(key, value) {
  if (value === '' || value === null || (Array.isArray(value) && value.length === 0)) {
    delete _draft[key];
  } else {
    _draft[key] = value;
  }
  saveDraft();
  updateToggleSummary();
}

function updateToggleSummary() {
  const labelEl = document.getElementById('cust-toggle-label');
  const stageEl = document.getElementById('cust-toggle-stage');
  const iconEl = document.querySelector('.cust-toggle-icon');
  if (!labelEl || !stageEl) return;

  // 主名 = 第一个 required 字段（如 公司名/店铺名）的值
  const nameField = _fields.find(f => f.required && f.type === 'text');
  const stageField = _fields.find(f => f.key === 'stage' || f.label === '跟进阶段');

  const name = nameField ? _draft[nameField.key] : null;
  const stage = stageField ? _draft[stageField.key] : null;

  if (name) {
    labelEl.textContent = name;
    iconEl.textContent = _industryIcon || '👤';
  } else {
    labelEl.textContent = currentObjectLabels().current;
    iconEl.textContent = '👤';
  }

  if (stage) {
    stageEl.textContent = `· ${stage}`;
  } else {
    stageEl.textContent = '';
  }
}

function updateObjectCopy() {
  const labels = currentObjectLabels();
  const saveBtn = document.getElementById('cust-save');
  if (saveBtn) saveBtn.textContent = `💾 ${labels.save}`;
}

async function saveAsCustomer() {
  // 校验 required
  const missing = _fields.filter(f => f.required && !_draft[f.key]);
  if (missing.length) {
    alert('请填写必填字段：' + missing.map(f => f.label).join('、'));
    return;
  }

  // 构造 fieldLabels 映射，便于后端格式化给 AI
  const fieldLabels = {};
  for (const f of _fields) fieldLabels[f.key] = f.label;

  // 主显示名：第一个 required text 字段
  const nameField = _fields.find(f => f.required && f.type === 'text');
  const displayName = nameField ? _draft[nameField.key] : '';

  const btn = document.getElementById('cust-save');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }

  try {
    const res = await fetch(`${API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        industryId: _industryId,
        industryName: _industryName,
        industryIcon: _industryIcon,
        fields: { ..._draft },
        fieldLabels,
        displayName,
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '保存失败');

    if (btn) btn.textContent = `✓ 已保存，AI 已感知`;
    setTimeout(() => {
      if (btn) {
        btn.textContent = origText;
        btn.disabled = false;
      }
    }, 1800);

    // 不清空草稿 —— 保留，因为这是"当前正在跟进的客户"
    // 但通知一下其他模块
    window.dispatchEvent(new CustomEvent('pulse:customer-saved', { detail: data.customer }));
    window.dispatchEvent(new CustomEvent('pulse:customers-changed'));
  } catch (e) {
    console.error('[customer-panel] save failed:', e);
    if (btn) {
      btn.textContent = '✗ 保存失败';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = origText; }, 1800);
    }
  }
}

// 给外部用：返回当前草稿（可作为对话上下文）
export function getCurrentCustomerDraft() {
  return { ..._draft };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
