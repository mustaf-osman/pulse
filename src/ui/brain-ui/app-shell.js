import { createHotspotPanel } from './hotspot-panel.js';
import { createPersonCardPanel } from './person-card-panel.js';
import { createDocPanel } from './doc-panel.js';

const createVoicePanel = () => `
<div class="voice-panel composer-voice-panel" id="voice-panel">
  <canvas id="voice-canvas" width="320" height="44"></canvas>
  <div class="voice-transcript" id="voice-transcript"></div>
</div>
`;

const createGraphStage = () => `
<div class="grid-overlay"></div>
<svg id="graph" aria-label="Pulse memory graph"></svg>
`;

const createPrimaryPanel = () => `
<aside id="panel-l1" class="panel">
  <header class="panel-identity">
    <div class="brand-mark"></div>
    <div class="brand-copy">
      <div class="eyebrow">AI 助手</div>
      <div class="brand-title" id="agent-brand-name">Nimo 提醒助手</div>
    </div>
    <button class="video-btn" id="video-btn" title="视频模式 (V)" type="button" hidden>⊞</button>
    <button class="music-btn" id="music-btn" title="音乐模式 (M)" type="button" hidden>♪</button>
    <button class="org-btn" id="org-btn" title="高级资料台" type="button" hidden>⌂</button>
    <button class="settings-btn" id="settings-btn" title="设置" type="button">⚙</button>
  </header>

  <div class="ind-badge" id="ind-badge" hidden>
    <span id="ind-badge-icon"></span>
    <span id="ind-badge-label"></span>
  </div>

  <div class="stream-meta">
    <div>
      <div class="stream-title-text">提醒服务</div>
      <!-- <div class="stream-subtitle">user message · react</div> -->
    </div>
    <span class="pill" id="pill-l1">LIVE</span>
  </div>

  <div class="legend" id="legend"></div>

  <div class="stream">
    <div class="stream-inner" id="si-l1"></div>
  </div>
</aside>
`;

const createSecondaryPanel = () => `
<aside id="panel-l2" class="panel">
  <header class="panel-stats workspace-overview">
    <div class="workspace-overview-main">
      <div class="workspace-overview-kicker">当前提醒服务</div>
      <div class="workspace-overview-title" id="workspace-overview-title">Nimo 提醒中心</div>
      <div class="workspace-overview-sub" id="workspace-overview-sub">面向客户、老师、门店和个人场景，统一管理备忘、待办、设备与多端提醒。</div>
    </div>
    <div class="workspace-overview-status" id="workspace-overview-status">已就绪</div>
    <!-- 隐藏占位：开发指标，由设置→开发 tab 控制是否曝光 -->
    <div class="stat dev-only" hidden>
      <span class="stat-label">在线时长</span>
      <div class="stat-value" id="uptime-display">0s</div>
    </div>
    <div class="stat dev-only" hidden>
      <span class="stat-label">tok/s</span>
      <div class="stat-value" id="tok-rate">—</div>
    </div>
  </header>

  <!-- 业务区：由 biz-board.js 渲染 -->
  <section class="biz-board" id="biz-board"></section>

  <!-- AI 工作台（默认折叠） -->
  <section class="ai-workbench" id="ai-workbench" data-collapsed="1">
    <button type="button" class="ai-workbench-toggle" id="ai-workbench-toggle" aria-expanded="false">
      <span class="aw-dot" id="aw-state-dot"></span>
      <span class="aw-label">AI 状态</span>
      <span class="aw-status" id="aw-state-text">空闲</span>
      <span class="aw-chevron" id="aw-chevron">展开 ▾</span>
    </button>
    <div class="ai-workbench-body" id="ai-workbench-body" hidden>
      <div class="stream-meta">
        <div>
          <div class="stream-title-text">AI 后台整理</div>
          <div class="stream-subtitle">自动整理 · 到点提醒 · 多端同步</div>
        </div>
        <span class="pill pill-warm" id="pill-l2">处理中</span>
      </div>
      <div class="stream">
        <div class="stream-inner" id="si-l2"></div>
      </div>
    </div>
  </section>
</aside>
`;

const createConsole = () => `
<section class="console" id="chat-area">
  <div class="chat-context-row" id="chat-context-row">
    <!-- 当前客户面板（折叠条 + 可展开表单） -->
    <div class="cust-panel" id="cust-panel">
      <button class="cust-toggle" id="cust-toggle" type="button">
        <span class="cust-toggle-icon">👤</span>
        <span class="cust-toggle-label" id="cust-toggle-label">当前客户</span>
        <span class="cust-toggle-stage" id="cust-toggle-stage"></span>
        <span class="cust-toggle-chevron" id="cust-toggle-chevron">▾</span>
      </button>
      <div class="cust-body" id="cust-body" hidden>
        <div class="cust-form" id="cust-form">
          <!-- 字段动态填充 -->
        </div>
        <div class="cust-actions">
          <button class="cust-btn cust-btn-clear" id="cust-clear" type="button">🗑 清空</button>
          <button class="cust-btn cust-btn-save" id="cust-save" type="button">💾 保存为客户</button>
        </div>
      </div>
    </div>

    <div class="industry-dashboard" id="industry-dashboard" hidden></div>
  </div>

  <div class="thread-entry-wrap" id="chat-thread-bar">
    <div class="thread-picker" id="thread-picker">
      <button type="button" class="thread-entry-btn" id="thread-picker-toggle" aria-expanded="false" aria-haspopup="listbox" title="切换 / 新建 / 重命名会话">
        <svg class="thread-entry-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
        <span class="thread-entry-name" id="thread-picker-label">主会话</span>
        <span class="thread-entry-chev" aria-hidden="true">▾</span>
      </button>
      <div class="thread-picker-popover" id="thread-picker-popover" hidden role="dialog" aria-label="会话管理">
        <header class="thread-picker-head">
          <div class="thread-picker-title">会话</div>
          <button type="button" class="thread-picker-close" id="thread-picker-close" title="关闭" aria-label="关闭">✕</button>
        </header>
        <div class="thread-picker-filter">
          <label class="thread-picker-filter-label" for="chat-thread-customer-filter">按客户</label>
          <select id="chat-thread-customer-filter" class="thread-select thread-select-compact" title="按客户筛选会话列表">
            <option value="">全部客户</option>
          </select>
        </div>
        <ul class="thread-list" id="thread-list" role="listbox"></ul>
        <form class="thread-new-form" id="thread-new-form" autocomplete="off">
          <input type="text" id="thread-new-input" class="thread-new-input" placeholder="新会话名（可留空，回车建）" maxlength="40">
          <button type="submit" class="thread-new-confirm" id="thread-new-confirm" title="新建会话" aria-label="新建会话">＋</button>
        </form>
      </div>
    </div>
    <button type="button" class="thread-clear-current" id="chat-clear-current" title="清空当前会话记录" aria-label="清空当前会话记录">清空记录</button>
  </div>

  <div class="pharma-quick-tabs" id="pharma-quick-tabs" data-pharma-only role="tablist" aria-label="药学训练模式">
    <button type="button" class="pq-tab" data-pq-key="literature" role="tab" aria-selected="false">
      <span class="pq-tab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v17H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h12"/><path d="M8 7h7"/><path d="M8 11h6"/></svg>
      </span>
      <span class="pq-tab-copy">
        <span class="pq-tab-title">文献精读</span>
        <span class="pq-tab-sub">拆论文 · 讲人话 · 整理证据链</span>
      </span>
    </button>
    <button type="button" class="pq-tab" data-pq-key="incubator" role="tab" aria-selected="false">
      <span class="pq-tab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3c0 5 14 5 14 14"/><path d="M19 3c0 5-14 5-14 14"/><path d="M7 6h10"/><path d="M7 18h10"/><path d="M9 9h6"/><path d="M9 15h6"/></svg>
      </span>
      <span class="pq-tab-copy">
        <span class="pq-tab-title">课题孵化</span>
        <span class="pq-tab-sub">出方向 · 提假设 · 评可行性</span>
      </span>
    </button>
    <button type="button" class="pq-tab" data-pq-key="experiment" role="tab" aria-selected="false">
      <span class="pq-tab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3"/><path d="M7 14h10"/></svg>
      </span>
      <span class="pq-tab-copy">
        <span class="pq-tab-title">实验设计</span>
        <span class="pq-tab-sub">变量 · 对照 · 指标 · 合规边界</span>
      </span>
    </button>
    <button type="button" class="pq-exit" id="pharma-mode-exit" hidden title="退出训练模式" aria-label="退出训练模式">退出训练 ✕</button>
  </div>

  <div id="chat-history">
    <div id="chat-messages"></div>
  </div>
  <div class="composer-stack" id="composer-stack">
    <div class="composer-tools" id="composer-tools" role="toolbar" aria-label="输入工具">
      <button class="ct-btn ct-btn-icon" id="prompts-btn" type="button" title="行业话术（一键插入）" aria-label="行业话术">
        <svg class="ct-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>
      <button class="ct-btn ct-btn-icon ct-btn-soon" type="button" title="模板（敬请期待）" aria-label="模板" disabled>
        <svg class="ct-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2"></rect>
          <path d="M3 9h18M9 21V9"></path>
        </svg>
      </button>
      <button class="ct-btn ct-btn-icon ct-btn-soon" type="button" title="历史（敬请期待）" aria-label="历史" disabled>
        <svg class="ct-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7"></path>
          <path d="M3 4v5h5"></path>
          <path d="M12 7v5l3 2"></path>
        </svg>
      </button>
    </div>
    <div id="input-row">
      <button class="voice-btn" id="voice-btn" title="语音输入 开/关" type="button" aria-label="语音输入 开/关">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3"></rect>
          <path d="M5 10v2a7 7 0 0 0 14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="22"></line>
        </svg>
      </button>
      <div class="msg-input-wrap" id="msg-input-wrap">
        <textarea id="msg-input" rows="1" placeholder="跟 Nimo 说说提醒、读书、计划或现在的状态… Enter 发送" autocomplete="off"></textarea>
        <div class="voice-panel composer-voice-panel" id="voice-panel">
          <canvas id="voice-canvas" width="120" height="22"></canvas>
          <div class="voice-transcript" id="voice-transcript"></div>
        </div>
      </div>
      <button id="send-btn" type="button" aria-label="发送 (Enter)" title="发送 (Enter · Ctrl+Enter 换行)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="12" y1="19" x2="12" y2="5"></line>
          <polyline points="5 12 12 5 19 12"></polyline>
        </svg>
      </button>
    </div>
    <p class="composer-hint" id="composer-hint">Enter 发送 · Ctrl+Enter 换行 · 上方按钮一键插入话术</p>
  </div>

  <!-- 行业话术模板浮窗 -->
  <div class="prompts-popover" id="prompts-popover" hidden>
    <div class="pp-header">
      <span class="pp-title" id="pp-title">💬 行业话术</span>
      <button class="pp-close" id="pp-close" type="button" title="关闭">×</button>
    </div>
    <div class="pp-tabs" id="pp-tabs"></div>
    <div class="pp-list" id="pp-list"></div>
    <div class="pp-detail" id="pp-detail" hidden>
      <button class="pp-back" id="pp-back" type="button">← 返回列表</button>
      <div class="pp-detail-title" id="pp-detail-title"></div>
      <div class="pp-detail-cat" id="pp-detail-cat"></div>
      <div class="pp-vars" id="pp-vars"></div>
      <div class="pp-preview-label">预览（粘到对话框前可继续编辑）</div>
      <textarea class="pp-preview" id="pp-preview" rows="6"></textarea>
      <div class="pp-actions">
        <button class="pp-action pp-insert" id="pp-insert" type="button">插入到对话框</button>
        <button class="pp-action pp-copy" id="pp-copy" type="button">复制</button>
      </div>
    </div>
  </div>
</section>
`;

const createThemeSwitcher = () => `
<div class="theme-switcher" id="theme-switcher">
  <button type="button" class="appearance-mode-btn" data-theme-value="linear" aria-pressed="false">
    <span class="appearance-mode-dot appearance-mode-dot--light"></span>
    <span>浅色</span>
  </button>
</div>
`;

const createTooltip = () => `
<div id="tip"></div>
`;

