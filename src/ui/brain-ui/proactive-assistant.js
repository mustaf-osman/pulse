import {
  canUseBusinessSignals,
  canUseChatSignals,
  canUseLifeCare,
  isQuietNow,
  loadPersonalDataProfile,
  quietEndsAt,
} from "./personal-data-profile.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const START_DELAY_MS = 5 * 60 * 1000;
const MIN_SESSION_GAP_MS = 8 * 60 * 1000;
const MIN_FRIEND_NUDGE_GAP_MS = 10 * 60 * 1000;
const STORAGE_PREFIX = "pulse_proactive_message";
const PERSONAL_REMINDERS_KEY = "pulse_proactive_personal_reminders";
const PROACTIVE_ENABLED_KEY = "pulse_proactive_assistant_enabled";
const PROACTIVE_FREQUENCY_KEY = "pulse_proactive_frequency_minutes";
const PROACTIVE_IDLE_GUARD_KEY = "pulse_proactive_idle_guard_enabled";
const PROACTIVE_FRIEND_MODE_MIGRATION_KEY = "pulse_proactive_friend_mode_defaults_v2";
const LAST_USER_MESSAGE_AT_KEY = "pulse_proactive_last_user_message_at";
const FRIEND_CONTEXT_KEY = "pulse_proactive_friend_context";
const UNANSWERED_PROACTIVE_KEY = "pulse_proactive_unanswered_state";
const RECENT_PROACTIVE_TEXTS_KEY = "pulse_proactive_recent_texts";
const DEFAULT_PERSONAL_FREQUENCY_MINUTES = 10;
const ALLOWED_PERSONAL_FREQUENCIES = [1, 10, 20, 50, 60, 240, 300, 360];
const PERSONAL_CHECK_INTERVAL_MS = 30 * 1000;
const IDLE_GUARD_MS = 30 * 60 * 1000;
const PERSONAL_STALE_MS = 24 * 60 * 60 * 1000;
const MAX_UNANSWERED_PROACTIVE_MESSAGES = 2;
const RECENT_PROACTIVE_TEXT_LIMIT = 12;

let timer = null;
let personalTimer = null;
let lastSentAt = 0;
let lastSignature = "";

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sentStorageKey(signature) {
  return `${STORAGE_PREFIX}:${todayKey()}:${signature}`;
}

function wasSentToday(signature) {
  try {
    return localStorage.getItem(sentStorageKey(signature)) === "1";
  } catch {
    return false;
  }
}

function markSent(signature) {
  try {
    localStorage.setItem(sentStorageKey(signature), "1");
  } catch {}
}

function normalizeProactiveText(value) {
  return compactText(value)
    .replace(/[，。！？、；：,.!?;:\-—~～\s]/g, "")
    .slice(0, 120);
}

function recentProactiveTextsKey() {
  return `${RECENT_PROACTIVE_TEXTS_KEY}:${todayKey()}`;
}

function readRecentProactiveTexts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentProactiveTextsKey()) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function hasRecentProactiveText(text) {
  const body = normalizeProactiveText(text);
  if (!body) return false;
  return readRecentProactiveTexts().some((old) => old === body || old.includes(body) || body.includes(old));
}

function markRecentProactiveText(text) {
  const body = normalizeProactiveText(text);
  if (!body) return;
  try {
    const rows = readRecentProactiveTexts().filter((old) => old !== body);
    rows.push(body);
    localStorage.setItem(recentProactiveTextsKey(), JSON.stringify(rows.slice(-RECENT_PROACTIVE_TEXT_LIMIT)));
  } catch {}
}

function readUnansweredProactiveState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UNANSWERED_PROACTIVE_KEY) || "null");
    if (parsed?.day === todayKey()) return { day: parsed.day, count: Number(parsed.count) || 0 };
  } catch {}
  return { day: todayKey(), count: 0 };
}

function writeUnansweredProactiveState(count) {
  try {
    localStorage.setItem(UNANSWERED_PROACTIVE_KEY, JSON.stringify({ day: todayKey(), count: Math.max(0, Number(count) || 0) }));
  } catch {}
}

function reachedUnansweredProactiveLimit() {
  return readUnansweredProactiveState().count >= MAX_UNANSWERED_PROACTIVE_MESSAGES;
}

