// 行业包前端逻辑：引导页 + 顶部切换器
import { API } from './api-client.js';
import { showInfo } from './toast.js';

let _state = null; // cached industry state

const INDUSTRY_GROUPS = [
  { id: 'sales_growth', title: '销售增长', desc: '线索、报价、跟进和成交推进' },
  { id: 'store_ops', title: '门店经营', desc: '会员、复购、活动和客诉处理' },
  { id: 'professional_services', title: '专业服务', desc: '资料、文书、记录和合规边界' },
];

function getPackGroupId(pack) {
  return String(pack?.category || 'sales_growth');
}

function groupPacks(packs = []) {
  const known = new Set(INDUSTRY_GROUPS.map(g => g.id));
  const groups = INDUSTRY_GROUPS
    .map(group => ({ ...group, packs: packs.filter(pack => getPackGroupId(pack) === group.id) }))
    .filter(group => group.packs.length);
  const otherPacks = packs.filter(pack => !known.has(getPackGroupId(pack)));
  if (otherPacks.length) {
    groups.push({ id: 'other', title: '更多行业', desc: '其他可扩展行业工作台', packs: otherPacks });
  }
  return groups;
}

export async function fetchIndustryState() {
  try {
    const res = await fetch(`${API}/industry`);
    const data = await res.json();
    if (data.ok) _state = data;
    return _state;
  } catch (e) {
    console.warn('[industry] fetch failed:', e.message);
    return _state;
  }
}

