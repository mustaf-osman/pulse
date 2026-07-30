// 行业话术模板浮窗
import { API } from './api-client.js';

let _prompts = [];
let _industry = null;
let _activeTab = '全部';
let _detailMode = false;

export async function initIndustryPrompts() {
  const btn = document.getElementById('prompts-btn');
  const popover = document.getElementById('prompts-popover');
  if (!btn || !popover) return;

  // 切换浮窗显隐
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!popover.hidden) {
      popover.hidden = true;
      return;
    }
    await loadPrompts();
    showList();
    popover.hidden = false;
  });

  // 关闭按钮
  document.getElementById('pp-close')?.addEventListener('click', () => {
    popover.hidden = true;
  });

  // 点击外部关闭
  document.addEventListener('click', (e) => {
    if (popover.hidden) return;
    if (popover.contains(e.target)) return;
    if (e.target === btn) return;
    popover.hidden = true;
  });

  // 返回列表
  document.getElementById('pp-back')?.addEventListener('click', () => {
    showList();
  });
}

async function loadPrompts() {
  try {
    const res = await fetch(`${API}/industry/prompts`);
    const data = await res.json();
    if (data.ok) {
      _prompts = data.prompts || [];
      _industry = data.industry;
      // 标题更新
      const titleEl = document.getElementById('pp-title');
      if (titleEl && _industry) {
        titleEl.textContent = `${_industry.icon} ${_industry.name}话术`;
      }
    }
  } catch (e) {
    console.warn('[prompts] load failed:', e.message);
  }
}

function getCategories() {
  const cats = ['全部', ...new Set(_prompts.map(p => p.category).filter(Boolean))];
  return cats;
}

function showList() {
  _detailMode = false;
  document.getElementById('pp-detail').hidden = true;
  document.getElementById('pp-list').hidden = false;
  document.getElementById('pp-tabs').hidden = false;
  renderTabs();
  renderList();
}

function renderTabs() {
  const tabsEl = document.getElementById('pp-tabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  for (const cat of getCategories()) {
    const tab = document.createElement('button');
    tab.className = 'pp-tab' + (cat === _activeTab ? ' active' : '');
    tab.textContent = cat;
    tab.addEventListener('click', () => {
      _activeTab = cat;
      renderTabs();
      renderList();
    });
    tabsEl.appendChild(tab);
  }
}

function renderList() {
  const listEl = document.getElementById('pp-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  const filtered = _activeTab === '全部'
    ? _prompts
    : _prompts.filter(p => p.category === _activeTab);

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="pp-empty">当前行业暂无话术模板，请先在顶部切换器选择行业。</div>';
    return;
  }

  for (const prompt of filtered) {
    const item = document.createElement('div');
    item.className = 'pp-item';
    item.innerHTML = `
      <div class="pp-item-title">${escapeHtml(prompt.title)}</div>
      <div class="pp-item-preview">${escapeHtml(prompt.template)}</div>
    `;
    item.addEventListener('click', () => showDetail(prompt));
    listEl.appendChild(item);
  }
}

function showDetail(prompt) {
  _detailMode = true;
  document.getElementById('pp-list').hidden = true;
  document.getElementById('pp-tabs').hidden = true;
  document.getElementById('pp-detail').hidden = false;

  document.getElementById('pp-detail-title').textContent = prompt.title;
  document.getElementById('pp-detail-cat').textContent = prompt.category || '';

  // 渲染变量输入
  const varsEl = document.getElementById('pp-vars');
  varsEl.innerHTML = '';
  const varValues = {};
  for (const v of (prompt.vars || [])) {
    const row = document.createElement('div');
    row.className = 'pp-var-row';
    row.innerHTML = `
      <label class="pp-var-label">${escapeHtml(v)}</label>
      <input class="pp-var-input" data-var="${escapeHtml(v)}" placeholder="填入 ${escapeHtml(v)}…">
    `;
    varsEl.appendChild(row);
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      varValues[v] = input.value;
      updatePreview(prompt, varValues);
    });
    varValues[v] = '';
  }

  updatePreview(prompt, varValues);

  // 按钮事件
  const previewEl = document.getElementById('pp-preview');
  document.getElementById('pp-insert').onclick = () => {
    const msgInput = document.getElementById('msg-input');
    if (msgInput) {
      msgInput.value = previewEl.value;
      msgInput.focus();
    }
    document.getElementById('prompts-popover').hidden = true;
  };
  document.getElementById('pp-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(previewEl.value);
      const btn = document.getElementById('pp-copy');
      const orig = btn.textContent;
      btn.textContent = '✓ 已复制';
      setTimeout(() => { btn.textContent = orig; }, 1200);
    } catch (e) {
      console.warn('[prompts] copy failed:', e);
    }
  };
}

function updatePreview(prompt, varValues) {
  let text = prompt.template || '';
  for (const v of (prompt.vars || [])) {
    const val = varValues[v] || `{{${v}}}`;
    text = text.replaceAll(`{{${v}}}`, val);
  }
  const previewEl = document.getElementById('pp-preview');
  if (previewEl) previewEl.value = text;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