const createOrgWorkspaceModal = () => `
<div class="org-overlay" id="org-overlay" hidden>
  <div class="org-modal" role="dialog" aria-modal="true" aria-label="公司与团队资料台">
    <div class="org-header">
      <div class="org-title">公司与团队资料台</div>
      <button class="org-close" id="org-close" type="button" aria-label="关闭">×</button>
    </div>
    <div class="org-subtitle">把公司、客户、员工都放在一个窗口统一管理（支持电商 / 科技等模块）</div>

    <div class="org-tabs" id="org-tabs">
      <button type="button" class="org-tab active" data-tab="company">公司信息</button>
      <button type="button" class="org-tab" data-tab="customer">客户管理</button>
      <button type="button" class="org-tab" data-tab="employee">员工管理</button>
    </div>

    <div class="org-content">
      <section class="org-pane active" data-pane="company">
        <div class="org-page-head">
          <div>
            <div class="org-page-title">公司资料</div>
            <div class="org-page-sub">这里是当前公司的唯一资料页，填写后点击下方保存。</div>
          </div>
        </div>
        <div class="org-grid">
          <div class="org-field">
            <label>公司全称</label>
            <input id="org-company-name" class="org-input" type="text" placeholder="例如：深圳某某科技有限公司">
          </div>
          <div class="org-field">
            <label>公司简称</label>
            <input id="org-company-short" class="org-input" type="text" placeholder="例如：某某科技">
          </div>
          <div class="org-field">
            <label>负责人</label>
            <input id="org-company-owner" class="org-input" type="text" placeholder="老板姓名">
          </div>
          <div class="org-field">
            <label>联系电话</label>
            <input id="org-company-phone" class="org-input" type="text" placeholder="手机号/座机">
          </div>
          <div class="org-field">
            <label>官网</label>
            <input id="org-company-website" class="org-input" type="text" placeholder="https://">
          </div>
          <div class="org-field">
            <label>地址</label>
            <input id="org-company-address" class="org-input" type="text" placeholder="公司地址">
          </div>
          <div class="org-field org-field-span2">
            <label>适用模块</label>
            <div id="org-company-modules" class="org-module-checks"></div>
          </div>
          <div class="org-field org-field-span2">
            <label>备注</label>
            <textarea id="org-company-notes" class="org-input org-textarea" rows="3" placeholder="可填写主营方向、服务边界、合作方式"></textarea>
          </div>
        </div>
        <div class="org-actions">
          <button type="button" class="org-mini-btn org-mini-btn-primary" id="org-save-company">保存公司信息</button>
          <span class="org-feedback" id="org-company-feedback"></span>
        </div>
      </section>

      <section class="org-pane" data-pane="customer">
        <div class="org-page-head">
          <div>
            <div class="org-page-title">客户资料</div>
            <div class="org-page-sub">先查看客户列表，需要时再新增或编辑。</div>
          </div>
          <button type="button" class="org-mini-btn org-mini-btn-primary" id="org-customer-new">新增客户</button>
        </div>
        <div class="org-list-wrap">
          <div class="org-list-head">
            <div class="org-list-title">已保存客户</div>
            <button type="button" class="org-mini-btn org-mini-btn-primary" data-org-open-customer>新增客户</button>
          </div>
          <div id="org-customer-list" class="org-list"></div>
        </div>
        <div class="org-editor-panel" id="org-customer-editor" hidden>
          <div class="org-customer-empty" id="org-customer-empty" hidden>
            <div class="org-empty-title">尚未选择行业</div>
            <div class="org-empty-sub">客户字段会跟随行业变化。请先在对话页顶部切换器选择一个行业（科技 / 电商等），再回来添加客户。</div>
          </div>
          <div class="org-customer-form-meta" id="org-customer-form-meta" hidden>
            <span class="org-customer-mode-label" id="org-customer-mode-label">新增客户</span>
            <span class="org-customer-industry-tag" id="org-customer-industry-tag"></span>
          </div>
          <div class="org-customer-form" id="org-customer-form-host"></div>
          <div class="org-actions">
            <button type="button" class="org-mini-btn org-mini-btn-primary" id="org-customer-submit">添加客户</button>
            <button type="button" class="org-mini-btn" id="org-customer-cancel-edit">收起</button>
            <span class="org-feedback" id="org-customer-feedback"></span>
          </div>
        </div>
      </section>

      <section class="org-pane" data-pane="employee">
        <div class="org-page-head">
          <div>
            <div class="org-page-title">员工资料</div>
            <div class="org-page-sub">先查看团队成员，需要时再添加员工。</div>
          </div>
          <button type="button" class="org-mini-btn org-mini-btn-primary" id="org-employee-new">新增员工</button>
        </div>
        <div class="org-list-wrap">
          <div class="org-list-head">
            <div class="org-list-title">团队成员</div>
            <button type="button" class="org-mini-btn org-mini-btn-primary" data-org-open-employee>新增员工</button>
          </div>
          <div id="org-employee-list" class="org-list"></div>
        </div>
        <div class="org-editor-panel" id="org-employee-editor" hidden>
          <div class="org-grid">
            <div class="org-field">
              <label>员工姓名</label>
              <input id="org-employee-name" class="org-input" type="text" placeholder="例如：小王">
            </div>
            <div class="org-field">
              <label>岗位</label>
              <input id="org-employee-role" class="org-input" type="text" placeholder="例如：销售经理">
            </div>
            <div class="org-field">
              <label>电话</label>
              <input id="org-employee-phone" class="org-input" type="text" placeholder="联系电话">
            </div>
            <div class="org-field">
              <label>邮箱</label>
              <input id="org-employee-email" class="org-input" type="text" placeholder="邮箱（可选）">
            </div>
            <div class="org-field org-field-span2">
              <label>负责模块</label>
              <div id="org-employee-modules" class="org-module-checks"></div>
            </div>
            <div class="org-field org-field-span2">
              <label>备注</label>
              <textarea id="org-employee-notes" class="org-input org-textarea" rows="2" placeholder="例如：擅长行业、负责区域"></textarea>
            </div>
          </div>
          <div class="org-actions">
            <button type="button" class="org-mini-btn org-mini-btn-primary" id="org-add-employee">添加员工</button>
            <button type="button" class="org-mini-btn" id="org-employee-cancel">收起</button>
            <span class="org-feedback" id="org-employee-feedback"></span>
          </div>
        </div>
      </section>
    </div>
  </div>
</div>
`;