// ─── 引导页逻辑 ────────────────────────────────────────────
export async function initIndustryOnboarding() {
  const overlay = document.getElementById('industry-onboarding');
  if (overlay) overlay.hidden = true;
  try {
    await fetch(`${API}/industry/active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: null })
    });
    await fetch(`${API}/industry/onboarded`, { method: 'POST' });
  } catch {}
  const initialState = await fetchIndustryState();
  initSwitcher(initialState);
  return;

  // 绑定关闭按钮和 Esc 键
  const closeBtn = document.getElementById('ind-onboard-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      if (overlay) overlay.hidden = true;
      // 同时标记已引导，避免下次再弹
      try {
        await fetch(`${API}/industry/onboarded`, { method: 'POST' });
      } catch {}
      const fresh = await fetchIndustryState();
      initSwitcher(fresh);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && !overlay.hidden) {
      overlay.hidden = true;
      fetch(`${API}/industry/onboarded`, { method: 'POST' }).catch(() => {});
    }
  });

  const state = await fetchIndustryState();
  if (!state || state.onboarded) {
    // 已完成引导，直接初始化切换器
    initSwitcher(state);
    return;
  }
  showOnboarding(state);
}

function showOnboarding(state) {
  const overlay = document.getElementById('industry-onboarding');
  if (!overlay) return;
  overlay.hidden = false;

  // 清除旧监听器（克隆替换所有 data-action 按钮）
  overlay.querySelectorAll('[data-action]').forEach(btn => {
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
  });

  const steps = overlay.querySelectorAll('.ind-step');
  const dots = overlay.querySelectorAll('.ind-dot');
  const grid = document.getElementById('ind-pack-grid');
  let currentStep = 0;
  const selected = new Set();
  let casualMode = false;

  // 重置到第一步
  steps.forEach((s, i) => s.hidden = i !== 0);
  dots.forEach((d, i) => d.classList.toggle('active', i === 0));

  // 渲染行业卡片
  if (grid && state.allPacks) {
    grid.innerHTML = '';
    const casualSection = document.createElement('section');
    casualSection.className = 'ind-pack-group';
    casualSection.innerHTML = `
      <div class="ind-pack-group-head">
        <div class="ind-pack-group-title">通用模式</div>
        <div class="ind-pack-group-desc">不绑定行业，先轻松聊天</div>
      </div>
      <div class="ind-pack-group-grid">
        <div class="ind-pack-card" data-id="">
          <div class="ipc-icon">💬</div>
          <div class="ipc-name">闲聊模式</div>
          <div class="ipc-tag">直接进入通用对话，之后可在设置里再选择行业。</div>
        </div>
      </div>
    `;
    const casualCard = casualSection.querySelector('.ind-pack-card');
    casualCard?.addEventListener('click', () => {
      casualMode = true;
      selected.clear();
      grid.querySelectorAll('.ind-pack-card.selected').forEach(card => card.classList.remove('selected'));
      casualCard.classList.add('selected');
      const confirmBtn = steps[1]?.querySelector('[data-action="next"]');
      if (confirmBtn) confirmBtn.disabled = false;
    });
    grid.appendChild(casualSection);
    for (const group of groupPacks(state.allPacks)) {
      const section = document.createElement('section');
      section.className = 'ind-pack-group';
      section.innerHTML = `
        <div class="ind-pack-group-head">
          <div class="ind-pack-group-title">${group.title}</div>
          <div class="ind-pack-group-desc">${group.desc}</div>
        </div>
        <div class="ind-pack-group-grid"></div>
      `;
      const groupGrid = section.querySelector('.ind-pack-group-grid');
      for (const pack of group.packs) {
        const card = document.createElement('div');
        card.className = 'ind-pack-card';
        card.dataset.id = pack.id;
        card.innerHTML = `
          <div class="ipc-icon">${pack.icon}</div>
          <div class="ipc-name">${pack.name}</div>
          <div class="ipc-tag">${pack.tagline}</div>
        `;
        card.addEventListener('click', () => {
          casualMode = false;
          casualCard?.classList.remove('selected');
          if (selected.has(pack.id)) {
            selected.delete(pack.id);
            card.classList.remove('selected');
          } else {
            selected.add(pack.id);
            card.classList.add('selected');
          }
          // 启用/禁用确认按钮
          const confirmBtn = steps[1]?.querySelector('[data-action="next"]');
          if (confirmBtn) confirmBtn.disabled = selected.size === 0;
        });
        groupGrid.appendChild(card);
      }
      grid.appendChild(section);
    }
  }

  function goToStep(n) {
    steps.forEach((s, i) => s.hidden = i !== n);
    dots.forEach((d, i) => d.classList.toggle('active', i === n));
    currentStep = n;
  }

  // 按钮事件
  overlay.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      if (action === 'next') {
        if (currentStep === 0) {
          goToStep(1);
        } else if (currentStep === 1) {
          // 提交选择
          btn.disabled = true;
          btn.textContent = '保存中…';
          const ids = casualMode ? [] : [...selected];
          try {
            await fetch(`${API}/industry/enabled`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids })
            });
            await fetch(`${API}/industry/active`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: ids[0] || null })
            });
            await fetch(`${API}/industry/onboarded`, { method: 'POST' });
          } catch (e) {
            console.error('[industry] save failed:', e);
          }
          // 更新完成文案
          const finishText = document.getElementById('ind-finish-text');
          const activePack = state.allPacks.find(p => p.id === ids[0]);
          if (finishText && activePack) {
            finishText.textContent = `已切换为「${activePack.icon} ${activePack.name}」专属模式，随时可在顶部切换。`;
          } else if (finishText) {
            finishText.textContent = '已进入闲聊模式，未绑定行业工作台。之后可在设置里再选择行业。';
          }
          goToStep(2);
        }
      } else if (action === 'finish') {
        overlay.hidden = true;
        const freshState = await fetchIndustryState();
        initSwitcher(freshState);
      }
    });
  });
}

// ─── 行业视觉强化（标签 + 主题色） ──────────────────────────
const DEFAULT_ASSISTANT_TITLE = 'AI 助手';
// 用户是否手动改过助手名（改过就不再被行业切换覆盖）
const STORAGE_AGENT_NAME_USERSET = 'pulse-agent-name-userset';

function applyAssistantIdentity(pack) {
  const eyebrow = document.querySelector('#panel-l1 .panel-identity .eyebrow');
  if (eyebrow) {
    eyebrow.textContent = pack?.assistantTitle || DEFAULT_ASSISTANT_TITLE;
  }
}

const AGENT_DEFAULT_FALLBACK = 'Pulse';
// 当前 agent_name 是否"看起来像可被行业自动覆盖"的名字：
// - 等于默认（Pulse）
// - 形如 "X助手"（之前某次行业切换自动同步出来的）
function looksLikeAutoAgentName(name) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (n === AGENT_DEFAULT_FALLBACK) return true;
  if (/^.{1,8}助手$/.test(n)) return true;
  return false;
}

async function getCurrentAgentName() {
  try {
    const res = await fetch(`${API}/agent-profile`);
    if (!res.ok) return '';
    const data = await res.json();
    return String(data?.name || '').trim();
  } catch {
    return '';
  }
}

// 行业切换 → 自动给助手起一个对应的名字（"电商助手"/"科技助手"）
// 规则：
// 1) 若用户曾手动改过助手名（localStorage userset = 1），不覆盖；
// 2) 若当前名字不符合"可自动覆盖"的形态（不是 Pulse、也不是 X助手），不覆盖；
// 3) 否则把助手名写成 `${pack.name}助手`，并 POST 到后端持久化。
async function syncAgentNameForPack(pack) {
  if (!pack) return;
  try {
    if (localStorage.getItem(STORAGE_AGENT_NAME_USERSET) === '1') return;
  } catch {}
  const next = String(pack.assistantName || `${pack.name || ''}助手`).trim();
  if (!next || next === '助手') return;

  const current = await getCurrentAgentName();
  if (current === next) return;
  if (!looksLikeAutoAgentName(current)) return;

  try {
    await fetch(`${API}/agent-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: next }),
    });
    // 后端会通过 SSE agent_name_updated 通知前端 setAgentName，这里不必再手动调
  } catch (e) {
    console.warn('[industry] sync agent name failed:', e?.message);
  }
}