function noteUnansweredProactiveSent() {
  const state = readUnansweredProactiveState();
  writeUnansweredProactiveState(state.count + 1);
}

function resetUnansweredProactiveState() {
  writeUnansweredProactiveState(0);
}

function canSend(alert) {
  const signature = normalizeText(alert?.signature);
  const now = Date.now();
  const minGapMs = proactiveFrequencyMinutes() * 60 * 1000;
  if (signature.startsWith("friend-") && now - lastSentAt < MIN_FRIEND_NUDGE_GAP_MS) return false;
  if (signature === lastSignature && now - lastSentAt < minGapMs) return false;
  if (wasSentToday(signature)) return false;
  if (hasRecentProactiveText(alert?.text)) return false;
  return true;
}

function proactiveFrequencyBucket() {
  const minutes = proactiveFrequencyMinutes();
  return Math.floor(Date.now() / Math.max(60 * 1000, minutes * 60 * 1000));
}

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function isProactiveEnabled() {
  try {
    return localStorage.getItem(PROACTIVE_ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

function proactiveFrequencyMinutes() {
  try {
    const value = Number(localStorage.getItem(PROACTIVE_FREQUENCY_KEY));
    if (ALLOWED_PERSONAL_FREQUENCIES.includes(value)) return value;
  } catch {}
  return DEFAULT_PERSONAL_FREQUENCY_MINUTES;
}

function idleGuardEnabled() {
  try {
    return localStorage.getItem(PROACTIVE_IDLE_GUARD_KEY) === "true";
  } catch {
    return false;
  }
}

function applyFriendModeDefaults() {
  try {
    if (localStorage.getItem(PROACTIVE_FRIEND_MODE_MIGRATION_KEY) === "1") return;
    localStorage.setItem(PROACTIVE_ENABLED_KEY, "true");
    localStorage.setItem(PROACTIVE_FREQUENCY_KEY, "10");
    localStorage.setItem(PROACTIVE_IDLE_GUARD_KEY, "false");
    localStorage.setItem(PROACTIVE_FRIEND_MODE_MIGRATION_KEY, "1");
  } catch {}
}

function markUserMessageAt() {
  try {
    localStorage.setItem(LAST_USER_MESSAGE_AT_KEY, String(Date.now()));
  } catch {}
}

function readFriendContext() {
  try {
    return JSON.parse(localStorage.getItem(FRIEND_CONTEXT_KEY) || "null") || null;
  } catch {
    return null;
  }
}

function writeFriendContext(value) {
  try {
    if (!value) localStorage.removeItem(FRIEND_CONTEXT_KEY);
    else localStorage.setItem(FRIEND_CONTEXT_KEY, JSON.stringify(value));
  } catch {}
}

function observeFriendContext(text) {
  const body = compactText(text);
  const now = Date.now();
  if (/回来了|吃完了|吃好了|忙完了|开完会了|醒了/.test(body)) {
    writeFriendContext(null);
  } else if (/吃饭|吃个饭|去吃|干饭|吃东西|吃晚饭|吃午饭|吃早餐/.test(body)) {
    writeFriendContext({ type: "meal", at: now });
  } else if (/睡会|睡觉|午睡|躺会|休息会|眯一会/.test(body)) {
    writeFriendContext({ type: "rest", at: now });
  } else if (/开会|会儿回来|等会回来|一会回来|先忙|忙会|出去一下|出门/.test(body)) {
    writeFriendContext({ type: "away", at: now });
  }
}

function recentlyChatted() {
  if (!idleGuardEnabled()) return false;
  try {
    const last = Number(localStorage.getItem(LAST_USER_MESSAGE_AT_KEY) || "0");
    return Number.isFinite(last) && last > 0 && Date.now() - last < IDLE_GUARD_MS;
  } catch {
    return false;
  }
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function parseSimpleNumber(raw) {
  const text = normalizeText(raw);
  if (!text) return null;
  const n = Number(text);
  if (Number.isFinite(n)) return n;
  const map = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (text === "十") return 10;
  if (text.includes("十")) {
    const [left, right] = text.split("十");
    const tens = left ? map[left] : 1;
    const ones = right ? map[right] : 0;
    if (Number.isFinite(tens) && Number.isFinite(ones)) return tens * 10 + ones;
  }
  if (text.length === 1 && map[text]) return map[text];
  return null;
}

function parseDurationMs(raw, fallbackMinutes = null) {
  const text = compactText(raw);
  if (!text) return fallbackMinutes ? fallbackMinutes * 60 * 1000 : null;
  if (/半(个)?(小时|钟头|钟)/.test(text)) return 30 * 60 * 1000;
  const num = "([0-9]+(?:\\.[0-9]+)?|[一二两三四五六七八九十]+)";
  let ms = 0;
  const hourMatch = text.match(new RegExp(`${num}(个)?(小时|钟头|钟|h)`, "i"));
  if (hourMatch) {
    const hours = parseSimpleNumber(hourMatch[1]);
    if (Number.isFinite(hours)) ms += hours * 60 * 60 * 1000;
  }
  const minuteMatch = text.match(new RegExp(`${num}(分钟|分|min|m)`, "i"));
  if (minuteMatch) {
    const minutes = parseSimpleNumber(minuteMatch[1]);
    if (Number.isFinite(minutes)) ms += minutes * 60 * 1000;
  }
  if (ms > 0) return ms;
  if (/一会儿|一会|等会|等一下|待会/.test(text)) return 20 * 60 * 1000;
  return fallbackMinutes ? fallbackMinutes * 60 * 1000 : null;
}

function parseDurationMsOrDefault(raw) {
  return parseDurationMs(raw, proactiveFrequencyMinutes());
}

function reminderDelay(raw) {
  const explicitMs = parseDurationMs(raw, null);
  if (Number.isFinite(explicitMs) && explicitMs > 0) return { ms: explicitMs, explicit: true };
  return { ms: proactiveFrequencyMinutes() * 60 * 1000, explicit: false };
}

function readPersonalReminders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PERSONAL_REMINDERS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - PERSONAL_STALE_MS;
    return parsed.filter((item) => item && Number.isFinite(item.dueAt) && item.dueAt >= cutoff);
  } catch {
    return [];
  }
}

function writePersonalReminders(items) {
  try {
    localStorage.setItem(PERSONAL_REMINDERS_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  } catch {}
}

function schedulePersonalReminder(reminder) {
  if (!reminder?.text || !Number.isFinite(reminder.dueAt)) return null;
  const now = Date.now();
  const item = {
    id: `pr_${now}_${Math.random().toString(16).slice(2)}`,
    kind: reminder.kind || "generic",
    text: reminder.text,
    source: reminder.source || "",
    explicit: reminder.explicit === true,
    requested: reminder.requested === true,
    dueAt: reminder.dueAt,
    createdAt: now,
  };
  const items = readPersonalReminders().filter((old) => {
    if (old.kind !== item.kind) return true;
    if (old.source && old.source === item.source) return false;
    return Math.abs(Number(old.dueAt || 0) - item.dueAt) > 60 * 1000;
  });
  items.push(item);
  writePersonalReminders(items);
  return item;
}

function cancelPersonalReminders(kinds) {
  const set = new Set(kinds);
  const items = readPersonalReminders();
  const next = items.filter((item) => !set.has(item.kind));
  writePersonalReminders(next);
  return items.length - next.length;
}

function collectDuePersonalReminders() {
  const now = Date.now();
  const due = [];
  const pending = [];
  for (const item of readPersonalReminders()) {
    if (Number(item.dueAt) <= now) due.push(item);
    else pending.push(item);
  }
  writePersonalReminders(pending);
  return due;
}

function reminderSubject(raw) {
  let text = compactText(raw);
  text = text.replace(/(请|帮我|麻烦你|到时候|到点|记得|一定要)/g, "");
  text = text.replace(/(提醒我|叫我|喊我|通知我|跟我说)/g, "");
  text = text.replace(/半(个)?(小时|钟头|钟)(后)?/g, "");
  text = text.replace(/([0-9]+(?:\.[0-9]+)?|[一二两三四五六七八九十]+)(个)?(小时|钟头|钟|分钟|分|min|m|h)(后)?/gi, "");
  text = text.replace(/(之后|以后|后)/g, "");
  return text.slice(0, 36) || "你刚才让我记着的事";
}

function personalReminderFromText(raw) {
  const source = normalizeText(raw);
  const text = compactText(raw);
  if (!text) return null;
  const now = Date.now();
  const delay = reminderDelay(text);
  const profile = loadPersonalDataProfile();
  if (/(我|俺)?(先|要|去|准备|出去)?(吃饭|吃午饭|吃晚饭|吃早饭|吃早餐|吃点东西)(了|去|先|一下)?/.test(text) && !/(没吃|忘吃|忘记吃|提醒我|叫我|喊我)/.test(text)) {
    if (!canUseLifeCare(profile)) return null;
    return {
      kind: "meal",
      explicit: delay.explicit,
      requested: false,
      dueAt: now + delay.ms,
      source,
      text: "吃完了吗？如果回来了，先喝口水，咱们可以继续刚才的事。要是还没吃完，就慢慢吃，不急。",
    };
  }
  if (/(没吃|没顾上吃|忘吃|忘记吃|忘了吃)(早饭|早餐|午饭|晚饭|饭|东西)?|((早饭|早餐|午饭|晚饭|饭)(没吃|忘了|忘记了))/.test(text)) {
    if (!canUseLifeCare(profile)) return null;
    return {
      kind: "self_care",
      explicit: delay.explicit,
      requested: false,
      dueAt: now + delay.ms,
      source,
      text: "你刚才说还没好好吃东西。现在有空的话，先垫一点吧，别空腹硬扛。吃完再回来也可以。",
    };
  }
  if (/(我|俺)?(先|要|去|准备)?(休息|眯一会|睡一会|躺一下|歇一会)/.test(text)) {
    if (!canUseLifeCare(profile)) return null;
    return {
      kind: "break",
      explicit: delay.explicit,
      requested: false,
      dueAt: now + delay.ms,
      source,
      text: "休息得怎么样？如果精神回来一点了，我们可以继续；如果还累，就再多缓一会儿。",
    };
  }
  if (/(我|俺)?(先|要|去|准备)?(开会|会议)/.test(text)) {
    if (!canUseChatSignals(profile)) return null;
    return {
      kind: "meeting",
      explicit: delay.explicit,
      requested: false,
      dueAt: now + delay.ms,
      source,
      text: "会开完了吗？如果需要，我可以帮你把会议结论、待办和下一步整理一下。",
    };
  }
  if (/(我|俺)?(先|要|去|准备)?(出去|出门|离开|下楼|拿快递|办点事)/.test(text)) {
    if (!canUseChatSignals(profile)) return null;
    return {
      kind: "away",
      explicit: delay.explicit,
      requested: false,
      dueAt: now + delay.ms,
      source,
      text: "回来了没？如果已经回来了，我在这儿，可以继续陪你处理刚才的事。",
    };
  }
  if (/(提醒我|叫我|喊我|通知我)/.test(text)) {
    return {
      kind: "generic",
      explicit: true,
      requested: true,
      dueAt: now + delay.ms,
      source,
      text: `到时间了，我提醒你：${reminderSubject(text)}。`,
    };
  }
  return null;
}

function staleDays(item) {
  const n = Number(item?.staleDays);
  return Number.isFinite(n) ? n : 0;
}

function healthLevel(item) {
  return String(item?.health?.level || "").toLowerCase();
}

function customerKey(item) {
  return normalizeText(item?.id || item?.customerId || item?.name, "customer").slice(0, 40);
}

function nextActionFor(item) {
  const stage = normalizeText(item?.stage).toLowerCase();
  const days = staleDays(item);
  if (/报价|价格|quote|price/.test(stage)) return "先确认报价是否已被内部评估，再补一个案例或优惠边界。";
  if (/demo|演示|试用/.test(stage)) return "整理 Demo 反馈，确认决策人、预算和下一次会议时间。";
  if (/poc|验收|测试/.test(stage)) return "确认 POC 验收标准、负责人和截止时间，避免停在测试阶段。";
  if (/复购|老客|售后|退货|差评/.test(stage)) return "先确认体验问题，再给补偿或复购方案，避免客户流失。";
  if (/签约|合同|成交/.test(stage)) return "确认合同、付款和交付节点，把下一步变成明确动作。";
  if (days >= 14) return "这个客户已经长期未动，建议今天重新激活，必要时老板介入。";
  if (days >= 7) return "超过一周没动了，建议今天补一条有明确下一步的消息。";
  if (days >= 3) return "已有几天没更新，建议补跟进记录并约定下次沟通时间。";
  return "补充需求、预算、关注点和下次跟进时间，让客户资产更完整。";
}

function buildAlert(today) {
  if (!today || today.ok === false) return null;
  const followups = Array.isArray(today.followups) ? today.followups : [];
  const totalCustomers = Number(today.totalCustomers || 0);
  const todayContacted = Number(today.todayContacted || 0);
  const weekNew = Number(today.weekNew || 0);
  const urgent = followups.filter((item) => healthLevel(item) === "danger" || staleDays(item) >= 7);
  const warn = followups.filter((item) => ["danger", "warn"].includes(healthLevel(item)) || staleDays(item) >= 3);
  const lead = urgent[0] || warn[0] || followups[0];
  const hour = new Date().getHours();

  if (urgent.length && lead) {
    const name = normalizeText(lead.name, "未命名客户");
    const stage = normalizeText(lead.stage, "未分阶段");
    const days = staleDays(lead);
    return {
      signature: `urgent:${customerKey(lead)}:${Math.min(days, 30)}`,
      text: [
        `我主动提醒一下：现在有 ${urgent.length} 个客户已经明显停滞，最该先看的是「${name}」。`,
        `阶段：${stage}；已经 ${days || "多"} 天没有明显推进。`,
        `建议你现在先做：${nextActionFor(lead)}`,
        `如果你要处理，可以直接回我：帮我写给「${name}」的跟进话术。`,
      ].join("\n\n"),
    };
  }

  if (followups.length && lead) {
    const name = normalizeText(lead.name, "未命名客户");
    const stage = normalizeText(lead.stage, "未分阶段");
    return {
      signature: `due:${followups.length}:${customerKey(lead)}`,
      text: [
        `我看了一下，今天有 ${followups.length} 个客户值得跟进。`,
        `建议先从「${name}」开始，当前阶段是「${stage}」。`,
        `下一步可以做：${nextActionFor(lead)}`,
        `你也可以回我：把今天要跟进的客户按优先级排一下。`,
      ].join("\n\n"),
    };
  }

  if (totalCustomers > 0 && todayContacted === 0 && hour >= 10) {
    return {
      signature: `no-contact:${totalCustomers}:${hour >= 15 ? "pm" : "am"}`,
      text: [
        `我主动提醒一下：今天目前还没有客户联系或更新记录。`,
        `你现在有 ${totalCustomers} 个客户资产，建议先挑一个长期未动或最近新增的客户补一次跟进。`,
        `如果你愿意，可以回我：帮我找今天最该联系的 3 个客户。`,
      ].join("\n\n"),
    };
  }

  if (weekNew > 0 && totalCustomers > 0 && hour >= 16) {
    return {
      signature: `week-new:${weekNew}`,
      text: [
        `我提醒你收个尾：本周新增了 ${weekNew} 个客户。`,
        `建议今天下班前补齐阶段、需求、预算和下次跟进时间，避免新线索沉下去。`,
        `你可以回我：帮我整理本周新增客户的跟进计划。`,
      ].join("\n\n"),
    };
  }

  return null;
}

function cleanTopicText(value) {
  return normalizeText(value)
    .replace(/^(You|Pulse|PULSE|Peer)\s*/i, "")
    .replace(/\s+/g, " ")
    .slice(0, 42);
}

function recentUserTopic(chat) {
  const rows = typeof chat?.recentMessages === "function" ? chat.recentMessages(10) : [];
  const found = rows.slice().reverse().find((item) => item.role === "user" && cleanTopicText(item.text).length >= 3);
  return found ? cleanTopicText(found.text) : "";
}

function buildFallbackNudge(chat) {
  const hour = new Date().getHours();
  const bucket = Math.floor(Date.now() / MIN_FRIEND_NUDGE_GAP_MS);
  const context = readFriendContext();
  if (context?.type && Date.now() - Number(context.at || 0) > 15 * 60 * 1000) {
    const contextual = {
      meal: [
        "吃这么久，吃啥好吃的去了？",
        "你这顿饭吃得有点久啊，吃的什么？",
        "饭吃完没？还是边吃边刷手机呢。",
      ],
      rest: [
        "睡醒没？刚才是不是眯了一会儿。",
        "休息得怎么样，缓过来点没？",
        "你刚才说去休息，我来看看你醒没醒。",
      ],
      away: [
        "你刚才说一会儿回来，忙完没？",
        "怎么这么久不说话呀，干啥去了？",
        "你忙完了吗？我还在这儿呢。",
      ],
    };
    const list = contextual[context.type] || contextual.away;
    return {
      signature: `friend-context:${todayKey()}:${context.type}:${Math.floor(Number(context.at || 0) / 60000)}:${bucket}`,
      text: list[bucket % list.length],
    };
  }
  const topic = recentUserTopic(chat);
  const shouldMentionTopic = topic && bucket % 4 === 0;
  const prefix = shouldMentionTopic
    ? "我刚想起前面聊的事。"
    : hour < 11 ? "我看你半天没动静。" : hour < 18 ? "你这会儿安静得有点久。" : "我还在，刚好想起你。";
  const followups = shouldMentionTopic ? [
    `刚才你提到「${topic}」，要不要接着说？`,
    `我还记着那个「${topic}」，你要是想聊我们再接上。`,
  ] : [
    "怎么这么久不说话呀，干啥去了？",
    "人呢？我还以为你把我晾这儿了。",
    "我来戳你一下，在忙还是在发呆？",
    "半天没动静，跑哪儿去了？",
    "我在呢，你想说话的时候直接喊我就行。",
  ];
  const soft = [
    "不急，我就先在这儿陪着。",
    "你想认真聊也行，随便吐槽也行。",
    "不用组织语言，想到哪说哪。",
  ];
  let text = followups[bucket % followups.length];
  if (bucket % 3 === 0) text = `${prefix}\n\n${text}`;
  else if (bucket % 3 === 1) text = `${text}\n\n${soft[bucket % soft.length]}`;
  return {
    signature: `friend-nudge:${todayKey()}:${bucket}`,
    text,
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function hasActiveIndustry(apiBase, getIndustryState) {
  const cached = getIndustryState?.();
  if (cached?.activePack?.id) return true;
  try {
    const state = await fetchJson(`${apiBase}/industry`);
    return !!state?.activePack?.id;
  } catch {
    return false;
  }
}

function revealChat(chat) {
  const active = document.body.getAttribute("data-active-view") || "";
  if (!chat?.isTyping?.() && !["settings", "workspace", "memory"].includes(active)) {
    try { window.pulseSetView?.("chat"); } catch {}
  }
  try { chat?.openChat?.(true); } catch {}
}

function deliver(chat, alert) {
  if (!alert?.text || !chat?.addMsg) return;
  chat.addMsg("pulse", alert.text, { alert: true, pending: true });
  if (document.getElementById("voice-btn")?.classList.contains("active")) {
    try { window.playTTSReply?.(alert.text); } catch {}
  }
  revealChat(chat);
  lastSentAt = Date.now();
  lastSignature = alert.signature;
  markSent(alert.signature);
  markRecentProactiveText(alert.text);
}

function deliverDuePersonalReminders(chat) {
  const due = collectDuePersonalReminders();
  if (!due.length) return [];
  for (const item of due.slice(0, 3)) {
    deliver(chat, { signature: `personal:${item.id}`, text: item.text });
  }
  return due;
}

function shouldDelayReminder(item) {
  if (!recentlyChatted()) return false;
  return item?.explicit !== true;
}

function quietDelayUntil() {
  const profile = loadPersonalDataProfile();
  if (!isQuietNow(profile)) return null;
  return quietEndsAt(profile);
}

function isExplicitReminderRequest(text) {
  return /(提醒我|叫我|喊我|通知我)/.test(compactText(text));
}

export function initProactiveAssistant({ apiBase, chat, getIndustryState } = {}) {
  if (!apiBase || !chat?.addMsg) return null;
  applyFriendModeDefaults();

  async function checkNow({ force = false } = {}) {
    try {
      if (!isProactiveEnabled() && !force) return null;
      if (!force && quietDelayUntil()) return null;
      if (!force && recentlyChatted()) return null;
      if (reachedUnansweredProactiveLimit()) return null;
      const active = await hasActiveIndustry(apiBase, getIndustryState);
      let alert = null;
      if (active && (force || canUseBusinessSignals())) {
        const today = await fetchJson(`${apiBase}/biz/today`);
        alert = buildAlert(today);
      }
      if (!alert) alert = buildFallbackNudge(chat);
      if (!alert) return null;
      if (!force && !canSend(alert)) return null;
      deliver(chat, alert);
      noteUnansweredProactiveSent();
      return alert;
    } catch {
      return null;
    }
  }

  function send(text) {
    const body = normalizeText(text);
    if (!body) return;
    deliver(chat, { signature: `manual:${Date.now()}`, text: body });
  }

  function observeUserMessage(text) {
    const body = normalizeText(text);
    if (!body) return null;
    markUserMessageAt();
    resetUnansweredProactiveState();
    observeFriendContext(body);
    if (!canUseChatSignals() && !isExplicitReminderRequest(body)) return null;
    if (!isProactiveEnabled() && !isExplicitReminderRequest(body)) return null;
    if (/(回来了|吃完了|吃过了|休息好了|开完会了|不用提醒|别提醒|取消提醒)/.test(compactText(body))) {
      cancelPersonalReminders(["meal", "break", "meeting", "away", "generic", "self_care"]);
      return null;
    }
    const reminder = personalReminderFromText(body);
    if (!reminder) return null;
    return schedulePersonalReminder(reminder);
  }

  function checkPersonalReminders() {
    const due = collectDuePersonalReminders();
    if (!due.length) return [];
    const deliverNow = [];
    const delayed = [];
    const quietUntil = quietDelayUntil();
    const delayUntil = quietUntil || Date.now() + Math.max(60 * 1000, IDLE_GUARD_MS / 2);
    for (const item of due) {
      if (!isProactiveEnabled() && item.requested !== true) continue;
      if (quietUntil && item.requested !== true) {
        delayed.push({ ...item, dueAt: quietUntil });
        continue;
      }
      if (shouldDelayReminder(item)) delayed.push({ ...item, dueAt: delayUntil });
      else deliverNow.push(item);
    }
    if (delayed.length) writePersonalReminders(readPersonalReminders().concat(delayed));
    for (const item of deliverNow.slice(0, 3)) {
      deliver(chat, { signature: `personal:${item.id}`, text: item.text });
    }
    return deliverNow;
  }

  function resetPersonalTimer() {
    if (personalTimer) clearInterval(personalTimer);
    personalTimer = setInterval(() => checkPersonalReminders(), PERSONAL_CHECK_INTERVAL_MS);
  }

  function resetProactiveTimer() {
    if (timer) clearInterval(timer);
    const intervalMs = Math.max(60 * 1000, proactiveFrequencyMinutes() * 60 * 1000);
    timer = setInterval(() => checkNow(), intervalMs);
  }

  if (personalTimer) clearInterval(personalTimer);
  resetProactiveTimer();
  resetPersonalTimer();
  setTimeout(() => checkNow(), START_DELAY_MS);
  setTimeout(() => checkPersonalReminders(), 1500);

  window.addEventListener("pulse:customers-changed", () => setTimeout(() => checkNow({ force: true }), 1200));
  window.addEventListener("pulse:industry-changed", () => setTimeout(() => checkNow(), 1800));
  window.addEventListener("pulse:open-followups", () => setTimeout(() => checkNow(), 1500));
  window.addEventListener("pulse:proactive-message", (event) => send(event.detail?.text || event.detail));
  window.addEventListener("pulse:proactive-settings-changed", () => {
    resetProactiveTimer();
    resetPersonalTimer();
    checkPersonalReminders();
    setTimeout(() => checkNow(), 300);
  });
  window.pulseProactive = {
    checkNow,
    checkPersonalReminders,
    observeUserMessage,
    resetProactiveTimer,
    resetPersonalTimer,
    settings: () => ({ enabled: isProactiveEnabled(), frequencyMinutes: proactiveFrequencyMinutes(), idleGuard: idleGuardEnabled() }),
    send,
    test: () => send("我主动给你发一条测试消息：以后我会根据客户跟进、长期未动、今日未联系等情况，主动提醒你下一步该处理什么。"),
    testMeal: () => observeUserMessage("我去吃饭了，半小时"),
  };

  return window.pulseProactive;
}