const createSettingsModal = () => `
<div class="settings-overlay" id="settings-overlay" hidden>
  <div class="settings-modal" role="dialog" aria-modal="true" aria-label="设置">
    <div class="settings-header">
      <span class="settings-title">设置</span>
      <button class="settings-close" id="settings-close" type="button" aria-label="关闭">×</button>
    </div>

    <section class="view-hero view-hero--settings-plain" data-view-hero="settings">
      <div class="view-hero-text">
        <h2 class="view-hero-title">设置</h2>
        <p class="view-hero-sub">左侧选择类别；连接状态显示在对应菜单右侧。</p>
      </div>
    </section>

    <div class="settings-body">

      <!-- 侧栏导航：按任务分组 -->
      <nav class="settings-nav">
        <div class="settings-nav-group">
          <div class="settings-nav-group-label">常用</div>
          <button class="settings-nav-item active" data-tab="appearance" type="button">
            <span class="settings-nav-icon">●</span><span>外观</span>
          </button>
          <button class="settings-nav-item" data-tab="usage" type="button">
            <span class="settings-nav-icon">●</span><span>用量</span>
          </button>
          <button class="settings-nav-item" data-tab="industry" type="button">
            <span class="settings-nav-icon">●</span>
            <span class="settings-nav-item-label">行业</span>
            <span class="settings-nav-hint" id="sss-value-industry"></span>
          </button>
          <button class="settings-nav-item" data-tab="proactive" type="button">
            <span class="settings-nav-icon">●</span>
            <span class="settings-nav-item-label">主动提醒</span>
            <span class="settings-nav-hint" id="sss-value-proactive"></span>
          </button>
        </div>
        <div class="settings-nav-group">
          <div class="settings-nav-group-label">AI 能力</div>
          <button class="settings-nav-item" data-tab="llm" type="button">
            <span class="settings-nav-dot" id="sss-dot-llm"></span>
            <span class="settings-nav-item-label">LLM 模型</span>
            <span class="settings-nav-hint" id="sss-value-llm"></span>
          </button>
          <button class="settings-nav-item" data-tab="media" type="button">
            <span class="settings-nav-dot" id="sss-dot-media"></span>
            <span class="settings-nav-item-label">媒体能力</span>
            <span class="settings-nav-hint" id="sss-value-media"></span>
          </button>
          <button class="settings-nav-item" data-tab="voice" type="button">
            <span class="settings-nav-dot" id="sss-dot-voice"></span>
            <span class="settings-nav-item-label">语音 / 朗读</span>
            <span class="settings-nav-hint" id="sss-value-voice"></span>
          </button>
        </div>
        <div class="settings-nav-group" id="settings-nav-group-advanced" hidden>
          <div class="settings-nav-group-label">高级（开发者模式）</div>
          <button class="settings-nav-item" data-tab="social" type="button">
            <span class="settings-nav-dot" id="sss-dot-social"></span>
            <span class="settings-nav-item-label">社交媒体</span>
            <span class="settings-nav-hint" id="sss-value-social"></span>
          </button>
          <button class="settings-nav-item" data-tab="developer" type="button">
            <span class="settings-nav-icon">●</span><span>开发调试</span>
          </button>
        </div>
      </nav>

      <!-- 内容区 -->
      <div class="settings-content">

        <!-- ── 外观 tab ── -->
        <div class="settings-tab active" data-tab="appearance">
          <div class="settings-section">
            <div class="settings-section-label">显示模式</div>
            <p class="settings-hint">已取消多彩主题，仅保留浅色 / 深色两种模式，减少干扰，提升阅读性。</p>
            ${createThemeSwitcher()}
          </div>
          <div class="settings-section">
            <div class="settings-section-label">开发者模式</div>
            <p class="settings-hint">面向开发者 / 高级用户。开启后设置中会出现「社交媒体」与「开发调试」两项，可控制 AI 后台明细、开发指标、账号绑定等。默认关闭，面向销售/老板提供最简洁的界面。</p>
            <div class="settings-row">
              <label class="settings-label" for="settings-developer-mode-toggle">启用开发者模式</label>
              <input id="settings-developer-mode-toggle" type="checkbox" style="width:auto;flex:none;">
              <span class="settings-feedback" id="settings-developer-mode-feedback" style="margin-left:8px;"></span>
            </div>
          </div>
        </div>

        <!-- ── 行业 tab ── -->
        <div class="settings-tab" data-tab="industry">
          <div class="settings-section">
            <div class="settings-section-label">当前行业</div>
            <p class="settings-hint">客户、记忆、知识、热点都按行业隔离。切换行业后只是换工作台，每个行业里的客户和记录都还在。</p>
            <div class="settings-config-row">
              <span class="settings-config-type">行业</span>
              <span class="settings-config-info" id="settings-cfg-industry">—</span>
              <span class="settings-config-dot" id="settings-cfg-industry-dot"></span>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">切换工作台</div>
            <div class="industry-switch-grid" id="settings-industry-grid">
              <div class="settings-hint">正在加载行业工作台...</div>
            </div>
            <span class="settings-feedback" id="settings-industry-feedback" style="margin-top:8px;display:block;"></span>
          </div>
        </div>

        <div class="settings-tab" data-tab="proactive">
          <div class="settings-section">
            <div class="settings-section-label">主动找我</div>
            <p class="settings-hint">控制 Pulse 主动给你发消息的频率。明确说了“半小时后”“10 分钟后”的提醒仍按你说的时间执行；没有说具体多久时，会按这里的频率来找你。</p>
            <div class="settings-row">
              <label class="settings-label" for="settings-proactive-enabled">启用主动提醒</label>
              <input id="settings-proactive-enabled" type="checkbox" style="width:auto;flex:none;">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-proactive-frequency">找我频率</label>
              <select class="settings-select" id="settings-proactive-frequency">
                <option value="off">不要主动找我</option>
                <option value="1">1 分钟找我一次</option>
                <option value="10">10 分钟找我一次</option>
                <option value="20">20 分钟找我一次</option>
                <option value="50">50 分钟找我一次</option>
                <option value="60">60 分钟找我一次</option>
                <option value="240">4 小时找我一次</option>
                <option value="300">5 小时找我一次</option>
                <option value="360">6 小时找我一次</option>
              </select>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-proactive-idle-guard">半小时没聊天后才主动找我</label>
              <input id="settings-proactive-idle-guard" type="checkbox" style="width:auto;flex:none;">
            </div>
            <div class="settings-section-label" style="margin-top:16px;">屏幕督促</div>
            <p class="settings-hint">Nimo 只读取前台软件名、窗口标题和鼠标键盘空闲时长，用来判断久用屏幕和久未操作；不记录键盘输入，不读取聊天正文。</p>
            <div class="settings-row">
              <label class="settings-label" for="settings-screen-guard-enabled">启用屏幕督促</label>
              <input id="settings-screen-guard-enabled" type="checkbox" style="width:auto;flex:none;">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-screen-guard-mode">督促模式</label>
              <select class="settings-select" id="settings-screen-guard-mode">
                <option value="mild">温和</option>
                <option value="normal">普通</option>
                <option value="strict">强督促</option>
              </select>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-screen-guard-screen-minutes">连续用屏多久提醒休息</label>
              <select class="settings-select" id="settings-screen-guard-screen-minutes">
                <option value="25">25 分钟</option>
                <option value="45">45 分钟</option>
                <option value="60">60 分钟</option>
                <option value="90">90 分钟</option>
              </select>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-screen-guard-idle-minutes">多久没动提醒回来</label>
              <select class="settings-select" id="settings-screen-guard-idle-minutes">
                <option value="5">5 分钟</option>
                <option value="10">10 分钟</option>
                <option value="15">15 分钟</option>
                <option value="30">30 分钟</option>
              </select>
            </div>
            <div class="settings-section-label" style="margin-top:16px;">每日总结</div>
            <p class="settings-hint">到指定时间后，Nimo 会汇总今天的提醒、未完成事项、软件使用和空闲情况，主动给你发一段晚间总结。</p>
            <div class="settings-row">
              <label class="settings-label" for="settings-daily-summary-enabled">启用每日总结</label>
              <input id="settings-daily-summary-enabled" type="checkbox" style="width:auto;flex:none;">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-daily-summary-time">总结时间</label>
              <input class="settings-input" id="settings-daily-summary-time" type="time" value="22:30">
            </div>
            <div class="settings-row">
              <label class="settings-label">测试</label>
              <button class="settings-save-btn" id="settings-daily-summary-test" type="button">现在总结一次</button>
            </div>
            <div class="settings-section-label" style="margin-top:16px;">个人数据授权</div>
            <p class="settings-hint">这些设置决定 Pulse 能使用哪些本地信号来理解你。数据只保存在本机，你可以随时关闭。</p>
            <div class="settings-row">
              <label class="settings-label" for="settings-personal-chat-signals">允许根据聊天内容识别提醒</label>
              <input id="settings-personal-chat-signals" type="checkbox" style="width:auto;flex:none;">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-personal-life-care">允许生活关心提醒</label>
              <input id="settings-personal-life-care" type="checkbox" style="width:auto;flex:none;">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-personal-business-signals">允许业务/客户主动提醒</label>
              <input id="settings-personal-business-signals" type="checkbox" style="width:auto;flex:none;">
            </div>
            <div class="settings-section-label" style="margin-top:16px;">安静时段</div>
            <div class="settings-row">
              <label class="settings-label" for="settings-personal-quiet-enabled">启用安静时段</label>
              <input id="settings-personal-quiet-enabled" type="checkbox" style="width:auto;flex:none;">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-personal-quiet-start">开始</label>
              <input class="settings-input" id="settings-personal-quiet-start" type="time" value="23:00">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-personal-quiet-end">结束</label>
              <input class="settings-input" id="settings-personal-quiet-end" type="time" value="08:00">
            </div>
            <div class="settings-row-action">
              <button class="settings-save-btn" id="settings-save-proactive" type="button">保存</button>
              <span class="settings-feedback" id="settings-proactive-feedback"></span>
            </div>
          </div>
        </div>

        <!-- ── LLM 模型 tab ── -->
        <div class="settings-tab" data-tab="llm">
          <div class="settings-section">
            <div class="settings-section-label">当前状态</div>
            <div class="settings-config-row">
              <span class="settings-config-type">LLM</span>
              <span class="settings-config-info" id="settings-cfg-llm">—</span>
              <span class="settings-config-dot" id="settings-cfg-llm-dot"></span>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">切换配置</div>
            <div class="settings-row">
              <label class="settings-label" for="settings-provider-select">提供商</label>
              <select class="settings-select" id="settings-provider-select">
                <option value="auto">自动识别</option>
                <option value="deepseek">DeepSeek</option>
                <option value="minimax">MiniMax</option>
                <option value="custom">自定义端点（本地/其他）</option>
              </select>
            </div>
            <div class="settings-row" id="settings-model-row">
              <label class="settings-label" for="settings-model-select">模型</label>
              <select class="settings-select" id="settings-model-select"></select>
            </div>
            <!-- 自定义端点字段（选择"自定义端点"时显示） -->
            <div id="settings-custom-llm-section" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="settings-custom-baseurl">Base URL</label>
                <input class="settings-input" id="settings-custom-baseurl" type="text" placeholder="如 http://localhost:11434/v1">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="settings-custom-model">模型名称</label>
                <input class="settings-input" id="settings-custom-model" type="text" placeholder="如 llama3.2, qwen2.5, mistral">
              </div>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="settings-llm-key">API Key</label>
              <input class="settings-input" id="settings-llm-key" type="password" placeholder="自定义端点可留空；其他留空则仅切换模型" autocomplete="new-password">
            </div>
            <div class="settings-row-action">
              <button class="settings-save-btn" id="settings-save-llm" type="button">保存</button>
              <span class="settings-feedback" id="settings-llm-feedback"></span>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">模型温度</div>
            <p class="settings-hint">控制回复的随机性。0 = 确定性最高，1 = 正常创意，1.5 = 更随机。推荐 0.3–0.7。</p>
            <div class="settings-row">
              <label class="settings-label" for="settings-temperature">Temperature</label>
              <input type="range" id="settings-temperature" min="0" max="1.5" step="0.05" value="0.5" style="flex:1;cursor:pointer;">
              <span id="settings-temperature-val" style="min-width:2.8em;text-align:right;color:var(--ink2);font-size:13px;">0.50</span>
            </div>
            <div class="settings-row-action">
              <button class="settings-save-btn" id="settings-save-temperature" type="button">保存</button>
              <span class="settings-feedback" id="settings-temperature-feedback"></span>
            </div>
          </div>
        </div>

        <!-- ── 用量 tab ── -->
        <div class="settings-tab" data-tab="usage">
          <div class="settings-section">
            <div class="settings-section-label">当前用量（最近 60 秒）</div>
            <p class="settings-hint">实时显示 LLM 调用配额占用。每 5 秒自动刷新。</p>
            <div class="usage-grid">
              <div class="usage-card">
                <div class="usage-card-label">RPM</div>
                <div class="usage-card-value" id="usage-rpm">—</div>
              </div>
              <div class="usage-card">
                <div class="usage-card-label">TPM</div>
                <div class="usage-card-value" id="usage-tpm">—</div>
              </div>
              <div class="usage-card">
                <div class="usage-card-label">占用</div>
                <div class="usage-card-value" id="usage-ratio">—</div>
              </div>
              <div class="usage-card">
                <div class="usage-card-label">下次自动检查</div>
                <div class="usage-card-value" id="usage-tick">—</div>
              </div>
            </div>
            <div class="usage-bar-wrap">
              <div class="usage-bar"><div class="usage-bar-fill" id="usage-bar-fill"></div></div>
              <div class="usage-bar-hint" id="usage-bar-hint">空闲</div>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">每日多模态用量</div>
            <div class="usage-daily" id="usage-daily">加载中…</div>
          </div>
        </div>

        <!-- ── 媒体能力 tab ── -->
        <div class="settings-tab" data-tab="media">
          <div class="settings-section">
            <div class="settings-section-label">当前状态</div>
            <div class="settings-config-row">
              <span class="settings-config-type">媒体</span>
              <span class="settings-config-info" id="settings-cfg-media">—</span>
              <span class="settings-config-dot" id="settings-cfg-media-dot"></span>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">MiniMax API Key</div>
            <div class="settings-row">
              <label class="settings-label" for="settings-minimax-key">API Key</label>
              <input class="settings-input" id="settings-minimax-key" type="password" placeholder="填入 MiniMax API Key…" autocomplete="new-password">
            </div>
            <div class="settings-row-action">
              <button class="settings-save-btn" id="settings-save-minimax" type="button">保存</button>
              <span class="settings-feedback" id="settings-minimax-feedback"></span>
            </div>
          </div>
        </div>

        <!-- ── 社交媒体 tab ── -->
        <div class="settings-tab" data-tab="social">
          <div class="settings-section">
            <div class="settings-section-label">Discord</div>
            <div class="settings-platform-status" id="social-status-discord"></div>
            <div class="settings-row">
              <label class="settings-label" for="social-discord-token">Bot Token</label>
              <input class="settings-input" id="social-discord-token" type="password" placeholder="留空保持原值不变…" autocomplete="new-password">
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">飞书</div>
            <div class="settings-platform-status" id="social-status-feishu"></div>
            <div class="settings-row">
              <label class="settings-label" for="social-feishu-appid">App ID</label>
              <input class="settings-input" id="social-feishu-appid" type="password" placeholder="留空保持原值…" autocomplete="new-password">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="social-feishu-secret">App Secret</label>
              <input class="settings-input" id="social-feishu-secret" type="password" placeholder="留空保持原值…" autocomplete="new-password">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="social-feishu-token">Verify Token</label>
              <input class="settings-input" id="social-feishu-token" type="password" placeholder="留空保持原值…" autocomplete="new-password">
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">微信公众号</div>
            <div class="settings-platform-status" id="social-status-wechat"></div>
            <div class="settings-row">
              <label class="settings-label" for="social-wechat-appid">App ID</label>
              <input class="settings-input" id="social-wechat-appid" type="password" placeholder="留空保持原值…" autocomplete="new-password">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="social-wechat-secret">App Secret</label>
              <input class="settings-input" id="social-wechat-secret" type="password" placeholder="留空保持原值…" autocomplete="new-password">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="social-wechat-token">Token</label>
              <input class="settings-input" id="social-wechat-token" type="password" placeholder="留空保持原值…" autocomplete="new-password">
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">企业微信</div>
            <div class="settings-platform-status" id="social-status-wecom"></div>
            <div class="settings-row">
              <label class="settings-label" for="social-wecom-botkey">Bot Key</label>
              <input class="settings-input" id="social-wecom-botkey" type="password" placeholder="留空保持原值…" autocomplete="new-password">
            </div>
            <div class="settings-row">
              <label class="settings-label" for="social-wecom-token">Incoming Token</label>
              <input class="settings-input" id="social-wecom-token" type="password" placeholder="留空保持原值…" autocomplete="new-password">
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">微信 ClawBot（个人微信）</div>
            <div class="settings-platform-status" id="social-status-clawbot">○ 未连接</div>
            <p class="settings-hint">点击「连接微信」后会生成二维码，用微信扫码即可绑定个人账号。凭证保存在本地，重启后无需重新扫码。</p>
            <div class="settings-row" style="gap:8px;flex-wrap:wrap;">
              <button class="settings-save-btn" id="clawbot-connect-btn" type="button" style="width:auto;padding:0 16px;">连接微信</button>
              <button class="settings-save-btn" id="clawbot-logout-btn" type="button" style="width:auto;padding:0 16px;background:var(--danger,#c0392b);">断开</button>
            </div>
            <div id="clawbot-qr-area" style="display:none;margin-top:12px;text-align:center;">
              <p class="settings-hint" style="margin-bottom:8px;">用微信扫描下方二维码：</p>
              <img id="clawbot-qr-img" src="" alt="微信二维码" style="width:200px;height:200px;border:1px solid var(--border);border-radius:4px;">
              <p class="settings-hint" style="margin-top:6px;font-size:11px;" id="clawbot-qr-hint">等待扫码…</p>
            </div>
            <span class="settings-feedback" id="clawbot-feedback"></span>
          </div>
          <div class="settings-section settings-section-action">
            <button class="settings-save-btn" id="settings-save-social" type="button">保存所有</button>
            <span class="settings-feedback" id="settings-social-feedback"></span>
          </div>
        </div>

        <!-- ── 语音 tab ── -->
        <div class="settings-tab" data-tab="voice">
          <div class="settings-section">
            <div class="settings-section-label">语音引擎</div>
            <p class="settings-hint">选择语音输入走哪条链路。云端走阿里/腾讯/讯飞，需要 API Key；本地走 Whisper（不联网，更隐私），需要先在本机启动语音服务。</p>
            <div class="settings-row">
              <label class="settings-label" for="voice-engine-select">引擎</label>
              <select class="settings-select" id="voice-engine-select">
                <option value="cloud">云端 ASR（推荐，实时）</option>
                <option value="local">本地 Whisper（离线，隐私优先）</option>
              </select>
            </div>
            <div id="voice-local-controls" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="voice-local-model">Whisper 模型</label>
                <select class="settings-select" id="voice-local-model">
                  <option value="tiny">tiny（最快，准确率较低）</option>
                  <option value="base">base</option>
                  <option value="small" selected>small（推荐）</option>
                  <option value="medium">medium</option>
                  <option value="large-v3">large-v3（最准，需较多显存）</option>
                  <option value="turbo">turbo</option>
                </select>
              </div>
              <div class="settings-row" style="gap:8px;flex-wrap:wrap;">
                <button class="settings-save-btn" id="voice-local-start" type="button" style="width:auto;padding:0 16px;">启动本地服务</button>
                <button class="settings-save-btn" id="voice-local-stop" type="button" style="width:auto;padding:0 16px;background:var(--danger,#c0392b);">停止</button>
                <button class="settings-save-btn" id="voice-local-refresh" type="button" style="width:auto;padding:0 16px;background:var(--ink2,#888);">刷新状态</button>
              </div>
              <p class="settings-hint" id="voice-local-status" style="margin-top:6px;">未运行</p>
              <p class="settings-hint">本地服务运行在 <code>ws://127.0.0.1:3723</code>。开发模式需要本机安装 Python 与 <code>openai-whisper</code>；安装包模式会自带 <code>whisper_server.exe</code>。</p>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">云端模式配置</div>
            <div class="settings-row">
              <label class="settings-label" for="voice-provider-select">服务商</label>
              <select class="settings-select" id="voice-provider-select">
                <option value="aliyun">阿里云百炼（推荐）</option>
                <option value="tencent">腾讯云 ASR</option>
                <option value="xunfei">科大讯飞 RTASR</option>
              </select>
            </div>
            <div id="voice-cred-aliyun">
              <div class="settings-row">
                <label class="settings-label" for="voice-aliyun-key">阿里云 API Key</label>
                <input class="settings-input" type="password" id="voice-aliyun-key" placeholder="留空则不修改">
              </div>
            </div>
            <div id="voice-cred-tencent" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="voice-tencent-sid">SecretId</label>
                <input class="settings-input" type="password" id="voice-tencent-sid" placeholder="留空则不修改">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="voice-tencent-skey">SecretKey</label>
                <input class="settings-input" type="password" id="voice-tencent-skey" placeholder="留空则不修改">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="voice-tencent-appid">AppId</label>
                <input class="settings-input" type="text" id="voice-tencent-appid" placeholder="腾讯云 AppId">
              </div>
            </div>
            <div id="voice-cred-xunfei" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="voice-xunfei-appid">AppId</label>
                <input class="settings-input" type="text" id="voice-xunfei-appid" placeholder="讯飞 AppId">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="voice-xunfei-apikey">ApiKey</label>
                <input class="settings-input" type="password" id="voice-xunfei-apikey" placeholder="留空则不修改">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="voice-xunfei-apisecret">ApiSecret</label>
                <input class="settings-input" type="password" id="voice-xunfei-apisecret" placeholder="留空则不修改">
              </div>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">通用设置</div>
            <div class="settings-row">
              <label class="settings-label" for="voice-lang-select">识别语言</label>
              <select class="settings-select" id="voice-lang-select">
                <option value="zh-CN">中文（普通话）</option>
                <option value="en-US">English (US)</option>
              </select>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="voice-auto-send">识别后自动发送</label>
              <input id="voice-auto-send" type="checkbox" checked style="width:auto;flex:none;">
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">语音灵敏度</div>
            <p class="settings-hint">调节麦克风触发阈值。越低越灵敏，越高越需要大声说话。默认 0.008。</p>
            <div class="settings-row">
              <label class="settings-label" for="settings-voice-threshold">触发阈值</label>
              <input type="range" id="settings-voice-threshold" min="0.002" max="0.04" step="0.001" value="0.008" style="flex:1;cursor:pointer;">
              <span id="settings-voice-threshold-val" style="min-width:3.5em;text-align:right;color:var(--ink2);font-size:13px;">0.008</span>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">语音合成（TTS）</div>
            <p class="settings-hint">用语音发消息时，Agent 回复会自动转为语音播放。默认使用 MiniMax（复用已有 Key），也支持 OpenAI、ElevenLabs、火山引擎。</p>
            <div class="settings-row">
              <label class="settings-label" for="tts-provider-select">服务商</label>
              <select class="settings-select" id="tts-provider-select">
                <option value="doubao">豆包（方舟，流式，中文最自然）</option>
                <option value="openai">OpenAI TTS（流式，$0.015/千字）</option>
                <option value="elevenlabs">ElevenLabs（流式，高质量）</option>
                <option value="volcano">火山引擎（中文，有免费额度）</option>
                <option value="minimax">MiniMax（已有配置）</option>
              </select>
            </div>
            <div class="settings-row">
              <label class="settings-label" for="tts-voice-select">声音</label>
              <select class="settings-select" id="tts-voice-select"></select>
            </div>

            <div id="tts-creds-doubao" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="tts-doubao-key">API Key</label>
                <input class="settings-input" type="password" id="tts-doubao-key" placeholder="留空则不修改">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-doubao-appid">AppId（选填）</label>
                <input class="settings-input" type="text" id="tts-doubao-appid" placeholder="豆包语音 AppId">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-doubao-access-key">Access Key（选填）</label>
                <input class="settings-input" type="password" id="tts-doubao-access-key" placeholder="留空则不修改">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-doubao-resource-id">ResourceId（选填）</label>
                <input class="settings-input" type="text" id="tts-doubao-resource-id" placeholder="默认 seed-tts-2.0">
              </div>
              <p class="settings-hint">在<a href="https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey" target="_blank" style="color:var(--cool)">火山方舟控制台</a>获取 API Key。若你的账号使用语音平台鉴权，可填写 AppId / Access Key。</p>
            </div>

            <div id="tts-creds-minimax" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="tts-minimax-key">MiniMax API Key</label>
                <input class="settings-input" type="password" id="tts-minimax-key" placeholder="留空则不修改（可与 LLM 共用）">
              </div>
              <p class="settings-hint">可用声音：male-qn-qingse · male-qn-jingying · female-shaonv · female-yujie · presenter_female 等。</p>
            </div>

            <div id="tts-creds-openai">
              <div class="settings-row">
                <label class="settings-label" for="tts-openai-key">OpenAI API Key</label>
                <input class="settings-input" type="password" id="tts-openai-key" placeholder="留空则不修改（可与 LLM 共用）">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-openai-baseurl">Base URL（选填）</label>
                <input class="settings-input" type="text" id="tts-openai-baseurl" placeholder="自定义端点，如 https://api.deepseek.com">
              </div>
              <p class="settings-hint">可用声音：nova · shimmer · alloy · echo · fable · onyx</p>
            </div>

            <div id="tts-creds-elevenlabs" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="tts-elevenlabs-key">ElevenLabs API Key</label>
                <input class="settings-input" type="password" id="tts-elevenlabs-key" placeholder="留空则不修改">
              </div>
              <p class="settings-hint">免费套餐每月 10,000 字符。声音 ID 在 ElevenLabs 控制台获取。</p>
            </div>

            <div id="tts-creds-volcano" style="display:none;">
              <div class="settings-row">
                <label class="settings-label" for="tts-volcano-appid">AppId</label>
                <input class="settings-input" type="text" id="tts-volcano-appid" placeholder="火山引擎 TTS AppId">
              </div>
              <div class="settings-row">
                <label class="settings-label" for="tts-volcano-token">Access Token</label>
                <input class="settings-input" type="password" id="tts-volcano-token" placeholder="留空则不修改">
              </div>
              <p class="settings-hint">可用声音：BV001_streaming（通用女声）· BV002_streaming（通用男声）等，在火山引擎控制台查看全部。</p>
            </div>

            <div class="settings-row" style="margin-top:8px;">
              <button class="settings-save-btn" id="tts-test-btn" type="button" style="padding:4px 12px;font-size:12px;">试听</button>
              <span id="tts-test-status" style="color:var(--ink2);font-size:12px;margin-left:8px;"></span>
            </div>
          </div>

          <div class="settings-section settings-section-action">
            <button class="settings-save-btn" id="settings-save-voice" type="button">保存</button>
            <span class="settings-feedback" id="settings-voice-feedback"></span>
          </div>
        </div>

        <!-- ── 开发 tab ── 极客向控件归集 -->
        <div class="settings-tab" data-tab="developer">
          <div class="settings-section">
            <div class="settings-section-label">记忆节点图</div>
            <p class="settings-hint">在背景显示记忆节点力导向图。占用 CPU/GPU，默认关闭。修改后需刷新生效。</p>
            <div class="settings-row">
              <label class="settings-label" for="settings-memory-graph-toggle">显示记忆节点图</label>
              <input id="settings-memory-graph-toggle" type="checkbox" style="width:auto;flex:none;">
              <span class="settings-feedback" id="settings-memory-graph-feedback" style="margin-left:8px;"></span>
            </div>
            <div class="settings-row" style="margin-top:6px;">
              <button class="settings-save-btn" id="reset-view-btn" type="button">重置节点图视角</button>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">Graph Tuning</div>
            <p class="settings-hint">力导向图物理参数。仅在「显示记忆节点图」开启时生效。</p>
            <section class="physics-control physics-control--inline" id="physics-control">
              <div class="physics-panel physics-panel--inline" id="physics-panel">
                <div class="physics-panel-inner">
                  <div class="physics-field">
                    <div class="physics-field-head">
                      <label class="physics-field-label" for="gravity-slider">引力</label>
                      <span class="physics-field-value" id="gravity-value">1.00x</span>
                    </div>
                    <input class="physics-slider" id="gravity-slider" type="range" min="0" max="5" step="0.02" value="2">
                  </div>
                  <div class="physics-field">
                    <div class="physics-field-head">
                      <label class="physics-field-label" for="repulsion-slider">斥力</label>
                      <span class="physics-field-value" id="repulsion-value">1.00x</span>
                    </div>
                    <input class="physics-slider" id="repulsion-slider" type="range" min="0" max="5" step="0.02" value="2">
                  </div>
                  <div class="physics-field">
                    <div class="physics-field-head">
                      <label class="physics-field-label" for="node-size-slider">节点大小</label>
                      <span class="physics-field-value" id="node-size-value">1.00x</span>
                    </div>
                    <input class="physics-slider" id="node-size-slider" type="range" min="0" max="5" step="0.02" value="2">
                  </div>
                </div>
              </div>
            </section>
            <!-- 兼容旧 toggle 按钮的隐藏占位 -->
            <button class="physics-toggle" id="physics-toggle" type="button" aria-expanded="true" hidden>
              <span class="physics-toggle-label">Graph Tuning</span>
              <span class="physics-toggle-icon">▾</span>
            </button>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">极客指标</div>
            <p class="settings-hint">在右侧面板顶部显示开发者指标：在线时长、tok/s。普通用户不需要打开。</p>
            <div class="settings-row">
              <label class="settings-label" for="settings-dev-stats-toggle">显示开发指标</label>
              <input id="settings-dev-stats-toggle" type="checkbox" style="width:auto;flex:none;">
              <span class="settings-feedback" id="settings-dev-stats-feedback" style="margin-left:8px;"></span>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">AI 后台明细</div>
            <p class="settings-hint">右侧「AI 状态」展开后是否显示后台原始处理明细。关闭后只看到状态摘要，更适合销售/老板使用。</p>
            <div class="settings-row">
              <label class="settings-label" for="settings-l2-stream-toggle">显示 AI 后台明细</label>
              <input id="settings-l2-stream-toggle" type="checkbox" style="width:auto;flex:none;">
              <span class="settings-feedback" id="settings-l2-stream-feedback" style="margin-left:8px;"></span>
            </div>
          </div>
        </div>

      </div><!-- /settings-content -->
    </div><!-- /settings-body -->
  </div>
</div>
`;