// 暴露给设置/重命名入口：用户手动改名后调用，标记不再被行业覆盖
export function markAgentNameAsUserSet() {
  try { localStorage.setItem(STORAGE_AGENT_NAME_USERSET, '1'); } catch {}
}
// 暴露给"恢复行业默认"入口（如设置里有按钮的话）
export function clearAgentNameUserSetFlag() {
  try { localStorage.removeItem(STORAGE_AGENT_NAME_USERSET); } catch {}
}

function applyIndustryTheme(state) {
  const pack = state?.activePack;
  const badge = document.getElementById('ind-badge');
  const badgeIcon = document.getElementById('ind-badge-icon');
  const badgeLabel = document.getElementById('ind-badge-label');
  const root = document.body;

  if (!pack) {
    if (badge) badge.hidden = true;
    root.removeAttribute('data-industry-theme');
    root.style.removeProperty('--ind-primary');
    root.style.removeProperty('--ind-glow');
    root.style.removeProperty('--ind-bg-tint');
    applyAssistantIdentity(null);
    return;
  }

  // 左侧面板标签
  if (badge) {
    badge.hidden = false;
    if (badgeIcon) badgeIcon.textContent = pack.icon || '';
    if (badgeLabel) badgeLabel.textContent = pack.assistantTitle || `${pack.name}模式`;
  }

  applyAssistantIdentity(pack);

  // 主题色
  const tc = pack.themeColor;
  if (tc?.primary) {
    root.setAttribute('data-industry-theme', pack.id);
    root.style.setProperty('--ind-primary', tc.primary);
    root.style.setProperty('--ind-glow', tc.glow || `${tc.primary}2e`);
    root.style.setProperty('--ind-bg-tint', tc.bg_tint || 'transparent');
  } else {
    root.removeAttribute('data-industry-theme');
  }
}

// ─── 顶部切换器逻辑 ─────────────────────────────────────────
let _switcherInitialized = false;
function initSwitcher(state) {
  const switcher = document.getElementById('nb-industry-switcher');
  if (!switcher || !state) return;

  const enabled = state.enabled || [];

  // 顶部的「行业切换」按钮已下线（避免误触切换工作区）。
  // 行业切换统一在「设置 → 行业」里进行。这里只更新隐藏元素里的文案/主题，
  // 让别处依赖 #nb-ind-name 等 DOM 的代码（如客户列表 chip）继续工作。
  switcher.hidden = true;
  updateSwitcherDisplay(state);
  applyIndustryTheme(state);
  // 启动 / 行业初始化时，按规则同步一次助手名（用户手动改过 / 自定义名不会被覆盖）
  syncAgentNameForPack(state.activePack);

  // 仅绑定一次事件，避免重复初始化导致监听器叠加
  if (_switcherInitialized) return;
  _switcherInitialized = true;

  const btn = document.getElementById('nb-ind-btn');
  const dropdown = document.getElementById('nb-ind-dropdown');

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    // 每次开关用当前 _state（而非闭包里的旧 state）
    dropdown.hidden = !dropdown.hidden;
    if (!dropdown.hidden) renderDropdown(_state || state);
  });

  // 点击 dropdown 内部不冒泡（防止点到 padding 误关）
  dropdown?.addEventListener('click', (e) => e.stopPropagation());

  // 点击外部时关闭 —— 用 target 检查代替全局监听
  document.addEventListener('click', (e) => {
    if (!dropdown || dropdown.hidden) return;
    if (switcher.contains(e.target)) return;
    dropdown.hidden = true;
  });
}

