import { apiUrl } from "./api-client.js";

let timer = null;

async function fetchQuota() {
  try {
    const r = await fetch(apiUrl(`/quota`), { credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch {
    return null;
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function render(data) {
  if (!data) {
    setText("usage-rpm", "—");
    setText("usage-tpm", "—");
    setText("usage-ratio", "—");
    setText("usage-tick", "—");
    return;
  }
  setText("usage-rpm", data.rpmUsed || `${data.requests || 0}/?`);
  setText("usage-tpm", data.tpmUsed || `${data.tokens || 0}/?`);
  setText("usage-ratio", data.ratio || "0%");
  if (typeof data.tickInterval === "number") {
    const seconds = Math.round(data.tickInterval / 1000);
    setText("usage-tick", `${seconds}s`);
  }

  const ratioNum = parseFloat(String(data.ratio || "0").replace("%", "")) || 0;
  const fill = document.getElementById("usage-bar-fill");
  if (fill) {
    fill.style.width = `${Math.min(100, ratioNum)}%`;
    fill.dataset.level = ratioNum > 80 ? "high" : ratioNum > 40 ? "mid" : "low";
  }
  const hint = document.getElementById("usage-bar-hint");
  if (hint) {
    if (ratioNum > 80) hint.textContent = "接近限额，TICK 将自动减速";
    else if (ratioNum > 40) hint.textContent = "中等占用";
    else if (ratioNum > 1) hint.textContent = "低占用";
    else hint.textContent = "空闲";
  }

  const dailyEl = document.getElementById("usage-daily");
  if (dailyEl) {
    if (data.daily && typeof data.daily === "object") {
      const labels = { tts: "TTS", music: "音乐", lyrics: "歌词", image: "图像" };
      const rows = Object.entries(data.daily).map(([k, v]) => {
        const label = labels[k] || k;
        return `<div class="usage-daily-row">
          <span class="usage-daily-label">${label}</span>
          <span class="usage-daily-value">${v.used} / ${v.limit}</span>
          <span class="usage-daily-ratio">${v.ratio}</span>
        </div>`;
      });
      dailyEl.innerHTML = rows.length
        ? rows.join("")
        : '<span class="usage-daily-empty">暂无数据</span>';
    } else {
      dailyEl.textContent = "暂无数据";
    }
  }
}

async function tick() {
  const data = await fetchQuota();
  render(data);
}

function start() {
  if (timer) return;
  tick();
  timer = setInterval(tick, 5000);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function isUsageTabActive() {
  const tab = document.querySelector('.settings-tab[data-tab="usage"]');
  return !!tab?.classList.contains("active");
}

export function initUsagePanel() {
  const overlay = document.getElementById("settings-overlay");
  if (!overlay) return;
  const sync = () => {
    const open = !overlay.hidden;
    if (open && isUsageTabActive()) start();
    else stop();
  };
  const mo = new MutationObserver(sync);
  mo.observe(overlay, { attributes: true, attributeFilter: ["hidden"] });

  document.querySelectorAll('.settings-nav-item[data-tab]').forEach((btn) => {
    btn.addEventListener("click", () => setTimeout(sync, 30));
  });

  sync();
}