const createVideoPanel = () => `
<div class="video-panel" id="video-panel">
  <div class="media-stage-head">
    <div class="media-stage-title" id="video-title">Video</div>
    <button class="video-exit-btn" id="video-exit-btn" type="button" title="Exit video">x</button>
  </div>
  <div class="video-surface" id="video-surface">
    <div class="video-backdrop" id="video-backdrop"></div>
    <video id="video-feed" playsinline controls></video>
    <iframe id="video-frame" title="Video player" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen hidden></iframe>
    <div class="video-empty" id="video-empty">No video source</div>
  </div>
</div>
`;

const createMusicPanel = () => `
<div class="music-panel" id="music-panel">
  <div class="media-stage-head">
    <div class="media-stage-title" id="music-panel-title">Music</div>
    <button class="music-exit-btn" id="music-exit-btn" type="button" title="退出音乐模式">×</button>
  </div>
  <div class="music-stage">
    <div class="music-turntable">
      <div class="music-vinyl" id="music-vinyl">
        <div class="music-groove music-groove-1"></div>
        <div class="music-groove music-groove-2"></div>
        <div class="music-groove music-groove-3"></div>
        <div class="music-groove music-groove-4"></div>
        <div class="music-cover" id="music-cover">
          <div class="music-cover-title" id="music-cover-title">♪</div>
          <div class="music-cover-artist" id="music-cover-artist"></div>
        </div>
        <div class="music-spindle"></div>
      </div>
      <div class="music-tonearm-group" id="music-tonearm-group">
        <div class="music-tonearm-pivot"></div>
        <div class="music-arm-shaft"></div>
        <div class="music-headshell">
          <div class="music-stylus"></div>
        </div>
      </div>
    </div>
    <div class="music-lyrics-pane" id="music-lyrics-pane">
      <div class="music-lyrics-scroll" id="music-lyrics-scroll"></div>
      <div class="music-no-lyrics" id="music-no-lyrics" hidden>— 无歌词 —</div>
    </div>
  </div>
  <div class="music-footer">
    <div class="music-meta">
      <div class="music-meta-title" id="music-meta-title">—</div>
      <div class="music-meta-artist" id="music-meta-artist">—</div>
    </div>
    <div class="music-progress-row">
      <span class="music-time" id="music-time-cur">0:00</span>
      <input class="music-seek" id="music-seek" type="range" min="0" max="100" step="0.1" value="0">
      <span class="music-time" id="music-time-total">0:00</span>
    </div>
    <div class="music-controls-row">
      <button class="music-ctrl" id="music-prev" type="button" title="上一首">⏮</button>
      <button class="music-ctrl music-ctrl-play" id="music-play" type="button" title="播放/暂停">▶</button>
      <button class="music-ctrl" id="music-next" type="button" title="下一首">⏭</button>
      <input class="music-vol" id="music-vol" type="range" min="0" max="1" step="0.01" value="0.8" title="音量">
    </div>
  </div>
  <audio id="music-audio" preload="auto"></audio>
</div>
`;

const createImagePanel = () => `
<div class="image-panel" id="image-panel">
  <div class="media-stage-head">
    <div class="media-stage-title" id="image-title">Image</div>
    <button class="image-exit-btn" id="image-exit-btn" type="button" title="Close image">x</button>
  </div>
  <div class="image-surface" id="image-surface">
    <img id="image-display" alt="" />
    <div class="image-empty" id="image-empty">No image source</div>
  </div>
</div>
`;

const createPanelTabs = () => `
<button id="panel-l1-tab" class="panel-tab panel-tab-left" aria-label="切换左面板" title="切换左面板 [ "></button>
<button id="panel-l2-tab" class="panel-tab panel-tab-right" aria-label="切换右面板" title="切换右面板 ] "></button>
`;

// ─── 行业引导页（3 屏流动式） ─────────────────────────────
const createIndustryOnboarding = () => `
<div id="industry-onboarding" class="ind-onboard" hidden>
  <div class="ind-onboard-backdrop"></div>
  <div class="ind-onboard-card">
    <button class="ind-onboard-close" id="ind-onboard-close" type="button" title="跳过">×</button>
    <!-- 第 1 屏：欢迎 -->
    <div class="ind-step" data-step="0">
      <div class="ind-step-icon">🚀</div>
      <h2>欢迎使用 Pulse</h2>
      <p>选择你所在的行业，AI 助手将为你量身定制<br>人设、话术、热点源和客户字段。</p>
      <button class="ind-btn ind-btn-primary" data-action="next">开始选择</button>
    </div>
    <!-- 第 2 屏：选行业 -->
    <div class="ind-step" data-step="1" hidden>
      <h2>选择行业</h2>
      <p>可多选，启用后随时切换。</p>
      <div class="ind-pack-grid" id="ind-pack-grid"></div>
      <button class="ind-btn ind-btn-primary" data-action="next" disabled>确认选择</button>
    </div>
    <!-- 第 3 屏：完成 -->
    <div class="ind-step" data-step="2" hidden>
      <div class="ind-step-icon">✅</div>
      <h2>设置完成！</h2>
      <p id="ind-finish-text">你的 AI 助手已切换为行业专属模式。</p>
      <button class="ind-btn ind-btn-primary" data-action="finish">进入 Pulse</button>
    </div>
    <!-- 进度指示器 -->
    <div class="ind-dots">
      <span class="ind-dot active"></span>
      <span class="ind-dot"></span>
      <span class="ind-dot"></span>
    </div>
  </div>
</div>
`;

function createTodayView() {
  return `
<section class="today-view" id="today-view" hidden>
  <div class="today-inner">
    <header class="today-hero">
      <div class="today-hero-main">
        <div class="today-hero-eyebrow" id="today-hero-eyebrow">Nimo · 主动陪伴伙伴</div>
        <h1 class="today-hero-title" id="today-hero-title">提醒你该做的事<br>也陪你读书和聊天</h1>
        <p class="today-hero-sub" id="today-hero-sub">Nimo 不只是 AI，它会主动找你提醒、督促、陪读和聊天；久未操作时，也会轻轻把你叫回来。</p>
        <div class="today-ask">
          <input type="text" class="today-ask-input" id="today-ask-input" placeholder="例如：晚上九点提醒我读 20 分钟书" autocomplete="off" />
          <button type="button" class="today-ask-send" id="today-ask-send" aria-label="发送给 Nimo">
            <span class="today-ask-send-text">告诉 Nimo</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
        <div class="today-ask-hints">
          <span class="today-ask-hint-label">试试问：</span>
          <button type="button" class="today-ask-chip" data-action="go-chat" data-prompt="提醒我今天要完成的三件事。">今日提醒</button>
          <button type="button" class="today-ask-chip" data-action="go-chat" data-prompt="陪我读一篇文档，先帮我总结重点。">陪我读书</button>
          <button type="button" class="today-ask-chip" data-action="go-chat" data-prompt="如果我半小时没动电脑，提醒我回来继续。">偷懒提醒</button>
          <button type="button" class="today-ask-chip" data-action="go-chat" data-prompt="跟我聊聊现在该先做什么。">陪伴聊天</button>
        </div>
      </div>
      <aside class="today-hero-visual" aria-hidden="true">
        <div class="today-hero-paper-card">
          <div class="today-hero-paper-top">
            <span>📚 今日陪读</span>
            <em>文档阅读</em>
          </div>
          <strong>导入资料后，Nimo 帮你总结、提问和陪读</strong>
          <div class="today-hero-paper-tags"><span>摘要</span><span>重点</span><span>追问</span></div>
        </div>
        <div class="today-hero-ai-card">
          <span>Nimo 正在陪伴</span>
          <strong>你已经 25 分钟没动屏幕了，要不要回来继续一下？</strong>
        </div>
        <div class="today-hero-mini-card">+ 到点提醒 · 读书打卡 · 主动督促</div>
      </aside>
    </header>

    <section class="today-section">
      <div class="today-section-head">
        <div>
          <div class="today-section-title">Nimo 能为你做什么</div>
          <div class="today-section-sub">提醒 · 读书 · 督促 · 陪伴聊天</div>
        </div>
      </div>
      <div class="today-cards">
        <article class="today-card" data-feature="ai">
          <div class="today-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><circle cx="12" cy="12" r="5"/></svg>
          </div>
          <div class="today-card-title">主动提醒</div>
          <div class="today-card-desc">自然语言记下事情，到点用桌面弹窗、聊天和后续硬件提醒你</div>
        </article>
        <article class="today-card" data-feature="threads">
          <div class="today-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>
          </div>
          <div class="today-card-title">陪伴聊天</div>
          <div class="today-card-desc">不只是被动回答，Nimo 会主动问你、催你、陪你把事情推进</div>
        </article>
        <article class="today-card" data-feature="memory">
          <div class="today-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9c4 0 7 2 8 5"/><path d="M21 4v5h-5"/></svg>
          </div>
          <div class="today-card-title">长期记忆</div>
          <div class="today-card-desc">偏好 / 约束 / 人物 / 事实 自动沉淀为可检索的档案</div>
        </article>
        <article class="today-card" data-feature="followup">
          <div class="today-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 17V9"/><path d="M11 17V5"/><path d="M16 17v-6"/><path d="M21 17V3"/></svg>
          </div>
          <div class="today-card-title">屏幕督促</div>
          <div class="today-card-desc">保留软件和窗口标题统计，久未操作时提醒你是不是该回来继续</div>
        </article>
        <article class="today-card" data-feature="workspace">
          <div class="today-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
          </div>
          <div class="today-card-title">读书陪伴</div>
          <div class="today-card-desc">导入文档、总结重点、追问理解，陪你把书和资料读下去</div>
        </article>
        <article class="today-card" data-feature="prompts">
          <div class="today-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8h10"/><path d="M7 12h7"/><path d="M7 16h4"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>
          </div>
          <div class="today-card-title">可调督促</div>
          <div class="today-card-desc">温和、普通、强督促三种模式，以后可在设置里自由切换</div>
        </article>
      </div>
    </section>

    <section class="today-section today-section-stats">
      <div class="today-section-head">
        <div>
          <div class="today-section-title">今日动态</div>
          <div class="today-section-sub">实时同步右侧资料台</div>
        </div>
        <button type="button" class="today-section-link" data-action="go-chat">进入对话 →</button>
      </div>
      <div class="today-stats">
        <div class="today-stat">
          <div class="today-stat-label">今日待跟进</div>
          <div class="today-stat-value" id="today-stat-followup">—</div>
          <div class="today-stat-sub" id="today-stat-followup-sub">按阶段+停滞排序</div>
        </div>
        <div class="today-stat">
          <div class="today-stat-label">本周新客户</div>
          <div class="today-stat-value" id="today-stat-newweek">—</div>
          <div class="today-stat-sub">最近 7 天新增</div>
        </div>
        <div class="today-stat">
          <div class="today-stat-label">今日联系</div>
          <div class="today-stat-value" id="today-stat-contacted">—</div>
          <div class="today-stat-sub">已发过消息的会话数</div>
        </div>
        <div class="today-stat">
          <div class="today-stat-label">记忆总数</div>
          <div class="today-stat-value" id="today-stat-mem">—</div>
          <div class="today-stat-sub">人物 / 偏好 / 知识 / 事实</div>
        </div>
      </div>
      <div class="today-quick">
        <div class="today-quick-col">
          <div class="today-quick-title">今日待跟进客户</div>
          <ul class="today-quick-list" id="today-quick-followup">
            <li class="today-quick-empty">加载中…</li>
          </ul>
        </div>
        <div class="today-quick-col">
          <div class="today-quick-title">行业热点</div>
          <ul class="today-quick-list" id="today-quick-hotspot">
            <li class="today-quick-empty">加载中…</li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</section>
`;
}

