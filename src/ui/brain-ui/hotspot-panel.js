export const createHotspotPanel = () => `
<div class="hotspot-panel hotspot-panel--lite" id="hotspot-panel">

  <!-- 顶栏：标题 + 时间 + 操作 -->
  <div class="hs-bar">
    <div class="hs-bar-title">
      <span class="hs-bar-title-zh">全球热点</span>
      <span class="hs-bar-title-en">HOTSPOT</span>
    </div>
    <div class="hs-bar-spacer"></div>
    <div class="hs-bar-meta">
      <span class="hs-bar-clock" id="hs-clock">--:--:--</span>
      <span class="hs-bar-source" id="hs-bar-source">数据加载中…</span>
    </div>
    <div class="hs-bar-actions">
      <button class="hs-icon-btn" id="hs-refresh-btn" type="button" title="立即刷新">⟳</button>
      <button class="hs-icon-btn hs-icon-btn-close" id="hs-exit-btn" type="button" title="关闭热点模式">×</button>
    </div>
  </div>

  <section class="hs-industry-focus" id="hs-industry-focus" hidden>
    <div class="hs-industry-head">
      <span class="hs-industry-title" id="hs-industry-title">行业热点焦点</span>
      <span class="hs-industry-sub" id="hs-industry-sub">按当前行业筛选</span>
    </div>
    <div class="hs-industry-keywords" id="hs-industry-keywords"></div>
    <ul class="hs-industry-list" id="hs-industry-list"></ul>
  </section>

  <!-- 4 列网格 -->
  <div class="hs-grid">
    <div class="hs-list-card" id="hs-douyin-card">
      <div class="hs-card-header">
        <span class="hs-platform-dot hs-dot-douyin"></span>
        <span class="hs-platform-name">抖音</span>
        <span class="hs-card-badge">热榜</span>
        <span class="hs-card-update" id="hs-douyin-update">—</span>
      </div>
      <ul class="hs-list" id="hs-douyin-list"></ul>
    </div>

    <div class="hs-list-card" id="hs-xhs-card">
      <div class="hs-card-header">
        <span class="hs-platform-dot hs-dot-xhs"></span>
        <span class="hs-platform-name">小红书</span>
        <span class="hs-card-badge">热榜</span>
        <span class="hs-card-update" id="hs-xhs-update">—</span>
      </div>
      <ul class="hs-list" id="hs-xhs-list"></ul>
    </div>

    <div class="hs-list-card" id="hs-wechat-card">
      <div class="hs-card-header">
        <span class="hs-platform-dot hs-dot-wechat"></span>
        <span class="hs-platform-name">微信</span>
        <span class="hs-card-badge">热点榜</span>
        <span class="hs-card-update" id="hs-wechat-update">—</span>
      </div>
      <ul class="hs-list" id="hs-wechat-list"></ul>
    </div>

    <div class="hs-list-card" id="hs-weibo-card">
      <div class="hs-card-header">
        <span class="hs-platform-dot hs-dot-weibo"></span>
        <span class="hs-platform-name">微博</span>
        <span class="hs-card-badge">热搜榜</span>
        <span class="hs-card-update" id="hs-weibo-update">—</span>
      </div>
      <ul class="hs-list" id="hs-weibo-list"></ul>
    </div>
  </div>

</div>
`;
