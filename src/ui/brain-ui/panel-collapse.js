const STORAGE_L1 = "pulse-panel-l1-collapsed";
const STORAGE_L2 = "pulse-panel-l2-collapsed";
// 默认偏好版本号：bump 这个值会让旧的 localStorage 配置重置一次。
// v2：右侧 L2 资料台默认展开（用户反馈：启动时面板应是开着的）。
const DEFAULTS_VERSION = "2";
const STORAGE_DEFAULTS_VERSION = "pulse-panel-defaults-version";

function storageKeyForSide(side) {
  return side === "l1" ? STORAGE_L1 : STORAGE_L2;
}

function classForSide(side) {
  return side === "l1" ? "l1-collapsed" : "l2-collapsed";
}

export function initPanelCollapse() {
  function setPanel(side, collapsed) {
    document.body.classList.toggle(classForSide(side), collapsed);
    try { localStorage.setItem(storageKeyForSide(side), collapsed ? "1" : "0"); } catch {}
  }

  function togglePanel(side) {
    const cls = classForSide(side);
    setPanel(side, !document.body.classList.contains(cls));
  }

  try {
    let l1 = localStorage.getItem(STORAGE_L1)
    let l2 = localStorage.getItem(STORAGE_L2)
    const ver = localStorage.getItem(STORAGE_DEFAULTS_VERSION)

    if (ver !== DEFAULTS_VERSION) {
      // 一次性把右侧面板状态重置成"展开"（用户偏好已变）
      // 左侧 L1（图谱/工作台）保持上一次状态；若也是首次，按"收起"。
      if (l1 === null) {
        l1 = '1'
        localStorage.setItem(STORAGE_L1, '1')
      }
      l2 = '0'
      localStorage.setItem(STORAGE_L2, '0')
      localStorage.setItem(STORAGE_DEFAULTS_VERSION, DEFAULTS_VERSION)
    } else if (l1 === null && l2 === null) {
      // 第一次进来：L1 收起，L2（资料台）展开
      l1 = '1'
      l2 = '0'
      localStorage.setItem(STORAGE_L1, '1')
      localStorage.setItem(STORAGE_L2, '0')
    }

    if (l1 === '1') document.body.classList.add('l1-collapsed')
    if (l2 === '1') document.body.classList.add('l2-collapsed')
  } catch {}

  document.getElementById("panel-l1-tab")?.addEventListener("click", () => togglePanel("l1"));
  document.getElementById("panel-l2-tab")?.addEventListener("click", () => togglePanel("l2"));

  window.addEventListener("keydown", (event) => {
    if (event.target && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.isContentEditable)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "[") { event.preventDefault(); togglePanel("l1"); }
    if (event.key === "]") { event.preventDefault(); togglePanel("l2"); }
  });
}