function createFollowupsView() {
  return `
<section class="followups-view" id="followups-view">
  <header class="followups-hero">
    <div class="followups-hero-text">
      <div class="followups-hero-eyebrow" id="followups-hero-eyebrow">今日跟进</div>
      <h2 class="followups-hero-title">跟进列表</h2>
      <p class="followups-hero-sub">今日到期、逾期未跟进、本周计划、长期未动 · 在这里一眼看完</p>
    </div>
    <div class="followups-hero-stats">
      <div class="followups-stat followups-stat-overdue">
        <div class="followups-stat-label">逾期</div>
        <div class="followups-stat-value" id="followups-count-overdue">0</div>
      </div>
      <div class="followups-stat followups-stat-today">
        <div class="followups-stat-label">今日</div>
        <div class="followups-stat-value" id="followups-count-today">0</div>
      </div>
      <div class="followups-stat followups-stat-week">
        <div class="followups-stat-label">本周</div>
        <div class="followups-stat-value" id="followups-count-week">0</div>
      </div>
      <div class="followups-stat followups-stat-stale">
        <div class="followups-stat-label">长期未动</div>
        <div class="followups-stat-value" id="followups-count-stale">0</div>
      </div>
    </div>
  </header>

  <div class="followups-toolbar">
    <button type="button" class="followups-refresh" id="followups-refresh" title="刷新">↻ 刷新</button>
    <span class="followups-updated-at" id="followups-updated-at"></span>
  </div>

  <div class="followups-grid">
    <section class="followups-group followups-group-overdue" data-group="overdue">
      <header class="followups-group-head">
        <span class="followups-group-title">逾期未跟进</span>
        <span class="followups-group-count" id="followups-list-count-overdue">0</span>
      </header>
      <ul class="followups-list" id="followups-list-overdue">
        <li class="followups-list-empty">加载中…</li>
      </ul>
    </section>
    <section class="followups-group followups-group-today" data-group="today">
      <header class="followups-group-head">
        <span class="followups-group-title">今日到期</span>
        <span class="followups-group-count" id="followups-list-count-today">0</span>
      </header>
      <ul class="followups-list" id="followups-list-today">
        <li class="followups-list-empty">加载中…</li>
      </ul>
    </section>
    <section class="followups-group followups-group-week" data-group="week">
      <header class="followups-group-head">
        <span class="followups-group-title">本周计划</span>
        <span class="followups-group-count" id="followups-list-count-week">0</span>
      </header>
      <ul class="followups-list" id="followups-list-week">
        <li class="followups-list-empty">加载中…</li>
      </ul>
    </section>
    <section class="followups-group followups-group-stale" data-group="stale">
      <header class="followups-group-head">
        <span class="followups-group-title">长期未动</span>
        <span class="followups-group-count" id="followups-list-count-stale">0</span>
      </header>
      <ul class="followups-list" id="followups-list-stale">
        <li class="followups-list-empty">加载中…</li>
      </ul>
    </section>
  </div>

  <!-- 写跟进记录弹窗 -->
  <div class="followups-modal" id="followups-modal" hidden>
    <div class="followups-modal-backdrop" data-followups-modal-close></div>
    <div class="followups-modal-card" role="dialog" aria-modal="true">
      <header class="followups-modal-head">
        <span class="followups-modal-title" id="followups-modal-title">写跟进记录</span>
        <button class="followups-modal-close" type="button" data-followups-modal-close aria-label="关闭">×</button>
      </header>
      <div class="followups-modal-body">
        <div class="followups-form-row">
          <label for="followups-modal-note">本次跟进记录</label>
          <textarea id="followups-modal-note" rows="4" placeholder="今天跟进了什么、客户反馈是什么…"></textarea>
        </div>
        <div class="followups-form-row">
          <label for="followups-modal-next">下次跟进日期</label>
          <input type="date" id="followups-modal-next">
        </div>
        <div class="followups-form-row">
          <label for="followups-modal-stage">跟进阶段（选填）</label>
          <input type="text" id="followups-modal-stage" placeholder="例如：Demo / POC / 报价">
        </div>
      </div>
      <footer class="followups-modal-foot">
        <button type="button" class="followups-btn followups-btn-ghost" data-followups-modal-close>取消</button>
        <button type="button" class="followups-btn followups-btn-primary" id="followups-modal-submit">保存跟进</button>
      </footer>
      <div class="followups-modal-feedback" id="followups-modal-feedback"></div>
    </div>
  </div>
</section>
`;
}

function createDashboardView() {
  return `
<section class="dashboard-view" id="dashboard-view">
  <header class="dashboard-hero">
    <div class="dashboard-hero-text">
      <div class="dashboard-hero-eyebrow">客户资产看板</div>
      <h2 class="dashboard-hero-title">数据看板</h2>
      <p class="dashboard-hero-sub">客户总量、阶段分布、跟进状态 · 老板一眼看全团队客户进展</p>
    </div>
    <div class="dashboard-toolbar">
      <button type="button" class="dashboard-refresh" id="dashboard-refresh" title="刷新">↻ 刷新</button>
      <span class="dashboard-updated-at" id="dashboard-updated-at"></span>
    </div>
  </header>

  <!-- KPI 卡片 -->
  <div class="dashboard-kpis">
    <div class="dashboard-kpi">
      <div class="dashboard-kpi-label">客户总数</div>
      <div class="dashboard-kpi-value" id="dashboard-kpi-total">—</div>
      <div class="dashboard-kpi-sub" id="dashboard-kpi-total-sub">在册客户</div>
    </div>
    <div class="dashboard-kpi">
      <div class="dashboard-kpi-label">今日联系</div>
      <div class="dashboard-kpi-value" id="dashboard-kpi-today">—</div>
      <div class="dashboard-kpi-sub">今天有互动的客户</div>
    </div>
    <div class="dashboard-kpi">
      <div class="dashboard-kpi-label">本周新增</div>
      <div class="dashboard-kpi-value" id="dashboard-kpi-week">—</div>
      <div class="dashboard-kpi-sub">近 7 天新加入客户</div>
    </div>
    <div class="dashboard-kpi dashboard-kpi-warn">
      <div class="dashboard-kpi-label">需关注</div>
      <div class="dashboard-kpi-value" id="dashboard-kpi-warn">—</div>
      <div class="dashboard-kpi-sub">逾期 + 长期未动</div>
    </div>
  </div>

  <!-- 主体分两列 -->
  <div class="dashboard-grid">
    <!-- 阶段分布 -->
    <section class="dashboard-card dashboard-card-distribution">
      <header class="dashboard-card-head">
        <span class="dashboard-card-title">客户阶段分布</span>
        <span class="dashboard-card-meta" id="dashboard-distribution-meta"></span>
      </header>
      <div class="dashboard-card-body">
        <ul class="dashboard-distribution-list" id="dashboard-distribution-list">
          <li class="dashboard-distribution-empty">加载中…</li>
        </ul>
      </div>
    </section>

    <!-- 跟进状态概览 -->
    <section class="dashboard-card dashboard-card-followups">
      <header class="dashboard-card-head">
        <span class="dashboard-card-title">跟进状态概览</span>
        <button type="button" class="dashboard-link" id="dashboard-goto-followups">进入跟进 →</button>
      </header>
      <div class="dashboard-card-body">
        <div class="dashboard-followup-bars">
          <div class="dashboard-followup-bar">
            <span class="dashboard-followup-bar-label">逾期</span>
            <span class="dashboard-followup-bar-value" id="dashboard-fb-overdue">0</span>
          </div>
          <div class="dashboard-followup-bar">
            <span class="dashboard-followup-bar-label">今日到期</span>
            <span class="dashboard-followup-bar-value" id="dashboard-fb-today">0</span>
          </div>
          <div class="dashboard-followup-bar">
            <span class="dashboard-followup-bar-label">本周计划</span>
            <span class="dashboard-followup-bar-value" id="dashboard-fb-week">0</span>
          </div>
          <div class="dashboard-followup-bar">
            <span class="dashboard-followup-bar-label">长期未动</span>
            <span class="dashboard-followup-bar-value" id="dashboard-fb-stale">0</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 最近活跃客户 -->
    <section class="dashboard-card dashboard-card-recent">
      <header class="dashboard-card-head">
        <span class="dashboard-card-title">最近活跃客户</span>
        <span class="dashboard-card-meta">近 14 天有更新的客户</span>
      </header>
      <div class="dashboard-card-body">
        <ul class="dashboard-customer-list" id="dashboard-recent-list">
          <li class="dashboard-customer-empty">加载中…</li>
        </ul>
      </div>
    </section>

    <!-- 长期未动客户 -->
    <section class="dashboard-card dashboard-card-stale">
      <header class="dashboard-card-head">
        <span class="dashboard-card-title">长期未跟进</span>
        <span class="dashboard-card-meta">超过 7 天未更新，优先处理</span>
      </header>
      <div class="dashboard-card-body">
        <ul class="dashboard-customer-list" id="dashboard-stale-list">
          <li class="dashboard-customer-empty">加载中…</li>
        </ul>
      </div>
    </section>
  </div>
</section>
`;
}

function createBusinessView() {
  return `
<section class="business-view nimo-reminders-view" id="business-view" hidden>
  <header class="business-hero">
    <div class="business-hero-text">
      <div class="business-hero-eyebrow">Nimo Reminder</div>
      <h2 class="business-hero-title">提醒中心</h2>
      <p class="business-hero-sub">写一句要做的事、选个时间，Nimo 会到点用桌面通知和聊天里提醒你；可以一键完成、稍后再提或删除。</p>
    </div>
    <div class="business-hero-actions">
      <button type="button" class="business-jump business-jump-primary" id="nimo-reminder-quick-focus">写一条新提醒</button>
    </div>
  </header>

  <section class="nimo-reminder-form" id="nimo-reminder-form">
    <div class="nrf-row nrf-row-task">
      <input type="text" id="nrf-task" class="nrf-task" placeholder="例如：联系客户确认方案 / 晚上九点读 20 分钟书" maxlength="200" autocomplete="off">
    </div>
    <div class="nrf-row nrf-row-time">
      <label class="nrf-label" for="nrf-due-at">时间</label>
      <input type="datetime-local" id="nrf-due-at" class="nrf-due-at">
      <div class="nrf-quick" role="group" aria-label="快速时间">
        <button type="button" data-quick="10">+10 分钟</button>
        <button type="button" data-quick="30">+30 分钟</button>
        <button type="button" data-quick="60">+1 小时</button>
        <button type="button" data-quick="180">+3 小时</button>
      </div>
    </div>
    <div class="nrf-row nrf-row-repeat">
      <label class="nrf-label" for="nrf-recurrence">重复</label>
      <select id="nrf-recurrence" class="nrf-recurrence">
        <option value="">不重复</option>
        <option value="daily">每天这个时间</option>
        <option value="weekly">每周这一天</option>
        <option value="monthly">每月这一天</option>
      </select>
    </div>
    <div class="nrf-row nrf-row-submit">
      <span class="nrf-feedback" id="nrf-feedback"></span>
      <button type="button" id="nrf-submit" class="nrf-submit">添加提醒</button>
    </div>
  </section>

  <section class="nimo-reminder-list-wrap">
    <header class="nimo-reminder-list-head">
      <div>
        <h3>待办提醒</h3>
        <span class="nrl-count" id="nrl-count"></span>
      </div>
      <button type="button" class="nrl-refresh" id="nrl-refresh">刷新</button>
    </header>
    <div class="nimo-reminder-list" id="nimo-reminder-list">
      <div class="nrl-empty">加载中…</div>
    </div>
  </section>

  <section class="nimo-device-panel" id="nimo-device-panel">
    <header class="ndp-head">
      <div>
        <div class="ndp-kicker">硬件连接</div>
        <h3>Nimo 设备</h3>
      </div>
      <button type="button" class="ndp-refresh" id="ndp-refresh">刷新设备</button>
    </header>
    <div class="ndp-body">
      <div class="ndp-list" id="ndp-list">
        <div class="ndp-empty">还没有硬件设备连接。之后 ESP32 屏幕、按钮、语音模块会显示在这里。</div>
      </div>
      <div class="ndp-guide">
        <span class="ndp-guide-label">设备 API</span>
        <code>/device/register</code>
        <code>/device/next-reminder</code>
        <code>/device/complete</code>
        <code>/device/snooze</code>
        <code>/device/stream</code>
      </div>
    </div>
  </section>

  <section class="nimo-today-summary" id="nimo-today-summary">
    <header class="nts-head">
      <div>
        <div class="nts-kicker">今日总结</div>
        <h3>Nimo 帮你看看今天怎么样</h3>
      </div>
      <div class="nts-head-actions">
        <button type="button" class="nts-btn nts-btn-ghost" id="nts-refresh">刷新</button>
        <button type="button" class="nts-btn nts-btn-primary" id="nts-generate">AI 总结今天</button>
        <button type="button" class="nts-btn nts-btn-ghost" id="nts-open-full">查看完整总结 →</button>
      </div>
    </header>

    <div class="nts-stats">
      <div class="nts-stat">
        <span class="nts-stat-label">今日待办</span>
        <strong class="nts-stat-value" id="nts-stat-today">—</strong>
        <span class="nts-stat-sub" id="nts-stat-today-sub">未到点 / 已到点</span>
      </div>
      <div class="nts-stat">
        <span class="nts-stat-label">今日已完成</span>
        <strong class="nts-stat-value" id="nts-stat-done">—</strong>
        <span class="nts-stat-sub">本日完成的提醒</span>
      </div>
      <div class="nts-stat">
        <span class="nts-stat-label">下一条到点</span>
        <strong class="nts-stat-value" id="nts-stat-next">—</strong>
        <span class="nts-stat-sub" id="nts-stat-next-sub">距离当前</span>
      </div>
      <div class="nts-stat">
        <span class="nts-stat-label">电脑用屏</span>
        <strong class="nts-stat-value" id="nts-stat-screen">—</strong>
        <span class="nts-stat-sub" id="nts-stat-screen-sub">今日有效使用</span>
      </div>
    </div>

    <article class="nts-ai">
      <div class="nts-ai-head">
        <div class="nts-ai-kicker">AI 精简总结</div>
        <span class="nts-ai-meta" id="nts-ai-meta">还没生成今日总结</span>
      </div>
      <div class="nts-ai-text" id="nts-ai-text">点「AI 总结今天」让 Nimo 总结你今天做了什么、干了什么。</div>
    </article>
  </section>
</section>
`;
}

