// 今日 Hybrid 首页：数据填充（行业 + 客户跟进 + 热点 + 记忆总数）
// 上半静态 HTML 由 createTodayView 渲染；这里只负责动态文案 + 今日动态卡

import { API } from "./api-client.js";

const REFRESH_MS = 90 * 1000;
let timer = null;
let pulled = false;
let forceNextHotspotRefresh = false;
let casualHomeMode = false;
let currentPack = null;

function objectCopy(pack = currentPack) {
  const labels = pack?.objectLabels || {};
  return {
    singular: labels.singular || "客户",
    plural: labels.plural || "客户",
    asset: labels.asset || "客户资产",
    profile: labels.profile || "客户资料",
    followup: labels.followup || "待跟进",
    briefTitle: labels.briefTitle || "老板今日简报",
    briefSub: labels.briefSub || "客户资产、跟进风险和今日动作",
    todayStat: labels.todayStat || "今日待跟进",
    weekStat: labels.weekStat || "本周新客户",
    contactStat: labels.contactStat || "今日联系",
    quickTitle: labels.quickTitle || "今日待跟进客户",
    empty: labels.empty || "今天没有待跟进客户",
    unnamed: labels.unnamed || "未命名客户",
    sectionTitle: labels.sectionTitle || "今日动态",
    sectionSub: labels.sectionSub || "实时同步右侧资料台",
    staleNoun: labels.staleNoun || "客户",
    staleRisk: labels.staleRisk || "停滞风险",
    nextActionEmpty: labels.nextActionEmpty || "今天没有明显待推进事项，可以整理资料或补充下一步计划。",
  };
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setSectionCopy(section, title, sub) {
  const root = typeof section === "string" ? document.querySelector(section) : section;
  if (!root) return;
  const titleEl = root.querySelector(".today-section-title");
  const subEl = root.querySelector(".today-section-sub");
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
}

function featureSection() {
  return Array.from(document.querySelectorAll("#today-view .today-section"))
    .find((el) => !el.id && !el.classList.contains("today-section-stats"));
}

function setChip(index, label, prompt) {
  const chips = document.querySelectorAll("#today-view .today-ask-chip");
  const chip = chips[index];
  if (!chip) return;
  chip.textContent = label;
  chip.dataset.prompt = prompt;
}

function setFeatureCard(feature, title, desc) {
  const card = document.querySelector(`#today-view .today-card[data-feature="${feature}"]`);
  if (!card) return;
  const titleEl = card.querySelector(".today-card-title");
  const descEl = card.querySelector(".today-card-desc");
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
}

const pharmaPrompts = {
  literature: "请进入「文献精读室」。我会粘贴一篇药学/生命科学论文摘要或片段，请按学生学习版输出：1. 研究背景与科学问题；2. 方法和实验设计；3. 关键结果与结论；4. 疾病-靶点-药物-指标证据表；5. 专业术语解释；6. 局限性；7. 可延伸课题。仅用于学习和科研训练。",
  incubator: "请进入「课题孵化器」。我会输入一个疾病、靶点、药物或研究方向，请帮我生成适合学生/研究生的课题方向：1. 选题背景；2. 研究问题；3. 可验证研究假设；4. 文献调研路线；5. 实验/数据验证路线图；6. 可行性、难度和风险；7. 需要导师确认的问题。",
  experiment: "请进入「实验设计台」。我会输入一个药学课题或研究假设，请输出教学/组会讨论级实验设计：研究目的、变量、对照、模型选择、分组逻辑、关键检测指标、数据分析思路、失败风险、替代方案、伦理安全和合规边界。不要给危险操作或临床执行指令。"
};

function renderPharmaFeatureCards() {
  const grid = document.querySelector("#today-view .today-cards");
  if (!grid) return;
  grid.classList.add("today-cards--pharma");
  grid.innerHTML = [
    {
      icon: "📚",
      title: "文献精读室",
      desc: "粘贴论文摘要或片段，拆结构、讲人话、整理证据链，并提炼可延伸课题。",
      tags: ["论文结构拆解", "学生版解释", "证据表/机制链"],
      prompt: pharmaPrompts.literature,
    },
    {
      icon: "🧬",
      title: "课题孵化器",
      desc: "输入药名、靶点或疾病，生成研究方向、科学假设、路线图和可行性风险。",
      tags: ["选题方向", "研究假设", "路线图"],
      prompt: pharmaPrompts.incubator,
    },
    {
      icon: "🧪",
      title: "实验设计台",
      desc: "把课题假设变成教学/组会讨论级实验方案，明确变量、对照、指标和合规边界。",
      tags: ["分组逻辑", "检测指标", "安全合规"],
      prompt: pharmaPrompts.experiment,
    },
  ].map((item) => `
    <button type="button" class="today-card today-card--pharma" data-action="go-chat" data-prompt="${esc(item.prompt)}">
      <span class="today-card-icon today-card-icon--emoji" aria-hidden="true">${esc(item.icon)}</span>
      <span class="today-card-title">${esc(item.title)}</span>
      <span class="today-card-desc">${esc(item.desc)}</span>
      <span class="today-card-tags">${item.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</span>
      <span class="today-card-cta">开始训练 →</span>
    </button>
  `).join("");
}

function renderPharmaHome() {
  const inner = document.querySelector("#today-view .today-inner");
  if (!inner) return;
  const ICONS = {
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v17H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h12"/><path d="M8 7h7"/><path d="M8 11h6"/></svg>`,
    dna: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3c0 5 14 5 14 14"/><path d="M19 3c0 5-14 5-14 14"/><path d="M7 6h10"/><path d="M7 18h10"/><path d="M9 9h6"/><path d="M9 15h6"/></svg>`,
    flask: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3"/><path d="M7 14h10"/></svg>`,
    brain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4a3 3 0 0 0-3 3v0a3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4z"/><path d="M14 4a3 3 0 0 1 3 3v0a3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z"/></svg>`,
    bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
    map: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>`,
    arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    spark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><circle cx="12" cy="12" r="4"/></svg>`,
  };
  const modules = [
    {
      key: "literature",
      tone: "ink",
      icon: ICONS.book,
      tag: "01 · 读懂论文",
      title: "文献精读室",
      desc: "粘贴论文摘要或片段，自动拆结构、讲人话、整理证据链，并提炼可延伸课题方向。",
      bullets: ["论文结构拆解", "学生版解释", "疾病-靶点-药物-指标证据表"],
      prompt: pharmaPrompts.literature,
    },
    {
      key: "incubator",
      tone: "blue",
      icon: ICONS.dna,
      tag: "02 · 形成课题",
      title: "课题孵化器",
      desc: "输入药名、靶点或疾病，生成研究方向、科学假设、文献调研路线图和可行性风险。",
      bullets: ["选题方向", "研究假设", "可行性风险评估"],
      prompt: pharmaPrompts.incubator,
    },
    {
      key: "experiment",
      tone: "teal",
      icon: ICONS.flask,
      tag: "03 · 整理实验",
      title: "实验设计台",
      desc: "把课题假设变成教学/组会讨论级实验方案，明确变量、对照、模型、指标和合规边界。",
      bullets: ["分组逻辑", "关键检测指标", "安全合规边界"],
      prompt: pharmaPrompts.experiment,
    },
  ];
  const knowledgeTags = ["药理学","药物化学","药剂学","药代动力学","毒理学","临床前研究","临床试验框架","ADMET","靶点机制","合规与伦理"];
  inner.innerHTML = `
    <section class="pharma-home-v3">
      <header class="ph3-hero">
        <div class="ph3-hero-main">
          <span class="ph3-hero-kicker">
            <span class="ph3-hero-kicker-dot"></span>
            药学科研学习助手 · 学生 / 老师 / 课题组
          </span>
          <h1 class="ph3-hero-title">药学科研训练工作台</h1>
          <p class="ph3-hero-sub">围绕文献精读、课题孵化和实验设计，把零散资料整理成可学习、可讨论、可推进的科研训练稿。仅用于学习、教学和科研训练参考。</p>
          <div class="ph3-search" role="search">
            <span class="ph3-search-icon">${ICONS.spark}</span>
            <input type="text" id="today-ask-input" placeholder="输入药名、靶点、疾病、论文摘要或实验问题…" autocomplete="off" />
            <button type="button" id="today-ask-send" class="ph3-btn ph3-btn-primary">
              开始分析
              <span class="ph3-btn-arrow">${ICONS.arrow}</span>
            </button>
          </div>
          <div class="ph3-chips">
            <button type="button" data-action="go-chat" data-prompt="${esc(pharmaPrompts.literature)}">${ICONS.book}<span>精读论文</span></button>
            <button type="button" data-action="go-chat" data-prompt="${esc(pharmaPrompts.incubator)}">${ICONS.dna}<span>孵化课题</span></button>
            <button type="button" data-action="go-chat" data-prompt="${esc(pharmaPrompts.experiment)}">${ICONS.flask}<span>设计实验</span></button>
            <button type="button" data-action="go-chat" data-prompt="请用学生能听懂的方式解释一个药学机制/靶点/通路：核心概念、疾病关联、药物作用、关键证据、常见误区和可继续学习的方向。">${ICONS.brain}<span>解释机制</span></button>
          </div>
        </div>
        <aside class="ph3-hero-side">
          <div class="ph3-hero-side-head">
            <span class="ph3-hero-side-title">今日训练建议</span>
            <span class="ph3-hero-side-meta">3 步</span>
          </div>
          <ol class="ph3-hero-side-list">
            <li>
              <span class="ph3-step-num">1</span>
              <div>
                <strong>读懂一篇摘要</strong>
                <em>拆研究问题、方法、结论和证据链</em>
              </div>
            </li>
            <li>
              <span class="ph3-step-num">2</span>
              <div>
                <strong>形成 3 个课题方向</strong>
                <em>把疾病 / 靶点转成可讨论的研究问题</em>
              </div>
            </li>
            <li>
              <span class="ph3-step-num">3</span>
              <div>
                <strong>整理实验框架</strong>
                <em>明确变量、对照、指标和合规边界</em>
              </div>
            </li>
          </ol>
          <div class="ph3-hero-side-note">${ICONS.check}<span>仅用于学习、教学和科研训练，不输出临床/危险操作指令。</span></div>
        </aside>
      </header>

      <section class="ph3-modules">
        ${modules.map((m) => `
          <button type="button" class="ph3-module" data-tone="${esc(m.tone)}" data-action="go-chat" data-prompt="${esc(m.prompt)}">
            <div class="ph3-module-top">
              <span class="ph3-module-icon">${m.icon}</span>
              <span class="ph3-module-tag">${esc(m.tag)}</span>
            </div>
            <strong class="ph3-module-title">${esc(m.title)}</strong>
            <em class="ph3-module-desc">${esc(m.desc)}</em>
            <ul class="ph3-module-bullets">
              ${m.bullets.map((b) => `<li>${ICONS.check}<span>${esc(b)}</span></li>`).join("")}
            </ul>
            <span class="ph3-module-cta">开始训练${ICONS.arrow}</span>
          </button>
        `).join("")}
      </section>

      <section class="ph3-grid">
        <article class="ph3-panel ph3-panel-assets">
          <div class="ph3-panel-head">
            <span class="ph3-panel-icon">${ICONS.bookmark}</span>
            <div>
              <div class="ph3-panel-title">课题 / 文献 / 实验草稿</div>
              <div class="ph3-panel-sub">保存当前科研课题后自动归档</div>
            </div>
          </div>
          <p class="ph3-panel-text">把课题、待读论文和实验设计草稿沉淀到资产里，方便回到上一次学习现场继续推进。</p>
          <button type="button" class="ph3-btn ph3-btn-ghost" data-action="open-followups">
            查看课题推进
            <span class="ph3-btn-arrow">${ICONS.arrow}</span>
          </button>
        </article>

        <article class="ph3-panel">
          <div class="ph3-panel-head">
            <span class="ph3-panel-icon">${ICONS.template}</span>
            <div>
              <div class="ph3-panel-title">输出模板</div>
              <div class="ph3-panel-sub">一键发起结构化分析</div>
            </div>
          </div>
          <div class="ph3-template-list">
            <button type="button" data-action="go-chat" data-prompt="${esc(pharmaPrompts.literature)}">文献精读模板</button>
            <button type="button" data-action="go-chat" data-prompt="${esc(pharmaPrompts.incubator)}">课题开题模板</button>
            <button type="button" data-action="go-chat" data-prompt="${esc(pharmaPrompts.experiment)}">实验设计模板</button>
          </div>
        </article>

        <article class="ph3-panel ph3-panel-map">
          <div class="ph3-panel-head">
            <span class="ph3-panel-icon">${ICONS.map}</span>
            <div>
              <div class="ph3-panel-title">药学知识地图</div>
              <div class="ph3-panel-sub">点击任意标签开始学习</div>
            </div>
          </div>
          <div class="ph3-map-tags">
            ${knowledgeTags.map((t) => `<button type="button" data-action="go-chat" data-prompt="${esc('请作为药学科研学习助手，帮我系统讲解「'+t+'」：核心概念、研究方法、典型案例、常见误区、与其他子学科的联系，以及适合学生学习的入门资料方向。')}">${esc(t)}</button>`).join("")}
          </div>
        </article>
      </section>
    </section>`;
}

function restoreDefaultFeatureGrid() {
  const grid = document.querySelector("#today-view .today-cards");
  if (!grid) return;
  grid.classList.remove("today-cards--pharma");
}

function renderPharmaLearningSections() {
  const before = document.querySelector(".today-section-stats");
  if (!before?.parentNode) return;
  let box = document.getElementById("today-pharma-learning");
  if (!box) {
    box = document.createElement("section");
    box.id = "today-pharma-learning";
    box.className = "today-section today-pharma-learning";
    before.parentNode.insertBefore(box, before.nextSibling);
  }
  box.innerHTML = `
    <div class="pharma-workbench-grid">
      <article class="pharma-panel pharma-panel-assets">
        <div class="pharma-panel-kicker">最近资产</div>
        <h3>课题 / 文献 / 实验草稿</h3>
        <p>优先展示已保存课题、待读文献和实验设计草稿，让学生回到上次学习现场。</p>
        <button type="button" data-action="open-followups">查看课题推进</button>
      </article>
      <article class="pharma-panel">
        <div class="pharma-panel-kicker">推荐学习任务</div>
        <ul>
          <li>精读一篇摘要并生成证据表</li>
          <li>把疾病/靶点转成 3 个课题方向</li>
          <li>补全实验变量、对照和指标</li>
        </ul>
      </article>
      <article class="pharma-panel">
        <div class="pharma-panel-kicker">模板库</div>
        <div class="pharma-template-list">
          <button type="button" data-action="go-chat" data-prompt="${esc(pharmaPrompts.literature)}">文献精读模板</button>
          <button type="button" data-action="go-chat" data-prompt="${esc(pharmaPrompts.incubator)}">课题开题模板</button>
          <button type="button" data-action="go-chat" data-prompt="${esc(pharmaPrompts.experiment)}">实验设计模板</button>
        </div>
      </article>
      <article class="pharma-panel pharma-panel-map">
        <div class="pharma-panel-kicker">药学知识地图</div>
        <div class="pharma-map-tags">
          <span>药理学</span><span>药物化学</span><span>药剂学</span><span>药代动力学</span><span>毒理学</span><span>临床前研究</span>
        </div>
      </article>
    </div>`;
}

function setStatCard(valueId, label, value, sub) {
  const valueEl = document.getElementById(valueId);
  const card = valueEl?.closest(".today-stat");
  if (!card) return;
  const labelEl = card.querySelector(".today-stat-label");
  const subEl = card.querySelector(".today-stat-sub");
  if (labelEl) labelEl.textContent = label;
  if (valueEl) valueEl.textContent = value;
  if (subEl) subEl.textContent = sub;
}

function setQuickTitle(listId, title) {
  const list = document.getElementById(listId);
  const col = list?.closest(".today-quick-col");
  const titleEl = col?.querySelector(".today-quick-title");
  if (titleEl) titleEl.textContent = title;
}

function removeBox(id) {
  document.getElementById(id)?.remove();
}

function renderBusinessHomeBase(pack = null) {
  const labels = objectCopy(pack);
  casualHomeMode = false;
  const todayView = document.getElementById("today-view");
  todayView?.classList.remove("today-casual-mode");
  todayView?.classList.toggle("today-pharma-mode", pack?.id === "pharma");
  setText("today-hero-eyebrow", pack?.id === "pharma" ? "药学科研训练工作台 · 学生 / 导师 / 课题组" : "Nimo · 主动陪伴伙伴");
  setHtml("today-hero-title", pack?.id === "pharma" ? "药学科研训练工作台<br><span>文献精读、课题设计、实验方案一站完成</span>" : "提醒你该做的事<br>也陪你读书和聊天");
  setText("today-hero-sub", pack?.id === "pharma" ? "面向本科生、研究生、老师和实验室团队：把论文读懂，把课题讲清，把实验方案做成可讨论的训练稿。" : "Nimo 不只是 AI，它会主动找你提醒、督促、陪读和聊天；久未操作时，也会轻轻把你叫回来。");
  const askInput = document.getElementById("today-ask-input");
  if (askInput) askInput.placeholder = pack?.id === "pharma" ? "输入药名、靶点、疾病、论文摘要或实验问题…" : "例如：晚上九点提醒我读 20 分钟书";
  if (pack?.id === "pharma") {
    renderPharmaHome();
    return;
  } else {
    restoreDefaultFeatureGrid();
    removeBox("today-pharma-learning");
    setChip(0, "今日提醒", "提醒我今天要完成的三件事。");
    setChip(1, "陪我读书", "陪我读一篇文档，先帮我总结重点。");
    setChip(2, "偷懒提醒", "如果我半小时没动电脑，提醒我回来继续。");
    setChip(3, "陪伴聊天", "跟我聊聊现在该先做什么。");
    setSectionCopy(featureSection(), "Nimo 能为你做什么", "提醒 · 读书 · 督促 · 陪伴聊天");
    setFeatureCard("ai", "主动提醒", "自然语言记下事情，到点用桌面弹窗、聊天和后续硬件提醒你");
    setFeatureCard("threads", "陪伴聊天", "不只是被动回答，Nimo 会主动问你、催你、陪你把事情推进");
    setFeatureCard("memory", "长期记忆", "记住你的习惯、偏好、常读资料和反复出现的待办事项");
    setFeatureCard("followup", "屏幕督促", "保留软件和窗口标题统计，久未操作时提醒你是不是该回来继续");
    setFeatureCard("workspace", "读书陪伴", "导入文档、总结重点、追问理解，陪你把书和资料读下去");
    setFeatureCard("prompts", "可调督促", "温和、普通、强督促三种模式，以后可在设置里自由切换");
  }
  setSectionCopy(".today-section-stats", pack?.id === "pharma" ? labels.sectionTitle : "今天的 Nimo 状态", pack?.id === "pharma" ? labels.sectionSub : "提醒 · 读书 · 空闲督促 · 长期记忆");
  setStatCard("today-stat-followup", pack?.id === "pharma" ? labels.todayStat : "今日待提醒", "—", pack?.id === "pharma" ? "需要补材料或导师确认" : "按时间排序");
  setStatCard("today-stat-newweek", pack?.id === "pharma" ? labels.weekStat : "本周新增", "—", pack?.id === "pharma" ? "近 7 天新增研究方向" : "最近 7 天创建");
  setStatCard("today-stat-contacted", pack?.id === "pharma" ? labels.contactStat : "空闲检测", pack?.id === "pharma" ? "—" : "待接入", pack?.id === "pharma" ? "今天整理过的课题/文献" : "软件 / 窗口标题 / 空闲时长");
  setStatCard("today-stat-mem", pack?.id === "pharma" ? "学习记忆" : "记忆总数", "—", pack?.id === "pharma" ? "术语 / 文献 / 课题 / 方法" : "习惯 / 偏好 / 常读资料");
  setQuickTitle("today-quick-followup", pack?.id === "pharma" ? labels.quickTitle : "Nimo 会主动做");
  setQuickTitle("today-quick-hotspot", pack?.id === "pharma" ? "科研热点与选题线索" : "第一阶段先保留");
}

function renderCasualHome() {
  casualHomeMode = true;
  document.getElementById("today-view")?.classList.add("today-casual-mode");
  document.getElementById("today-view")?.classList.remove("today-pharma-mode");
  removeBox("today-industry-actions");
  removeBox("today-owner-brief");
  removeBox("today-pharma-learning");
  restoreDefaultFeatureGrid();
  setText("today-hero-eyebrow", "Nimo 提醒助手 · 桌面 AI 提醒服务");
  setHtml("today-hero-title", "一句话记下事情<br>到时间多端一起提醒");
  setText("today-hero-sub", "面向老师、客户、门店和个人办公场景：电脑端、微信端、桌面硬件屏幕和灯光联动提醒，先把备忘和待办真正记住。");
  const askInput = document.getElementById("today-ask-input");
  if (askInput) askInput.placeholder = "例如：明天下午三点提醒我联系客户确认方案";
  setChip(0, "创建提醒", "明天下午三点提醒我联系客户确认方案。");
  setChip(1, "今日待办", "帮我整理今天所有要提醒和要完成的事项。");
  setChip(2, "隐私提醒", "帮我创建一个隐私提醒，到点只显示“你有一个重要提醒”。");
  setChip(3, "设备联动", "如果绑定了桌面机器人，到点让屏幕显示提醒并闪灯。");
  setSectionCopy(featureSection(), "Nimo 能为你做什么", "备忘 · 待办 · 微信 · 桌面硬件联动");
  setFeatureCard("ai", "AI 备忘", "用自然语言记录事项，自动提取时间、对象、分类和提醒方式");
  setFeatureCard("threads", "多对象会话", "老师、客户、门店、项目都能单独建会话，避免事情混在一起");
  setFeatureCard("memory", "长期记忆", "记住常用联系人、偏好、敏感边界和重复性事务");
  setFeatureCard("followup", "到点提醒", "电脑弹窗、微信消息、硬件屏幕和灯光可按通道触发");
  setFeatureCard("workspace", "设备中心", "预留桌面机器人注册、心跳、拉取提醒、完成和稍后提醒");
  setFeatureCard("prompts", "场景模板", "上课、会议、客户回访、家长沟通、提交材料、门店服务都能快速创建");
  setSectionCopy(".today-section-stats", "今天的提醒中心", "待办事项 · 多端同步 · 不绑定行业");
  setStatCard("today-stat-followup", "今日待提醒", "—", "按时间排序");
  setStatCard("today-stat-newweek", "本周新增", "—", "最近 7 天创建");
  setStatCard("today-stat-contacted", "已处理", "—", "完成 / 稍后提醒");
  setStatCard("today-stat-mem", "记忆总数", "—", "偏好 / 对象 / 常用事项");
  setQuickTitle("today-quick-followup", "提醒场景");
  setQuickTitle("today-quick-hotspot", "硬件联动");
  const followupList = document.getElementById("today-quick-followup");
  if (followupList) {
    followupList.innerHTML = [
      ["⏰", "到点提醒客户回访、会议和材料提交"],
      ["🏫", "适配老师上课、批改作业、找学生谈话"],
      ["�", "适配门店会员服务、预约和售后提醒"],
      ["🔒", "敏感事项可只显示重要提醒，不语音播报"],
    ].map(([tag, text]) => `<li><span class="today-quick-tag">${tag}</span><span class="today-quick-name">${esc(text)}</span></li>`).join("");
  }
  const hotspotList = document.getElementById("today-quick-hotspot");
  if (hotspotList) {
    hotspotList.innerHTML = [
      ["屏幕", "显示文字、时间、表情和隐私占位文案"],
      ["灯光", "用 RGB 灯光表达普通、紧急和稍后提醒"],
      ["微信", "扫码绑定后可用微信创建提醒并接收通知"],
      ["底盘", "按旗舰版硬件预留传感器、摄像头和小车底盘扩展"],
    ].map(([tag, text]) => `<li><span class="today-quick-tag">${tag}</span><span class="today-quick-name">${esc(text)}</span></li>`).join("");
  }
}

async function refreshCasualDynamicData() {
  const today = await fetchJsonOk(`${API}/biz/today`);
  if (Number.isFinite(today?.totalMemories)) {
    setText("today-stat-mem", String(today.totalMemories));
  }
}

function setIndustryCopy(pack) {
  const id = String(pack?.id || "").trim();
  const name = String(pack?.name || "").trim();
  if (pack?.homeCopy?.eyebrow || pack?.homeCopy?.sub) {
    if (pack.homeCopy.eyebrow) setText("today-hero-eyebrow", pack.homeCopy.eyebrow);
    if (pack.homeCopy.sub) setText("today-hero-sub", pack.homeCopy.sub);
  } else if (id === "ecommerce") {
    setText("today-hero-eyebrow", "电商工作台 · 店铺增长与客户复购");
    setText("today-hero-sub", "围绕店铺客户、投流转化、直播/种草、私域复购和售后风险，沉淀可复用的电商客户资产与跟进动作。");
  } else if (id === "tech") {
    setText("today-hero-eyebrow", "科技工作台 · 线索、Demo 与 POC 推进");
    setText("today-hero-sub", "围绕 B2B 线索、决策角色、Demo 反馈、POC 验收和续约机会，沉淀可复用的科技客户资产与推进节奏。");
  } else if (name) {
    setText("today-hero-eyebrow", `${name}行业 · AI 工作搭档`);
    setText("today-hero-sub", `把客户聊天、跟进笔记、AI 沉淀的偏好与约束，统一沉淀为可随时检索、可团队复用的${name}客户资产。`);
  } else {
    setText("today-hero-eyebrow", "AI 工作搭档 · 商务版");
    setText("today-hero-sub", "把客户聊天、跟进笔记、AI 沉淀的偏好与约束，统一沉淀为可随时检索、可团队复用的客户资产。");
  }
}

function flattenHotspots(data) {
  const industryItems = Array.isArray(data?.industry?.related) ? data.industry.related : [];
  if (industryItems.length) return industryItems;
  const out = [];
  for (const [platform, items] of Object.entries(data?.platforms || {})) {
    for (const item of Array.isArray(items) ? items : []) out.push({ ...item, platform });
  }
  return out.sort((a, b) => (a.rank || 999) - (b.rank || 999));
}

function fallbackIndustryHotspots(industryId = "") {
  if (industryId === "ecommerce") {
    return [
      { platform: "抖音", title: "直播间转化、福利款和憋单节奏变化" },
      { platform: "小红书", title: "种草笔记、达人合作和新品内容选题" },
      { platform: "淘宝", title: "店铺复购、会员券和大促预热策略" },
      { platform: "拼多多", title: "低价竞品、退货率和库存周转风险" },
      { platform: "1688", title: "源头工厂、选品价格带和供应链趋势" },
    ];
  }
  if (industryId === "tech") {
    return [
      { platform: "AI", title: "大模型应用、Agent 产品和企业落地趋势" },
      { platform: "SaaS", title: "B2B 增长、续约、POC 和客户成功信号" },
      { platform: "融资", title: "科技公司融资动态和潜在线索变化" },
      { platform: "GitHub", title: "开源项目、开发者工具和技术栈趋势" },
      { platform: "云服务", title: "算力、API、数据安全和企业采购变化" },
    ];
  }
  return [];
}

function industryActions(pack) {
  const id = String(pack?.id || "").trim();
  if (Array.isArray(pack?.quickActions) && pack.quickActions.length) {
    return pack.quickActions.slice(0, 6).map((item) => [
      item.title || "开始",
      item.description || "进入行业工作流",
      item.action || "go-chat",
      item.prompt || "",
    ]);
  }
  if (id === "ecommerce") {
    return [
      ["写复购召回", "按最近购买/偏好生成老客召回话术", "go-chat", "请根据当前电商客户资料，帮我生成一段老客户复购召回话术。要求：语气自然、有利益点、有明确下一步动作，并给出 3 个不同版本。"],
      ["看行业热点", "找可借势的选品、直播、种草话题", "open-hotspot"],
      ["处理售后风险", "沉淀差评、退货、物流慢的应对口径", "go-chat", "请帮我处理一个电商售后风险场景：客户可能因为差评、退货、物流慢或体验不佳而流失。请给出安抚话术、补偿边界和后续复购引导。"],
      ["今日跟进店铺", "查看需要推进的店铺客户", "open-followups"],
    ];
  }
  if (id === "tech") {
    return [
      ["推进 POC", "整理验收标准、负责人和下一步商务动作", "go-chat", "请帮我推进一个科技/B2B 客户 POC：整理验收标准、负责人、风险点、下一步商务动作，并生成一段跟进客户的话术。"],
      ["Demo 后跟进", "把反馈转成决策人关心的推进话术", "go-chat", "请根据 Demo 后客户反馈，帮我生成跟进方案：总结客户关注点、判断决策角色、提出下一次会议目标，并写一段自然的跟进消息。"],
      ["看科技热点", "捕捉 AI、SaaS、融资、开源相关线索", "open-hotspot"],
      ["今日推进线索", "查看 Demo/POC/续约相关跟进", "open-followups"],
    ];
  }
  return [
    ["开始行业会话", "围绕当前客户和行业问题继续聊", "go-chat", "请基于当前行业和客户资料，帮我分析今天最应该推进的客户动作。"],
    ["查看行业热点", "发现可用于跟进和内容的话题", "open-hotspot"],
    ["整理长期记忆", "检查当前行业沉淀的客户资产", "open-memory"],
  ];
}

function renderIndustryActions(pack) {
  const host = document.getElementById("today-view");
  const before = document.querySelector(".today-section-stats");
  if (!host || !before) return;
  if (pack?.id === "pharma") {
    removeBox("today-industry-actions");
    return;
  }
  let box = document.getElementById("today-industry-actions");
  if (!box) {
    box = document.createElement("section");
    box.id = "today-industry-actions";
    box.className = "today-section today-industry-actions";
    before.parentNode.insertBefore(box, before);
  }
  const name = pack?.name || "行业";
  const icon = pack?.icon || "🏢";
  const items = industryActions(pack);
  box.innerHTML = `
    <div class="today-section-head">
      <div>
        <div class="today-section-title">${esc(icon)} ${esc(name)}快捷动作</div>
        <div class="today-section-sub">围绕当前行业最常用的专业技能，一键进入工作流</div>
      </div>
    </div>
    <div class="today-action-grid">
      ${items.map(([title, desc, action, prompt]) => `
        <button type="button" class="today-action-card" data-action="${esc(action)}"${prompt ? ` data-prompt="${esc(prompt)}"` : ""}>
          <span class="today-action-title">${esc(title)}</span>
          <span class="today-action-desc">${esc(desc)}</span>
        </button>
      `).join("")}
    </div>`;
}

function nextActionForFollowup(item) {
  const stage = String(item?.stage || "").toLowerCase();
  const days = Number.isFinite(item?.staleDays) ? item.staleDays : 0;
  if (currentPack?.id === "pharma") {
    if (/文献|综述|资料|调研/.test(stage)) {
      return "先补关键论文、证据等级和争议点，再整理成文献证据表。";
    }
    if (/实验|方案|模型|验证/.test(stage)) {
      return "明确研究假设、实验模型、分组对照和可测指标，先形成可讨论的实验草案。";
    }
    if (/靶点|机制|通路/.test(stage)) {
      return "补充靶点机制证据、疾病关联和验证问题，避免只停留在概念描述。";
    }
    if (/临床|伦理|合规|安全/.test(stage)) {
      return "先梳理伦理、安全、适用边界和必须请老师/专业人员确认的问题。";
    }
    if (days >= 14) return "课题资料长期未更新，建议先补文献、拆分研究问题或请老师确认方向。";
    if (days >= 7) return "课题超过一周未推进，建议今天补一条研究记录并明确下一步资料或实验任务。";
    if (days >= 3) return "课题已有几天未更新，建议补充文献线索、实验假设或导师反馈。";
    return "补充课题背景、研究假设、文献证据和下一步实验问题，让课题档案更完整。";
  }
  if (/报价|价格|quote|price/.test(stage)) {
    return days >= 7 ? "补发案例和优惠边界，确认价格异议是否仍是主要阻碍。" : "跟进报价是否已内部确认，并约定下一步反馈时间。";
  }
  if (/demo|演示|试用/.test(stage)) {
    return "整理 Demo 反馈，确认决策人、预算和下一次会议时间。";
  }
  if (/poc|验收|测试/.test(stage)) {
    return "确认 POC 验收标准、负责人和截止时间，避免项目停在测试阶段。";
  }
  if (/复购|老客|售后|退货|差评/.test(stage)) {
    return "先确认体验问题，再给出补偿/复购方案，避免客户流失。";
  }
  if (/签约|合同|成交/.test(stage)) {
    return "确认合同、付款和交付时间点，推动形成明确成交动作。";
  }
  if (days >= 14) return "客户已长期未动，建议老板介入或发送重新激活话术。";
  if (days >= 7) return "客户超过一周未跟进，建议今天补一次明确下一步的消息。";
  if (days >= 3) return "客户已有几天未更新，建议补充跟进记录并约定下次沟通时间。";
  return "补充客户需求、预算、关注点和下次跟进时间，让客户资产更完整。";
}

function healthClass(level) {
  const v = String(level || "good").toLowerCase();
  return ["hot", "good", "warn", "danger", "muted"].includes(v) ? v : "good";
}

function renderOwnerBrief(today) {
  const labels = objectCopy();
  const before = document.getElementById("today-industry-actions") || document.querySelector(".today-section-stats");
  const parent = before?.parentNode;
  if (!parent || !before) return;
  let box = document.getElementById("today-owner-brief");
  if (!box) {
    box = document.createElement("section");
    box.id = "today-owner-brief";
    box.className = "today-section today-owner-brief";
    parent.insertBefore(box, before);
  }
  if (!today?.ok) {
    box.innerHTML = `
      <div class="today-section-head">
        <div>
          <div class="today-section-title">${esc(labels.briefTitle)}</div>
          <div class="today-section-sub">${esc(labels.briefSub)}</div>
        </div>
      </div>
      <div class="today-brief-empty">暂时无法读取今日数据，稍后会自动刷新。</div>`;
    return;
  }
  const followups = Array.isArray(today.followups) ? today.followups : [];
  const stale = followups.filter((it) => it.health?.level === "danger" || Number(it.staleDays || 0) >= 7);
  const urgent = followups.filter((it) => ["danger", "warn"].includes(it.health?.level) || Number(it.staleDays || 0) >= 3);
  const lead = followups[0];
  const summary = [
    `当前${labels.asset} ${Number(today.totalCustomers || 0)} 个，本周新增 ${Number(today.weekNew || 0)} 个。`,
    `今天已更新 ${Number(today.todayContacted || 0)} 个${labels.singular}，${labels.followup} ${followups.length} 个。`,
    stale.length
      ? `有 ${stale.length} 个${labels.staleNoun}超过 7 天未动，建议优先补资料、拆问题或推进下一步。`
      : `暂无明显${labels.staleRisk}，建议继续保持今日推进节奏。`,
  ];
  const nextAction = lead
    ? `优先处理：${lead.name || labels.unnamed}${lead.stage ? `（${lead.stage}）` : ""}，已停滞 ${Number.isFinite(lead.staleDays) ? lead.staleDays : "多"} 天。${nextActionForFollowup(lead)}`
    : labels.nextActionEmpty;
  box.innerHTML = `
    <div class="today-section-head">
      <div>
        <div class="today-section-title">${esc(labels.briefTitle)}</div>
        <div class="today-section-sub">${esc(labels.briefSub)}</div>
      </div>
      <button type="button" class="today-section-link" data-action="open-followups">查看推进 →</button>
    </div>
    <div class="today-brief-grid">
      <article class="today-brief-main">
        ${summary.map((line) => `<p>${esc(line)}</p>`).join("")}
        <div class="today-brief-next">${esc(nextAction)}</div>
      </article>
      <div class="today-brief-signals">
        <div class="today-brief-signal">
          <span class="today-brief-num">${Number(today.totalCustomers || 0)}</span>
          <span>${esc(labels.asset)}</span>
        </div>
        <div class="today-brief-signal">
          <span class="today-brief-num">${followups.length}</span>
          <span>${esc(labels.followup)}</span>
        </div>
        <div class="today-brief-signal${urgent.length ? " is-warn" : ""}">
          <span class="today-brief-num">${urgent.length}</span>
          <span>${esc(labels.staleRisk)}</span>
        </div>
      </div>
    </div>`;
}

async function fetchJsonOk(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function refreshDynamicData() {
  if (casualHomeMode) {
    await refreshCasualDynamicData();
    return;
  }
  const labels = objectCopy();
  // /biz/today 已有：todayContacted / weekNew / totalMemories
  const today = await fetchJsonOk(`${API}/biz/today`);
  if (today) {
    setText("today-stat-newweek", Number.isFinite(today.weekNew) ? String(today.weekNew) : "0");
    setText("today-stat-contacted", Number.isFinite(today.todayContacted) ? String(today.todayContacted) : "0");
    setText("today-stat-mem", Number.isFinite(today.totalMemories) ? String(today.totalMemories) : "—");
    renderOwnerBrief(today);
  } else {
    setText("today-stat-newweek", "—");
    setText("today-stat-contacted", "—");
    setText("today-stat-mem", "—");
    renderOwnerBrief(null);
  }

  // 今日待跟进客户
  const followupList = document.getElementById("today-quick-followup");
  if (followupList) {
    const items = Array.isArray(today?.followups) ? today.followups : [];
    setText("today-stat-followup", String(items.length || 0));
    if (!items.length) {
      followupList.innerHTML = `<li class="today-quick-empty">${esc(labels.empty)}</li>`;
    } else {
      followupList.innerHTML = items.slice(0, 5).map((it) => {
        const stage = it.stage ? esc(it.stage) : "未分阶段";
        const health = it.health || {};
        const healthLabel = health.label || "正常推进";
        const healthLevel = healthClass(health.level);
        const days = Number.isFinite(it.staleDays) && it.staleDays >= 0
          ? (it.staleDays === 0 ? "今天" : `${it.staleDays} 天前`)
          : "—";
        return `<li>
  <span class="today-quick-tag">${stage}</span>
  <span class="today-health-pill today-health-${esc(healthLevel)}">${esc(healthLabel)}</span>
  <span class="today-quick-name">${esc(it.name || labels.unnamed)}</span>
  <span class="today-quick-meta">${days}</span>
  <span class="today-next-action">${esc(nextActionForFollowup(it))}</span>
</li>`;
      }).join("");
    }
  }

  // 行业热点（取最近一批）
  const hotspotList = document.getElementById("today-quick-hotspot");
  if (hotspotList) {
    const industryId = document.body?.dataset?.industryTheme || document.documentElement?.dataset?.industryTheme || "";
    const immediateFallback = fallbackIndustryHotspots(industryId);
    if (immediateFallback.length) {
      hotspotList.innerHTML = immediateFallback.slice(0, 5).map((it) => `<li>
  <span class="today-quick-tag">${esc(it.platform || "热点")}</span>
  <span class="today-quick-name">${esc(it.title || "（无标题）")}</span>
</li>`).join("");
    }
    const params = new URLSearchParams({ limit: "5" });
    if (industryId) params.set("industry", industryId);
    if (forceNextHotspotRefresh) params.set("refresh", "1");
    const data = await fetchJsonOk(`${API}/hotspots?${params.toString()}`);
    forceNextHotspotRefresh = false;
    const fallback = fallbackIndustryHotspots(data?.industry?.id || industryId);
    let items = fallback.length ? fallback : (Array.isArray(data) ? data : flattenHotspots(data));
    if (!items.length) {
      hotspotList.innerHTML = `<li class="today-quick-empty">暂无行业热点数据</li>`;
    } else {
      hotspotList.innerHTML = items.slice(0, 5).map((it) => {
        const platform = it.platform ? esc(it.platform) : "热点";
        const title = String(it.title || it.text || it.summary || "").slice(0, 60);
        return `<li>
  <span class="today-quick-tag">${platform}</span>
  <span class="today-quick-name">${esc(title) || "（无标题）"}</span>
</li>`;
      }).join("");
    }
  }
}

function applyIndustry(state) {
  const pack = state?.activePack;
  currentPack = pack || null;
  if (!pack) {
    renderCasualHome();
    return;
  }
  renderBusinessHomeBase(pack);
  setIndustryCopy(pack);
  renderIndustryActions(pack);
}

function startTimerIfNeeded() {
  if (timer) return;
  timer = setInterval(() => {
    if (document.body.getAttribute("data-active-view") === "home") {
      refreshDynamicData();
    }
  }, REFRESH_MS);
}

function scrollIntoViewById(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // 先确保数据是新的
  refreshDynamicData();
  // 等下一帧再滚，避免 setActiveView 触发的 reflow 抢先
  requestAnimationFrame(() => {
    try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
    el.classList.add("today-flash");
    setTimeout(() => el.classList.remove("today-flash"), 1400);
  });
}

export function initTodayView({ industryState } = {}) {
  applyIndustry(industryState);

  // 行业切换 → 同步首页文案与行业数据
  window.addEventListener("pulse:industry-changed", (e) => {
    applyIndustry(e.detail);
    forceNextHotspotRefresh = true;
    refreshDynamicData();
  });
  // 进入今日视图时拉一次最新数据
  window.addEventListener("pulse:today-view-shown", () => {
    refreshDynamicData();
  });

  // 顶部导航「跟进」「数据」临时入口：跳到首页并滚动到对应区域
  window.addEventListener("pulse:focus-followups", () => {
    scrollIntoViewById("today-quick-followup");
  });
  window.addEventListener("pulse:focus-dashboard", () => {
    // 数据区第一张卡（本周新增 / 今日联系 / 总记忆）
    scrollIntoViewById("today-stat-newweek");
  });

  // 首次：如果默认视图是首页，立刻拉数据
  if (document.body.getAttribute("data-active-view") === "home") {
    refreshDynamicData();
    pulled = true;
  }
  startTimerIfNeeded();
}
