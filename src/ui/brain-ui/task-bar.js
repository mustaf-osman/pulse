import { apiUrl } from "./api-client.js";

let bar = null;
let mounted = false;
let current = { task: null, steps: [] };
let expanded = false;

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ensureMounted() {
  if (mounted) return;
  const appBar = document.getElementById("pulse-app-bar");
  if (!appBar) return;
  const wrap = document.createElement("div");
  wrap.id = "pulse-task-bar";
  wrap.className = "pulse-task-bar";
  wrap.hidden = true;
  wrap.innerHTML = `
    <button type="button" class="pulse-task-summary" id="pulse-task-summary" title="点击展开">
      <span class="pulse-task-spinner"></span>
      <span class="pulse-task-title" id="pulse-task-title">任务进行中</span>
      <span class="pulse-task-progress" id="pulse-task-progress">0 / 0</span>
      <span class="pulse-task-chevron" id="pulse-task-chevron">▾</span>
    </button>
    <div class="pulse-task-bar-fill"><div class="pulse-task-bar-fill-inner" id="pulse-task-fill"></div></div>
    <div class="pulse-task-steps" id="pulse-task-steps" hidden></div>
  `;
  appBar.insertAdjacentElement("afterend", wrap);
  bar = wrap;
  mounted = true;

  document.getElementById("pulse-task-summary")?.addEventListener("click", toggleExpand);
}

function toggleExpand() {
  expanded = !expanded;
  const stepsEl = document.getElementById("pulse-task-steps");
  const chevron = document.getElementById("pulse-task-chevron");
  if (stepsEl) stepsEl.hidden = !expanded;
  if (chevron) chevron.textContent = expanded ? "▴" : "▾";
}

function statusIcon(status) {
  return ({
    done: "✓",
    failed: "✕",
    skipped: "–",
    pending: "○",
  }[status] || "○");
}

function render() {
  ensureMounted();
  if (!bar) return;
  if (!current.task) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const total = current.steps.length;
  const done = current.steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  const failed = current.steps.some((s) => s.status === "failed");
  const ratio = total > 0 ? (done / total) * 100 : 0;

  const titleEl = document.getElementById("pulse-task-title");
  const progressEl = document.getElementById("pulse-task-progress");
  const fillEl = document.getElementById("pulse-task-fill");
  const stepsEl = document.getElementById("pulse-task-steps");

  if (titleEl) titleEl.textContent = String(current.task).slice(0, 80);
  if (progressEl) progressEl.textContent = total > 0 ? `${done} / ${total}` : "—";
  if (fillEl) {
    fillEl.style.width = `${ratio}%`;
    fillEl.dataset.level = failed ? "error" : done === total && total > 0 ? "done" : "normal";
  }
  if (stepsEl) {
    if (total === 0) {
      stepsEl.innerHTML = `<div class="pulse-task-step-empty">无步骤明细</div>`;
    } else {
      stepsEl.innerHTML = current.steps
        .map((s, i) => {
          const status = s.status || "pending";
          const text = s.text || `步骤 ${i + 1}`;
          const note = s.note ? ` · ${esc(String(s.note).slice(0, 60))}` : "";
          return `<div class="pulse-task-step" data-status="${status}">
            <span class="pulse-task-step-icon">${statusIcon(status)}</span>
            <span class="pulse-task-step-text">${esc(text)}${note}</span>
          </div>`;
        })
        .join("");
    }
  }
}

export async function refreshTask() {
  try {
    const r = await fetch(apiUrl(`/task`), { credentials: "same-origin" });
    if (!r.ok) return;
    const data = await r.json();
    current = { task: data?.task || null, steps: Array.isArray(data?.steps) ? data.steps : [] };
    render();
  } catch {
    /* ignore */
  }
}

/** SSE 事件入口 */
export function handleTaskEvent(type, data) {
  ensureMounted();
  switch (type) {
    case "task_set":
      current = {
        task: data?.task || null,
        steps: Array.isArray(data?.steps)
          ? data.steps.map((s) => (typeof s === "string" ? { text: s, status: "pending" } : { ...s }))
          : [],
      };
      expanded = true;
      const stepsEl = document.getElementById("pulse-task-steps");
      const chevron = document.getElementById("pulse-task-chevron");
      if (stepsEl) stepsEl.hidden = false;
      if (chevron) chevron.textContent = "▴";
      render();
      break;
    case "task_step_updated": {
      const idx = data?.index;
      if (typeof idx === "number" && current.steps[idx]) {
        current.steps[idx] = {
          ...current.steps[idx],
          status: data.status || current.steps[idx].status,
          note: data.note || current.steps[idx].note,
        };
        render();
      }
      break;
    }
    case "task_cleared":
      current = { task: null, steps: [] };
      expanded = false;
      render();
      break;
    default:
      break;
  }
}

export function initTaskBar() {
  ensureMounted();
  refreshTask();
}