function createActivityReportView() {
  return `
<section class="activity-report-view" id="activity-report-view" hidden>
  <header class="nimo-summary-hero">
    <div>
      <div class="nimo-summary-kicker"><span></span>每天做了什么 · AI 精简总结</div>
      <h1>总结</h1>
      <p>上面看今天屏幕、软件和文件使用率；下面让 Nimo 用 AI 精简总结今天干了什么、接下来该做什么。</p>
    </div>
    <div class="nimo-summary-actions">
      <input type="date" id="activity-date" class="ar-date">
      <button type="button" class="ar-btn ar-btn-ghost" id="activity-refresh">刷新</button>
      <button type="button" class="ar-btn ar-btn-primary" id="daily-summary-generate">AI 总结所选日期</button>
    </div>
  </header>

  <section class="nimo-summary-top">
    <article class="nimo-summary-meter-card">
      <div class="nimo-summary-card-head">
        <div>
          <h2>屏幕使用率</h2>
          <p id="activity-kpi-events">尚未采集</p>
        </div>
        <div class="ar-status-pill" id="ar-status-pill">
          <span class="ar-status-dot" id="ar-status-dot"></span>
          <span id="ar-status-text">正在读取状态…</span>
        </div>
      </div>
      <div class="nimo-screen-meter">
        <div class="nimo-screen-ring" id="nimo-screen-ring" style="--ratio:0%">
          <strong id="nimo-screen-ratio">0%</strong>
          <span>有效使用</span>
        </div>
        <div class="nimo-screen-stats">
          <div><span>总在线</span><strong id="activity-kpi-total">0秒</strong></div>
          <div><span>有效使用</span><strong id="activity-kpi-work">0秒</strong></div>
          <div><span>空闲/离开</span><strong id="activity-kpi-idle">0秒</strong></div>
          <div><span>当前前台</span><strong id="activity-kpi-current">—</strong><small id="activity-kpi-current-sub">—</small></div>
        </div>
      </div>
      <div class="ar-heatmap nimo-summary-heatmap" id="activity-heatmap"></div>
    </article>

    <article class="nimo-summary-usage-card">
      <div class="nimo-summary-card-head">
        <div>
          <h2>软件使用率</h2>
          <p id="activity-apps-meta">按累计时长排序</p>
        </div>
      </div>
      <div class="ar-apps" id="activity-app-list"></div>
    </article>

    <article class="nimo-summary-usage-card">
      <div class="nimo-summary-card-head">
        <div>
          <h2>文件使用率</h2>
          <p id="activity-files-meta">从窗口标题识别文档/文件名</p>
        </div>
      </div>
      <div class="ar-apps" id="activity-file-list"></div>
    </article>
  </section>

  <section class="nimo-summary-bottom">
    <article class="nimo-ai-summary-card">
      <div class="nimo-summary-card-head">
        <div>
          <h2>AI 精简总结</h2>
          <p id="daily-summary-meta">Nimo 会根据提醒、软件、文件和空闲情况总结。</p>
        </div>
        <button type="button" class="ar-btn ar-btn-ghost" id="daily-summary-send-chat">发到聊天</button>
      </div>
      <div class="nimo-ai-summary-text" id="daily-summary-text">选择日期后，点击「AI 总结所选日期」，让我总结那天做了什么、干了什么。</div>
    </article>

    <article class="nimo-summary-usage-card">
      <div class="nimo-summary-card-head">
        <div>
          <h2>最近活动</h2>
          <p>只显示前台软件与窗口标题，不记录键盘输入。</p>
        </div>
      </div>
      <div class="ar-events" id="activity-event-list"></div>
    </article>
  </section>

  <section class="ar-section ar-card ar-rules-inline ar-rules-v2" id="ar-rules-panel" hidden>
    <header class="ar-rules-head">
      <div>
        <div class="ar-rules-eyebrow">透明可查 · 员工 / 老板都能看</div>
        <h2 class="ar-rules-title">分类规则与软件目录</h2>
        <p class="ar-rules-subtitle">先看规则边界，再查具体软件。所有异常状态会单独展示，不混进软件排行。</p>
      </div>
      <span class="ar-rules-safe-badge">页面内展示</span>
    </header>

    <div class="ar-rules-layout">
      <aside class="ar-rules-sidebar">
        <div class="ar-rules-side-block">
          <div class="ar-rules-side-title">规则总览</div>
          <div class="ar-rule-summary-card">
            <span class="ar-rule-summary-kicker">采样</span>
            <strong>5 秒 / 次</strong>
            <p id="ar-rule-sample">—</p>
          </div>
          <div class="ar-rule-summary-card">
            <span class="ar-rule-summary-kicker">空闲</span>
            <strong>5 分钟无操作</strong>
            <p id="ar-rule-idle">—</p>
          </div>
          <div class="ar-rule-summary-card">
            <span class="ar-rule-summary-kicker">AI</span>
            <strong>结构化判断</strong>
            <p id="ar-rule-screen">—</p>
          </div>
        </div>

        <div class="ar-rules-side-block">
          <div class="ar-rules-side-title">软件分类导航</div>
          <div class="ar-rules-nav" id="ar-rules-legend"></div>
        </div>
      </aside>

      <main class="ar-rules-content">
        <section class="ar-rules-panel ar-rules-privacy-panel">
          <div class="ar-rules-panel-head">
            <div>
              <h3>隐私边界</h3>
              <p>哪些绝对不会采，员工端也能看到。</p>
            </div>
            <span class="ar-rules-safe-badge">透明授权</span>
          </div>
          <ul class="ar-rules-privacy" id="ar-rule-privacy"></ul>
        </section>

        <section class="ar-rules-panel ar-rules-directory-panel">
          <div class="ar-rules-panel-head">
            <div>
              <h3>软件分类目录</h3>
              <p>默认折叠展示，搜索后只展开匹配分类。</p>
            </div>
            <input type="text" id="ar-rule-search" class="ar-rules-search" placeholder="搜索软件名 / 进程名，例如：豆包、chrome、微信">
          </div>
          <div class="ar-rules-categories" id="ar-rules-categories"></div>
        </section>
      </main>
    </div>

    <footer class="ar-rules-foot">
      <span class="ar-rules-foot-hint">未识别的软件会进入「未分类」，后续可以继续补充目录，不影响原始采集记录。</span>
    </footer>
  </section>
</section>
`;
}

function createReadingDocumentsView() {
  return `
<section class="reading-view" id="reading-view" hidden>
  <div class="reading-inner">
    <header class="reading-hero">
      <div>
        <div class="reading-kicker"><span></span>文档工作台 · 导入 / 总结 / 陪读</div>
        <h1>文档</h1>
        <p>把要分析的文本、网页、CSV 或粘贴内容放到这里。导入后，Nimo 会保存文档摘要，并在聊天里带着最近文档陪你阅读、总结和提问。</p>
      </div>
      <button type="button" class="ar-btn ar-btn-ghost" id="reading-refresh">刷新文档</button>
    </header>

    <section class="nimo-reading-card reading-main-card">
      <div class="nimo-summary-card-head">
        <div>
          <h2>文档导入 / 陪读</h2>
          <p>支持文本、网页、CSV、DOCX、XLSX 和粘贴内容；PDF/PPT 暂需先转成文本或复制正文。</p>
        </div>
      </div>
      <div class="nimo-reading-grid">
        <div class="nimo-reading-import">
          <input class="settings-input" id="reading-title" type="text" placeholder="文档标题（可选）">
          <input class="settings-input" id="reading-file" type="file" accept=".txt,.md,.csv,.json,.html,.htm,.docx,.xlsx,text/*">
          <textarea class="settings-input nimo-reading-textarea" id="reading-content" rows="9" placeholder="也可以直接粘贴一段文档内容…"></textarea>
          <div class="nimo-reading-actions">
            <button type="button" class="ar-btn ar-btn-primary" id="reading-import">导入并总结</button>
            <span id="reading-feedback"></span>
          </div>
        </div>
        <div class="nimo-reading-list" id="reading-list">
          <div class="ar-empty ar-empty-inline">还没有导入文档。</div>
        </div>
      </div>
    </section>
  </div>
</section>`;
}

function createDeviceView() {
  return `
<section class="device-view" id="device-view" hidden>
  <div class="device-inner">
    <section class="device-hero">
      <div>
        <div class="device-kicker"><span></span>硬件接入 · ESP32-S3 准备区</div>
        <h1>Nimo 设备中心</h1>
        <p>硬件还没到也可以先固定接入协议、模拟设备心跳、测试下一条提醒。等 ESP32-S3 到手后，固件直接按这里的地址和接口接入。</p>
      </div>
      <div class="device-actions">
        <button type="button" class="ar-btn ar-btn-ghost" id="device-refresh">刷新</button>
        <button type="button" class="ar-btn ar-btn-primary" id="device-sim-register">注册模拟设备</button>
      </div>
    </section>

    <section class="device-grid">
      <article class="device-panel device-access-panel">
        <div class="device-panel-head">
          <div>
            <h2>接入地址</h2>
            <p>ESP32-S3 固件里需要配置这个服务地址。</p>
          </div>
          <span class="device-state" id="device-lan-state">检测中</span>
        </div>
        <div class="device-url-row">
          <code id="device-access-url">http://127.0.0.1:52557</code>
          <button type="button" class="ar-btn ar-btn-ghost" id="device-copy-url">复制</button>
        </div>
        <div class="device-address-list" id="device-address-list"></div>
        <div class="device-lan-hint" id="device-lan-hint"></div>
      </article>

      <article class="device-panel">
        <div class="device-panel-head">
          <div>
            <h2>硬件语音</h2>
            <p>从软件端控制 ESP32-S3 麦克风是否进入识别。</p>
          </div>
          <span class="device-state" id="device-voice-badge">检测中</span>
        </div>
        <div class="device-sim-actions">
          <button type="button" class="ar-btn ar-btn-primary" id="device-voice-enable">开始收音</button>
          <button type="button" class="ar-btn ar-btn-ghost" id="device-voice-disable">停止收音</button>
        </div>
        <div class="device-lan-hint" id="device-voice-state"></div>
      </article>

      <article class="device-panel">
        <div class="device-panel-head">
          <div>
            <h2>模拟设备</h2>
            <p>无需硬件，先验证注册、心跳、推送闭环。</p>
          </div>
        </div>
        <div class="device-sim-actions">
          <button type="button" class="ar-btn ar-btn-primary" id="device-sim-heartbeat">发送心跳</button>
          <button type="button" class="ar-btn ar-btn-ghost" id="device-test-push">测试推送</button>
        </div>
        <div class="device-log" id="device-log"></div>
      </article>
    </section>

    <section class="device-grid device-grid-wide">
      <article class="device-panel">
        <div class="device-panel-head">
          <div>
            <h2>硬件接入清单</h2>
            <p>ESP32-S3 到手后按这个顺序接入。</p>
          </div>
        </div>
        <ol class="device-checklist">
          <li><strong>同一网络</strong><span>电脑和 ESP32-S3 连接同一个 Wi-Fi。</span></li>
          <li><strong>开启 LAN</strong><span>在 G:\\emo 运行 <code>npm run start:lan</code>，再复制局域网地址。</span></li>
          <li><strong>协议自检</strong><span>接口改动后运行 <code>npm run smoke:device</code>，确认设备协议没有破坏。</span></li>
          <li><strong>注册设备</strong><span>开机后调用 <code>POST /device/register</code> 上报能力。</span></li>
          <li><strong>保持心跳</strong><span>每 30 秒调用 <code>POST /device/heartbeat</code>，设备中心会显示在线。</span></li>
          <li><strong>轮询提醒</strong><span>每 15 秒调用 <code>GET /device/next-reminder</code>，屏幕展示下一条提醒。</span></li>
        </ol>
      </article>

      <article class="device-panel">
        <div class="device-panel-head">
          <div>
            <h2>当前设备配置</h2>
            <p>固件可以从 <code>/device/config</code> 动态读取这些值。</p>
          </div>
        </div>
        <div class="device-config-list" id="device-config-list"></div>
      </article>
    </section>

    <section class="device-grid device-grid-wide">
      <article class="device-panel">
        <div class="device-panel-head">
          <div>
            <h2>下一条硬件提醒</h2>
            <p>硬件屏幕会优先展示这条 active 提醒。</p>
          </div>
          <button type="button" class="ar-btn ar-btn-ghost" id="device-next-refresh">重新拉取</button>
        </div>
        <div class="device-next-reminder" id="device-next-reminder"></div>
        <div class="device-sim-actions">
          <button type="button" class="ar-btn ar-btn-primary" id="device-complete-reminder" disabled>模拟完成</button>
          <button type="button" class="ar-btn ar-btn-ghost" id="device-snooze-reminder" disabled>模拟稍后 10 分钟</button>
        </div>
      </article>

      <article class="device-panel">
        <div class="device-panel-head">
          <div>
            <h2>在线设备</h2>
            <p>90 秒内有心跳的设备会显示在线。</p>
          </div>
        </div>
        <div class="device-list" id="device-list"></div>
      </article>
    </section>

    <section class="device-panel">
      <div class="device-panel-head">
        <div>
          <h2>硬件协议 v1</h2>
          <p>第一版固件只需要实现这些 HTTP 接口。</p>
        </div>
      </div>
      <div class="device-protocol-list" id="device-protocol-list"></div>
    </section>

    <section class="device-panel device-firmware-panel">
      <div class="device-panel-head">
        <div>
          <h2>ESP32-S3 固件请求示例</h2>
          <p>把示例里的 base URL 换成设备中心显示的局域网地址即可。</p>
        </div>
      </div>
      <div class="device-firmware-examples" id="device-firmware-examples"></div>
    </section>
  </div>
</section>`;
}

export function createBrainUiMarkup() {
  return [
    createGraphStage(),
    createPrimaryPanel(),
    createSecondaryPanel(),
    createConsole(),
    createTodayView(),
    createBusinessView(),
    createActivityReportView(),
    createReadingDocumentsView(),
    createDeviceView(),
    createPanelTabs(),
    createTooltip(),
    createOrgWorkspaceModal(),
    createSettingsModal(),
    createVideoPanel(),
    createMusicPanel(),
    createImagePanel(),
    createHotspotPanel(),
    createPersonCardPanel(),
    createDocPanel(),
    createIndustryOnboarding(),
  ].join("\n\n");
}