function updateSwitcherDisplay(state) {
  const iconEl = document.getElementById('nb-ind-icon');
  const nameEl = document.getElementById('nb-ind-name');
  const btn = document.getElementById('nb-ind-btn');
  const activePack = state.activePack;
  if (iconEl) iconEl.textContent = activePack?.icon || '🏢';
  if (nameEl) nameEl.textContent = activePack?.name || '闲聊';
  const stats = state.stats || {};
  const statText = `客户 ${stats.customerCount ?? 0} · 记忆 ${stats.memoryCount ?? 0} · 知识 ${stats.knowledgeCount ?? 0}`;
  if (btn) btn.title = activePack
    ? `当前工作区：${activePack.name}。${statText}。客户、记忆、知识会按该行业隔离。`
    : '当前为闲聊模式。未绑定行业工作区。';
}

function renderDropdown(state) {
  const dropdown = document.getElementById('nb-ind-dropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';
  const enabled = state.enabled || [];
  const packs = state.allPacks || [];

  const header = document.createElement('div');
  header.className = 'nb-ind-dropdown-head';
  const stats = state.stats || {};
  header.innerHTML = `
    <div class="nb-ind-dropdown-title">切换行业工作区</div>
    <div class="nb-ind-dropdown-sub">客户、记忆、知识文件会跟随当前行业隔离。</div>
    <div class="nb-ind-dropdown-sub">当前：${stats.customerCount ?? 0} 个客户 · ${stats.memoryCount ?? 0} 条记忆 · ${stats.knowledgeCount ?? 0} 个知识文件</div>
  `;
  dropdown.appendChild(header);

  for (const pack of packs) {
    const isEnabled = enabled.includes(pack.id);
    const item = document.createElement('button');
    item.className = 'nb-ind-item' + (state.active === pack.id ? ' active' : '');
    item.innerHTML = `
      <span class="nb-ind-item-icon">${pack.icon}</span>
      <span class="nb-ind-item-copy">
        <span class="nb-ind-item-name">${pack.name}</span>
        <span class="nb-ind-item-sub">${pack.tagline || '专属客户、记忆与知识'} · ${pack.knowledgeCount || 0} 个知识文件</span>
      </span>
      ${state.active === pack.id ? '<span class="ind-check">✓</span>' : (isEnabled ? '' : '<span class="ind-check" style="opacity:.45;font-size:11px;">未启用</span>')}
    `;
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      dropdown.hidden = true;
      try {
        if (!isEnabled) {
          const nextEnabled = Array.from(new Set([...enabled, pack.id]));
          await fetch(`${API}/industry/enabled`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: nextEnabled })
          });
        }
        const res = await fetch(`${API}/industry/active`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: pack.id })
        });
        const data = await res.json();
        if (data.ok) {
          _state = data;
          updateSwitcherDisplay(data);
          applyIndustryTheme(data);
          window.dispatchEvent(new CustomEvent('pulse:industry-changed', { detail: data }));
          const stats = data.stats || {};
          showInfo(`${data.activePack?.icon || '🏢'} ${data.activePack?.name || '行业'}工作台已就绪`, [
            `客户 ${stats.customerCount ?? 0} · 记忆 ${stats.memoryCount ?? 0} · 知识 ${stats.knowledgeCount ?? 0}`,
            '客户、记忆、知识、会话和热点已按当前行业切换',
          ], 4200);
          // 行业切换后，按规则同步助手名（用户手动改过的话不会覆盖）
          syncAgentNameForPack(data.activePack);
        }
      } catch (e) {
        console.error('[industry] switch failed:', e);
      }
    });
    dropdown.appendChild(item);
  }

  // 分隔线 + 重新选择行业入口
  const divider = document.createElement('div');
  divider.style.cssText = 'border-top: 1px solid rgba(143,182,216,0.15); margin: 4px 0;';
  dropdown.appendChild(divider);

  const resetItem = document.createElement('button');
  resetItem.className = 'nb-ind-item';
  resetItem.innerHTML = '<span>⚙️</span><span>重新选择行业…</span>';
  resetItem.addEventListener('click', async (e) => {
    e.stopPropagation();
    dropdown.hidden = true;
    // 重置 onboarded 标记并显示引导
    try {
      await fetch(`${API}/industry/onboarded`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: false })
      });
    } catch (err) {
      console.warn('[industry] reset failed:', err.message);
    }
    const fresh = await fetchIndustryState();
    showOnboarding(fresh);
  });
  dropdown.appendChild(resetItem);
}