// 把"← 返回对话"胶囊按钮注入到每个全屏 modal 自己的 header 左侧
// 这样按钮跟原标题对齐成一行，避免"按钮飘在标题之上"的视觉重叠
const BACK_PILL_HTML = `
<button type="button" class="fullview-back-pill" data-view-back title="返回对话 (Esc)">
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
  <span>返回对话</span>
</button>`;

const VIEW_HEADER_SELECTOR = {
  [/* memory */ 'memory']: '#pulse-memory-overlay .pulse-mm-head',
  [/* workspace */ 'workspace']: '#org-overlay .org-header',
  [/* settings */ 'settings']: '#settings-overlay .settings-header',
};

function injectViewToolbar(view) {
  const sel = VIEW_HEADER_SELECTOR[view];
  if (!sel) return;
  const header = document.querySelector(sel);
  if (!header) return;
  if (!header.querySelector('.fullview-back-pill')) {
    header.insertAdjacentHTML('afterbegin', BACK_PILL_HTML);
    header.classList.add('is-fullview-header');
  }
  // 第一次进入时，给 modal 做"hero + 左 nav"全屏页布局
  if (view === 'memory') ensureMemoryFullviewLayout();
  else if (view === 'workspace') ensureWorkspaceFullviewLayout();
}

/* 把资料台 modal 改造为「hero + 左 nav + 右内容」全屏页布局 */
function ensureWorkspaceFullviewLayout() {
  const modal = document.querySelector('#org-overlay .org-modal');
  if (!modal || modal.dataset.fullviewReady === '1') return;
  const header = modal.querySelector('.org-header');
  const subtitle = modal.querySelector('.org-subtitle');
  const tabs = modal.querySelector('.org-tabs');
  const content = modal.querySelector('.org-content');
  if (!header || !tabs || !content) return;

  // 1) 注入 hero（标题 + 副 + stats）
  if (!modal.querySelector('.view-hero')) {
    const hero = document.createElement('section');
    hero.className = 'view-hero';
    hero.setAttribute('data-view-hero', 'workspace');
    hero.innerHTML = `
      <div class="view-hero-text">
        <h2 class="view-hero-title">公司与团队资料台</h2>
        <p class="view-hero-sub">统一管理公司信息、客户跟进、员工资料 —— AI 会用这些做更准确的回应</p>
      </div>
      <div class="view-hero-stats">
        <div class="view-hero-stat" data-org-tab-jump="customer" role="button" tabindex="0">
          <div class="view-hero-stat-label">客户</div>
          <div class="view-hero-stat-value" id="org-stat-customer">—</div>
          <div class="view-hero-stat-sub">在册客户</div>
        </div>
        <div class="view-hero-stat" data-org-tab-jump="employee" role="button" tabindex="0">
          <div class="view-hero-stat-label">员工</div>
          <div class="view-hero-stat-value" id="org-stat-employee">—</div>
          <div class="view-hero-stat-sub">团队成员</div>
        </div>
        <div class="view-hero-stat" data-org-tab-jump="company" role="button" tabindex="0">
          <div class="view-hero-stat-label">公司信息</div>
          <div class="view-hero-stat-value" id="org-stat-company-fill">—</div>
          <div class="view-hero-stat-sub">完整度</div>
        </div>
      </div>`;
    header.insertAdjacentElement('afterend', hero);
  }
  // 副标题原本"把公司、客户、员工都放在..."与 hero 重复，隐藏
  if (subtitle) subtitle.style.display = 'none';

  // 2) 把 tabs + content 包成 .org-shell 用于左右两栏布局
  if (!modal.querySelector('.org-shell')) {
    const shell = document.createElement('div');
    shell.className = 'org-shell';
    tabs.parentNode.insertBefore(shell, tabs);
    shell.appendChild(tabs);
    shell.appendChild(content);
  }

  modal.dataset.fullviewReady = '1';
  window.dispatchEvent(new CustomEvent('pulse:workspace-layout-ready'));
}

/* 把记忆 modal 改造为「hero + 左 nav + 右内容」全屏页布局 */
function ensureMemoryFullviewLayout() {
  const modal = document.querySelector('#pulse-memory-overlay .pulse-mm-modal');
  if (!modal || modal.dataset.fullviewReady === '1') return;
  const header = modal.querySelector('.pulse-mm-head');
  const tabs = modal.querySelector('.pulse-mm-tabs');
  const toolbar = modal.querySelector('.pulse-mm-toolbar');
  const newForm = modal.querySelector('.pulse-mm-new');
  const listHead = modal.querySelector('.pulse-mm-list-head');
  const listEl = modal.querySelector('.pulse-mm-list');
  if (!header || !tabs || !toolbar || !listEl) return;

  if (!modal.querySelector('.view-hero')) {
    const hero = document.createElement('section');
    hero.className = 'view-hero';
    hero.setAttribute('data-view-hero', 'memory');
    hero.innerHTML = `
      <div class="view-hero-text">
        <h2 class="view-hero-title">Nimo 记忆中心</h2>
        <p class="view-hero-sub">这里展示 Nimo 记住的你：偏好、习惯、常读文档、重要对象和反复出现的待办。它靠这些记忆主动陪伴，而不是每次从零开始。</p>
      </div>
      <div class="view-hero-stats">
        <div class="view-hero-stat">
          <div class="view-hero-stat-label">已记住</div>
          <div class="view-hero-stat-value" id="mm-stat-total">—</div>
          <div class="view-hero-stat-sub">条沉淀</div>
        </div>
        <div class="view-hero-stat">
          <div class="view-hero-stat-label">关于用户</div>
          <div class="view-hero-stat-value" id="mm-stat-about">—</div>
          <div class="view-hero-stat-sub">偏好 / 约束 / 人物</div>
        </div>
        <div class="view-hero-stat">
          <div class="view-hero-stat-label">知识</div>
          <div class="view-hero-stat-value" id="mm-stat-knowledge">—</div>
          <div class="view-hero-stat-sub">文档 / 方法 / 概念</div>
        </div>
        <div class="view-hero-stat">
          <div class="view-hero-stat-label">物体</div>
          <div class="view-hero-stat-value" id="mm-stat-object">—</div>
          <div class="view-hero-stat-sub">具体物品 / 实体</div>
        </div>
      </div>`;
    header.insertAdjacentElement('afterend', hero);
  }

  const memoryHero = modal.querySelector('[data-view-hero="memory"]');
  if (!modal.querySelector('.pulse-mm-companion-card')) {
    const companionCard = document.createElement('section');
    companionCard.className = 'pulse-mm-companion-card';
    companionCard.innerHTML = `
      <div class="pulse-mm-companion-copy">
        <strong>客户演示重点：Nimo 不是一次性 AI，它会长期记住用户。</strong>
        <span>这些记忆会用于后续提醒、文档陪读、每日总结和主动督促，让 Nimo 越用越懂用户。</span>
      </div>
      <div class="pulse-mm-companion-grid">
        <div><b>记住偏好</b><span>提醒语气、工作习惯、沟通边界</span></div>
        <div><b>记住文档</b><span>最近阅读、重点资料、反复讨论的内容</span></div>
        <div><b>记住待办</b><span>客户跟进、长期目标、容易拖延的事项</span></div>
      </div>`;
    (memoryHero || header).insertAdjacentElement('afterend', companionCard);
  }

  // 把 tabs + (toolbar + newForm + list) 包成左右两栏 shell
  if (!modal.querySelector('.pulse-mm-shell')) {
    const shell = document.createElement('div');
    shell.className = 'pulse-mm-shell';
    tabs.parentNode.insertBefore(shell, tabs);
    shell.appendChild(tabs);
    // 右栏：toolbar / 引导填记忆 / 列表
    const rightCol = document.createElement('div');
    rightCol.className = 'pulse-mm-side-content';
    rightCol.appendChild(toolbar);
    if (listHead) rightCol.appendChild(listHead);
    rightCol.appendChild(listEl);
    if (newForm) rightCol.appendChild(newForm);
    shell.appendChild(rightCol);
  }

  modal.dataset.fullviewReady = '1';
}

function createPulseAppBar() {
  return `
<header id="pulse-app-bar">
  <div class="nb-brand">
    <div class="nb-logo"><img src="./build/logo.svg" alt="Nimo 提醒助手"></div>
    <span>Nimo 提醒助手</span>
  </div>
  <div class="nb-divider"></div>
  <nav class="nb-nav">
    <button class="active" data-nav="home">首页</button>
    <button data-nav="business">提醒</button>
    <button data-nav="activity">总结</button>
    <button data-nav="reading">文档</button>
    <button data-nav="memory">记忆</button>
    <button data-nav="device">设备</button>
    <button data-nav="chat">聊天</button>
    <button data-nav="settings">设置</button>
  </nav>
  <div class="nb-spacer"></div>
  <div class="nb-industry-switcher" id="nb-industry-switcher" hidden>
    <button class="nb-ind-btn" id="nb-ind-btn" type="button" title="切换行业">
      <span id="nb-ind-icon"></span>
      <span class="nb-ind-copy">
        <span class="nb-ind-kicker">当前工作区</span>
        <span id="nb-ind-name">行业</span>
      </span>
      <span class="nb-ind-arrow">▾</span>
    </button>
    <div class="nb-ind-dropdown" id="nb-ind-dropdown" hidden></div>
  </div>
  <div class="nb-meta">
    <span class="nb-version" id="nb-version">v0.1.5</span>
    <div class="nb-user nb-cloud-user" id="nb-cloud-user" title="云授权账号">
      <button class="nb-cloud-btn" id="nb-cloud-btn" type="button">
        <div class="nb-avatar" id="nb-cloud-avatar">A</div>
        <span class="nb-cloud-copy">
          <span id="nb-cloud-email">授权账号</span>
          <small id="nb-cloud-mode">校验中</small>
        </span>
      </button>
      <div class="nb-cloud-menu" id="nb-cloud-menu" hidden>
        <strong id="nb-cloud-menu-email">授权账号</strong>
        <span id="nb-cloud-menu-status">订阅状态</span>
        <span id="nb-cloud-menu-expiry">到期时间</span>
        <button type="button" id="nb-cloud-logout">退出登录</button>
      </div>
    </div>
  </div>
</header>`;
}

const VIEW_HOME = 'home';
const VIEW_CHAT = 'chat';
const VIEW_BUSINESS = 'business';
const VIEW_FOLLOWUPS = 'followups';
const VIEW_DASHBOARD = 'dashboard';
const VIEW_ACTIVITY = 'activity';
const VIEW_READING = 'reading';
const VIEW_DEVICE = 'device';
const VIEW_MEMORY = 'memory';
const VIEW_WORKSPACE = 'workspace';
const VIEW_SETTINGS = 'settings';
const ALL_VIEWS = [VIEW_HOME, VIEW_CHAT, VIEW_BUSINESS, VIEW_ACTIVITY, VIEW_READING, VIEW_DEVICE, VIEW_MEMORY, VIEW_WORKSPACE, VIEW_SETTINGS];
const STORAGE_VIEW = 'pulse-active-view';

// 每个 view 对应的容器元素 id（用来切显隐）
const VIEW_CONTAINERS = {
  [VIEW_HOME]: 'today-view',
  [VIEW_CHAT]: 'chat-area',
  [VIEW_BUSINESS]: 'business-view',
  [VIEW_ACTIVITY]: 'activity-report-view',
  [VIEW_READING]: 'reading-view',
  [VIEW_DEVICE]: 'device-view',
  [VIEW_MEMORY]: 'pulse-memory-overlay',
  [VIEW_WORKSPACE]: 'org-overlay',
  [VIEW_SETTINGS]: 'settings-overlay',
};
const VIEW_FEATURES = {
  [VIEW_CHAT]: 'ai_chat',
  [VIEW_BUSINESS]: 'reminders',
  [VIEW_ACTIVITY]: 'activity_supervision',
  [VIEW_WORKSPACE]: 'customer_crm',
};
const FEATURE_LABELS = {
  ai_chat: 'AI 对话',
  reminders: '提醒中心',
  activity_supervision: '总结',
  company_knowledge: '知识库',
  customer_crm: '客户管理',
};

function normalizeView(view) {
  if (view === VIEW_FOLLOWUPS || view === VIEW_DASHBOARD) return VIEW_BUSINESS;
  return ALL_VIEWS.includes(view) ? view : VIEW_CHAT;
}

function canUseView(view) {
  const feature = VIEW_FEATURES[normalizeView(view)];
  if (!feature) return true;
  const auth = window.NimoCloudAuth || window.NewPulseCloudAuth;
  return Boolean(auth?.canUseFeature?.(feature));
}

function showCloudPermissionToast(feature) {
  const label = FEATURE_LABELS[feature] || '该功能';
  let toast = document.getElementById('cloud-license-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cloud-license-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<strong>功能未开通</strong><span>${label} 需要订阅权限，请联系管理员开通。</span>`;
  toast.classList.add('visible');
  clearTimeout(showCloudPermissionToast._timer);
  showCloudPermissionToast._timer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function updateCloudNavLocks() {
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    const target = normalizeView(btn.dataset.nav);
    const feature = VIEW_FEATURES[target];
    const locked = feature ? !canUseView(target) : false;
    btn.classList.toggle('is-cloud-locked', locked);
    if (locked) btn.setAttribute('title', `${FEATURE_LABELS[feature] || '该功能'} 未开通`);
  });
}

function updateCloudAccountChip() {
  const auth = window.NimoCloudAuth || window.NewPulseCloudAuth || {};
  const license = auth.license || {};
  const user = license.user || auth.user || {};
  const email = user.email || '未登录';
  const mode = license.mode === 'paid' ? '付费版' : license.mode === 'free' ? '免费版' : '授权中';
  const expiresAt = license.expiresAt ? new Date(license.expiresAt).toLocaleString() : '未设置到期时间';
  const emailEl = document.getElementById('nb-cloud-email');
  const modeEl = document.getElementById('nb-cloud-mode');
  const avatarEl = document.getElementById('nb-cloud-avatar');
  const menuEmail = document.getElementById('nb-cloud-menu-email');
  const menuStatus = document.getElementById('nb-cloud-menu-status');
  const menuExpiry = document.getElementById('nb-cloud-menu-expiry');
  if (emailEl) emailEl.textContent = email;
  if (modeEl) modeEl.textContent = `${mode} · ${license.subscriptionStatus || 'unknown'}`;
  if (avatarEl) avatarEl.textContent = String(email[0] || 'A').toUpperCase();
  if (menuEmail) menuEmail.textContent = email;
  if (menuStatus) menuStatus.textContent = `当前模式：${mode} · 订阅：${license.subscriptionStatus || '-'}`;
  if (menuExpiry) menuExpiry.textContent = `到期时间：${expiresAt}`;
  updateCloudNavLocks();
}

function setActiveView(view) {
  const v = normalizeView(view);
  if (!canUseView(v)) {
    showCloudPermissionToast(VIEW_FEATURES[v]);
    return false;
  }
  const prev = document.body.getAttribute('data-active-view');
  if (prev === v) return true; // 防止重复触发
  document.body.setAttribute('data-active-view', v);

  // 切显隐：用 style.display 直接强制，避免被各容器自身 display 规则覆盖
  for (const [name, id] of Object.entries(VIEW_CONTAINERS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const active = name === v;
    el.hidden = !active;
    el.style.display = active ? '' : 'none';
    // 进入动效：每次切换给新激活的容器加一次性 class
    if (active) {
      el.classList.remove('view-enter-anim');
      // 强制 reflow 让动画重跑
      void el.offsetWidth;
      el.classList.add('view-enter-anim');
    }
  }

  // 切到三个全屏弹层视图时，把"← 返回对话"胶囊注入到 modal 自己的 header 内
  if (v === VIEW_MEMORY || v === VIEW_WORKSPACE || v === VIEW_SETTINGS) {
    injectViewToolbar(v);
  }

  // 切 view 时关掉所有不在 view 体系内的浮层（persona / prompts / industry onboard 等）
  // 否则它们会叠在新 view 上面
  ['pulse-persona-overlay', 'pulse-prompts-popover', 'pulse-industry-onboarding'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.hidden) el.hidden = true;
  });

  // 同步 nav 高亮
  document.querySelectorAll('#pulse-app-bar .nb-nav button').forEach((b) => {
    const tgt = b.dataset.nav;
    if (!tgt) return;
    b.classList.toggle('active', tgt === v);
  });

  try { localStorage.setItem(STORAGE_VIEW, v); } catch {}
  try { window.dispatchEvent(new CustomEvent('pulse:view-changed', { detail: { view: v, prev } })); } catch {}
  if (v === VIEW_HOME) {
    try { window.dispatchEvent(new CustomEvent('pulse:today-view-shown')); } catch {}
  }
  return true;
}

// 全局暴露给其它模块（memory-manager / settings / org-workspace）调用
if (typeof window !== 'undefined') {
  window.pulseSetView = setActiveView;
}

function bindPulseAppBar() {
  updateCloudAccountChip();
  const cloudBtn = document.getElementById('nb-cloud-btn');
  const cloudMenu = document.getElementById('nb-cloud-menu');
  cloudBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (cloudMenu) cloudMenu.hidden = !cloudMenu.hidden;
  });
  document.getElementById('nb-cloud-logout')?.addEventListener('click', () => {
    (window.NimoCloudAuth || window.NewPulseCloudAuth)?.logout?.();
  });
  document.addEventListener('click', (e) => {
    if (!cloudMenu || cloudMenu.hidden) return;
    if (!e.target.closest('#nb-cloud-user')) cloudMenu.hidden = true;
  });
  window.addEventListener('nimo:cloud-license-updated', updateCloudAccountChip);
  window.addEventListener('newpulse:cloud-license-updated', updateCloudAccountChip);
  // 默认首页（用户上次访问过别的 view 就记住，旧 'today' 值平滑迁移成 'home'）
  let initialView = VIEW_HOME;
  try {
    const saved = localStorage.getItem(STORAGE_VIEW);
    if (saved === 'today') initialView = VIEW_HOME;
    else if (saved === VIEW_FOLLOWUPS || saved === VIEW_DASHBOARD) initialView = VIEW_BUSINESS;
    else if (ALL_VIEWS.includes(saved)) initialView = saved;
  } catch {}
  if (!canUseView(initialView)) initialView = VIEW_HOME;
  // 对于需要数据加载的弹层视图，走对应 open 事件让模块自己完成数据初始化
  if (initialView === VIEW_MEMORY) {
    setTimeout(() => window.dispatchEvent(new CustomEvent('pulse:open-memory-manager')), 0);
  } else if (initialView === VIEW_WORKSPACE) {
    setTimeout(() => window.dispatchEvent(new CustomEvent('pulse:open-org-workspace')), 0);
  } else if (initialView === VIEW_SETTINGS) {
    setTimeout(() => document.getElementById('settings-btn')?.click(), 0);
  } else {
    setActiveView(initialView);
  }

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.dataset.nav;
      if (target === 'pharma-topic') {
        window.dispatchEvent(new CustomEvent('pulse:open-org-workspace', { detail: { tab: 'customer' } }));
        return;
      }
      if (target === 'pharma-assistant') {
        setActiveView(VIEW_CHAT);
        setTimeout(() => document.getElementById('msg-input')?.focus(), 50);
        return;
      }
      const pharmaNavPrompts = {
        chat: '请进入「文献精读室」。我会粘贴一篇药学/生命科学论文摘要或片段，请按学生学习版输出：研究背景与科学问题、方法和实验设计、关键结果与结论、疾病-靶点-药物-指标证据表、专业术语解释、局限性和可延伸课题。仅用于学习和科研训练。',
        business: '请进入「课题孵化器」。我会输入一个疾病、靶点、药物或研究方向，请帮我生成适合学生/研究生的课题方向、研究假设、文献调研路线、实验/数据验证路线图、可行性难度风险和需要导师确认的问题。',
        activity: '请进入「实验设计台」。我会输入一个药学课题或研究假设，请输出教学/组会讨论级实验设计：研究目的、变量、对照、模型选择、分组逻辑、关键检测指标、数据分析思路、失败风险、替代方案、伦理安全和合规边界。不要给危险操作或临床执行指令。'
      };
      if (document.body.dataset.activeIndustry === 'pharma' && pharmaNavPrompts[target]) {
        setActiveView(VIEW_CHAT);
        setTimeout(() => fillChatPrompt(pharmaNavPrompts[target]), 50);
        return;
      }
      if (!canUseView(target)) {
        showCloudPermissionToast(VIEW_FEATURES[normalizeView(target)]);
        return;
      }

      if (target === 'business') {
        setActiveView(VIEW_BUSINESS);
        try { window.dispatchEvent(new CustomEvent('pulse:open-dashboard')); } catch {}
        try { window.dispatchEvent(new CustomEvent('pulse:open-followups')); } catch {}
        return;
      }
      if (target === 'activity') {
        setActiveView(VIEW_ACTIVITY);
        try { window.dispatchEvent(new CustomEvent('pulse:open-activity-report')); } catch {}
        return;
      }

      if (!ALL_VIEWS.includes(target)) return;
      if (target === VIEW_MEMORY) {
        window.dispatchEvent(new CustomEvent('pulse:open-memory-manager'));
        return;
      }
      if (target === VIEW_WORKSPACE) {
        // 从顶部“客户”入口进入资料台时，默认定位到客户 tab
        window.dispatchEvent(new CustomEvent('pulse:open-org-workspace', { detail: { tab: 'customer' } }));
        return;
      }
      if (target === VIEW_SETTINGS) {
        // 走原有 settings-btn 入口让它做数据加载，open 时会调 setActiveView
        const sb = document.getElementById('settings-btn');
        if (sb) { sb.click(); return; }
        setActiveView(VIEW_SETTINGS);
        return;
      }
      setActiveView(target);
    });
  });

  document.getElementById('business-view')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-business-jump]');
    if (!btn) return;
    e.preventDefault();
    const id = btn.getAttribute('data-business-jump');
    const target = id ? document.getElementById(id) : null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // 首页（原 today-view）内的按钮事件代理
  const todayEl = document.getElementById('today-view');
  function fillChatPrompt(text) {
    const input = document.getElementById('msg-input');
    if (!input || !text) return;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  // 首页「问 Pulse」输入框：回车或点发送 → 进对话页 + 预填问题
  const askInput = document.getElementById('today-ask-input');
  const askSend = document.getElementById('today-ask-send');
  function submitAskFromHome() {
    const text = (askInput?.value || '').trim();
    setActiveView(VIEW_CHAT);
    setTimeout(() => {
      if (text) {
        fillChatPrompt(text);
        if (askInput) askInput.value = '';
      } else {
        document.getElementById('msg-input')?.focus();
      }
    }, 50);
  }
  askSend?.addEventListener('click', submitAskFromHome);
  askInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      submitAskFromHome();
    }
  });

  todayEl?.addEventListener('click', (e) => {
    if (e.target.closest('#today-ask-send')) {
      e.preventDefault();
      const input = document.getElementById('today-ask-input');
      const text = (input?.value || '').trim();
      setActiveView(VIEW_CHAT);
      setTimeout(() => {
        if (text) {
          fillChatPrompt(text);
          if (input) input.value = '';
        } else {
          document.getElementById('msg-input')?.focus();
        }
      }, 50);
      return;
    }
    const target = e.target.closest('[data-action]');
    const act = target?.getAttribute('data-action');
    if (!act) return;
    if (act === 'go-chat') {
      const prompt = target?.getAttribute('data-prompt') || '';
      setActiveView(VIEW_CHAT);
      setTimeout(() => {
        if (prompt) fillChatPrompt(prompt);
        else document.getElementById('msg-input')?.focus();
      }, 50);
    } else if (act === 'open-memory') {
      window.dispatchEvent(new CustomEvent('pulse:open-memory-manager'));
    } else if (act === 'open-followups') {
      setActiveView(VIEW_BUSINESS);
      try { window.dispatchEvent(new CustomEvent('pulse:open-followups')); } catch {}
      try { document.getElementById('followups-view')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
    } else if (act === 'open-hotspot') {
      try { window.dispatchEvent(new CustomEvent('pulse:open-hotspot')); } catch {}
    }
  });

  todayEl?.addEventListener('keydown', (e) => {
    if (e.target?.id !== 'today-ask-input') return;
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const text = (e.target.value || '').trim();
    setActiveView(VIEW_CHAT);
    setTimeout(() => {
      if (text) {
        fillChatPrompt(text);
        e.target.value = '';
      } else {
        document.getElementById('msg-input')?.focus();
      }
    }, 50);
  });

  // 全屏视图内左上"← 返回对话"按钮（事件代理）
  document.body.addEventListener('click', (e) => {
    const back = e.target.closest('[data-view-back]');
    if (!back) return;
    e.preventDefault();
    e.stopPropagation();
    setActiveView(VIEW_CHAT);
  });

  // 药学模式：聊天页内三个训练模式（文献精读 / 课题孵化 / 实验设计）
  const pharmaQuickPrompts = {
    literature: '请进入「文献精读室」。我会粘贴一篇药学/生命科学论文摘要或片段，请按学生学习版输出：研究背景与科学问题、方法和实验设计、关键结果与结论、疾病-靶点-药物-指标证据表、专业术语解释、局限性和可延伸课题。仅用于学习和科研训练。',
    incubator: '请进入「课题孵化器」。我会输入一个疾病、靶点、药物或研究方向，请帮我生成适合学生/研究生的课题方向、研究假设、文献调研路线、实验/数据验证路线图、可行性难度风险和需要导师确认的问题。',
    experiment: '请进入「实验设计台」。我会输入一个药学课题或研究假设，请输出教学/组会讨论级实验设计：研究目的、变量、对照、模型选择、分组逻辑、关键检测指标、数据分析思路、失败风险、替代方案、伦理安全和合规边界。不要给危险操作或临床执行指令。'
  };
  const pharmaModePlaceholders = {
    literature: '粘贴论文摘要 / 段落 / 关键词，进入文献精读训练…',
    incubator: '输入疾病 / 靶点 / 药物 / 研究方向，进入课题孵化训练…',
    experiment: '输入课题假设 / 研究问题，进入实验设计训练…'
  };
  function setPharmaTrainingMode(key) {
    const tabsHost = document.getElementById('pharma-quick-tabs');
    const exitBtn = document.getElementById('pharma-mode-exit');
    const input = document.getElementById('msg-input');
    if (key) {
      document.body.dataset.pharmaMode = key;
    } else {
      delete document.body.dataset.pharmaMode;
    }
    tabsHost?.querySelectorAll('.pq-tab').forEach((el) => {
      const active = el.dataset.pqKey === key;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (exitBtn) exitBtn.hidden = !key;
    if (input) {
      if (key && pharmaModePlaceholders[key]) {
        input.placeholder = pharmaModePlaceholders[key];
      } else if (!key) {
        input.placeholder = '输入药学课题、适应症、靶点、文献或实验设计问题…';
      }
    }
  }
  document.getElementById('pharma-quick-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pq-tab');
    if (!btn) return;
    e.preventDefault();
    const key = btn.dataset.pqKey;
    const prompt = pharmaQuickPrompts[key];
    if (!prompt) return;
    const already = document.body.dataset.pharmaMode === key;
    if (already) {
      setPharmaTrainingMode(null);
      return;
    }
    setPharmaTrainingMode(key);
    setActiveView(VIEW_CHAT);
    setTimeout(() => fillChatPrompt(prompt), 50);
  });
  document.getElementById('pharma-mode-exit')?.addEventListener('click', (e) => {
    e.preventDefault();
    setPharmaTrainingMode(null);
  });
  // 退出医药模式时自动清掉训练模式
  window.addEventListener('pulse:industry-changed', () => {
    if (document.body.dataset.activeIndustry !== 'pharma') {
      setPharmaTrainingMode(null);
    }
  });
}

function createPulseLeftRail() {
  return `
<aside id="pulse-left-rail" aria-label="主导航">
  <button class="lr-item" data-nav="home" title="首页">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    <span class="lr-label">首页</span>
  </button>
  <button class="lr-item" data-nav="business" title="提醒">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    <span class="lr-label">提醒</span>
  </button>
  <button class="lr-item" data-nav="activity" title="总结">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="10" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="9" rx="1"/><rect x="17" y="4" width="3" height="12" rx="1"/></svg>
    <span class="lr-label">总结</span>
  </button>
  <button class="lr-item" data-nav="reading" title="文档">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>
    <span class="lr-label">文档</span>
  </button>
  <button class="lr-item" data-nav="memory" title="记忆">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a5 5 0 0 0-5 5v1.2A4 4 0 0 0 5 16.5 4.5 4.5 0 0 0 9.5 21H12"/><path d="M12 3a5 5 0 0 1 5 5v1.2a4 4 0 0 1 2 7.3A4.5 4.5 0 0 1 14.5 21H12"/><path d="M12 7v10"/><path d="M8.5 11H12"/><path d="M12 14h3.5"/></svg>
    <span class="lr-label">记忆</span>
  </button>
  <button class="lr-item" data-nav="device" title="设备">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 7h4"/><path d="M10 17h4"/></svg>
    <span class="lr-label">设备</span>
  </button>
  <button class="lr-item" data-nav="chat" title="聊天">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    <span class="lr-label">聊天</span>
  </button>
  <div class="lr-spacer"></div>
  <button class="lr-item lr-item-settings" data-nav="settings" title="设置">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1.82V22a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 20.4a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.82-.33H2a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 3.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1.82V2a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 3.6a1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 .6 1 1.65 1.65 0 0 0 1.82.33H22a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 20.4 15z"/></svg>
    <span class="lr-label">设置</span>
  </button>
</aside>`;
}

export function renderBrainUiApp(root = document.body) {
  root.innerHTML = createPulseAppBar() + createBrainUiMarkup();
  bindPulseAppBar();
}


