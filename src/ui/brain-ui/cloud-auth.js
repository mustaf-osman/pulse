const CLOUD_API_KEY = "nimo_cloud_api";
const TOKEN_KEY = "nimo_cloud_token";
const USER_KEY = "nimo_cloud_user";
const LICENSE_KEY = "nimo_cloud_license";
const LICENSE_CHECKED_AT_KEY = "nimo_cloud_license_checked_at";
const DEVICE_KEY = "nimo_cloud_device_id";
const DEFAULT_CLOUD_API = "http://localhost:8787";

let bakedCloudApi = "";
let cloudApiLocked = false;
let localAuthEnabled = false;

async function loadBakedCloudConfig() {
  try {
    const res = await fetch("/cloud/config");
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      bakedCloudApi = String(data.cloudApi || "").trim();
      cloudApiLocked = data.allowOverride === false;
      localAuthEnabled = data.localAuth === true;
      if (bakedCloudApi && cloudApiLocked) {
        try { localStorage.setItem(CLOUD_API_KEY, bakedCloudApi); } catch {}
      }
    }
  } catch {}
}

function cloudApi() {
  if (cloudApiLocked && bakedCloudApi) return bakedCloudApi;
  try {
    const saved = localStorage.getItem(CLOUD_API_KEY);
    if (saved) return saved;
  } catch {}
  return bakedCloudApi || DEFAULT_CLOUD_API;
}

function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function readJson(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch { return fallback; }
}

function token() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}

function setToken(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

function deviceFingerprint() {
  try {
    let value = localStorage.getItem(DEVICE_KEY);
    if (!value) {
      value = `nimo-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      localStorage.setItem(DEVICE_KEY, value);
    }
    return value;
  } catch {
    return `nimo-${Date.now()}`;
  }
}

function deviceName() {
  const platform = navigator.platform || "Unknown OS";
  const lang = navigator.language || "";
  return `Nimo Reminder Desktop · ${platform} · ${lang}`;
}

async function localDeviceIdentity() {
  try {
    const res = await fetch("/cloud/device");
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.fingerprint) return data;
  } catch {}
  return {
    fingerprint: deviceFingerprint(),
    name: deviceName(),
  };
}

async function cloudFetch(path, options = {}) {
  const res = await fetch(`${cloudApi()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.data = data;
    error.quota = data.quota || null;
    throw error;
  }
  return data;
}

function clearSession() {
  setToken("");
  try {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LICENSE_KEY);
    localStorage.removeItem(LICENSE_CHECKED_AT_KEY);
  } catch {}
}

function saveLicense(license) {
  saveJson(LICENSE_KEY, license || null);
  try { localStorage.setItem(LICENSE_CHECKED_AT_KEY, String(Date.now())); } catch {}
}

function cachedLicenseWithinGrace() {
  const license = readJson(LICENSE_KEY, null);
  if (!license || license.accountStatus !== "active") return null;
  const lastCheckedAt = Number(localStorage.getItem(LICENSE_CHECKED_AT_KEY) || 0);
  if (!lastCheckedAt) return null;
  const graceHours = Number(license.offlineGraceHours ?? 24);
  if (!Number.isFinite(graceHours) || graceHours <= 0) return null;
  const ageMs = Date.now() - lastCheckedAt;
  if (ageMs > graceHours * 60 * 60 * 1000) return null;
  return {
    ...license,
    offline: true,
    offlineUntil: new Date(lastCheckedAt + graceHours * 60 * 60 * 1000).toISOString(),
  };
}

function isHardAuthError(code) {
  return ["invalid_token", "session_revoked", "session_expired", "session_not_found", "account_not_active"].includes(String(code || ""));
}

function setCloudAuthObject({ user = null, license = null } = {}) {
  const authObject = {
    user: user || license?.user || readJson(USER_KEY),
    license,
    canUseFeature,
    consumeFeature,
    cloudRequest: cloudFetch,
    logout: () => {
      clearSession();
      window.location.reload();
    },
  };
  window.NimoCloudAuth = authObject;
  window.NewPulseCloudAuth = authObject;
  try { window.dispatchEvent(new CustomEvent("nimo:cloud-license-updated")); } catch {}
  try { window.dispatchEvent(new CustomEvent("newpulse:cloud-license-updated")); } catch {}
}

async function applyLocalDevSession() {
  const device = await localDeviceIdentity();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000).toISOString();
  const user = {
    id: "nimo-local-user",
    email: "local@nimo.dev",
    name: "Nimo 本地账号",
    role: "local_dev",
  };
  const license = {
    ok: true,
    mode: "local",
    accountStatus: "active",
    subscriptionStatus: "local_dev",
    expiresAt,
    offlineGraceHours: 87600,
    user,
    device,
    features: {
      ai_chat: true,
      boss_dashboard: true,
      activity_supervision: true,
      company_knowledge: true,
      customer_crm: true,
      reminders: true,
      hardware_devices: true,
      wechat_binding: true,
    },
    quotas: {},
  };
  setToken("nimo-local-dev-token");
  saveJson(USER_KEY, user);
  saveLicense(license);
  setCloudAuthObject({ user, license });
  return true;
}

function renderGate(root, message = "请登录 Nimo 云端账号后使用提醒助手") {
  root.innerHTML = `
    <section class="np-cloud-auth-page">
      <div class="np-cloud-auth-card">
        <div class="np-cloud-auth-brand">Nimo Cloud</div>
        <h1>登录 Nimo 授权账号</h1>
        <p id="np-cloud-auth-message">${escapeHtml(message)}</p>
        <label class="${cloudApiLocked ? 'hidden' : ''}">云端地址<input id="np-cloud-api" value="${escapeHtml(cloudApi())}"${cloudApiLocked ? ' disabled' : ''}></label>
        <label>邮箱<input id="np-cloud-email" type="email" autocomplete="username" placeholder="you@example.com"></label>
        <label>密码<input id="np-cloud-password" type="password" autocomplete="current-password" placeholder="至少 8 位"></label>
        <label id="np-cloud-invite-row" class="hidden">邀请码<input id="np-cloud-invite" placeholder="NIMO-XXXX-XXXX"></label>
        <div class="np-cloud-auth-actions">
          <button id="np-cloud-login">登录</button>
          <button id="np-cloud-register" class="np-cloud-secondary">邀请码注册</button>
        </div>
        <div class="np-cloud-auth-hint" id="np-cloud-hint"></div>
      </div>
    </section>
    <style>
      .np-cloud-auth-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at 16% 8%, rgba(37,99,235,.24), transparent 34%), linear-gradient(135deg, #f8fafc, #dbeafe); font-family: Inter, "Microsoft YaHei", system-ui, sans-serif; color: #0f172a; }
      .np-cloud-auth-card { width: min(460px, calc(100vw - 32px)); padding: 34px; border-radius: 28px; background: rgba(255,255,255,.92); border: 1px solid rgba(148,163,184,.28); box-shadow: 0 28px 90px rgba(37,99,235,.18); }
      .np-cloud-auth-brand { color: #2563eb; font-weight: 900; letter-spacing: -.02em; }
      .np-cloud-auth-card h1 { margin: 12px 0 8px; font-size: 30px; }
      .np-cloud-auth-card p { margin: 0 0 18px; color: #64748b; line-height: 1.7; }
      .np-cloud-auth-card label { display: grid; gap: 8px; margin: 13px 0; color: #475569; font-size: 13px; }
      .np-cloud-auth-card input { border: 1px solid #dbe3ef; border-radius: 13px; padding: 11px 12px; font: inherit; outline: none; }
      .np-cloud-auth-card input:focus { border-color: #2563eb; box-shadow: 0 0 0 4px rgba(37,99,235,.12); }
      .np-cloud-auth-actions { display: flex; gap: 10px; margin-top: 16px; }
      .np-cloud-auth-actions button { flex: 1; border: 0; border-radius: 13px; padding: 12px 14px; background: #2563eb; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
      .np-cloud-auth-actions .np-cloud-secondary { background: #e2e8f0; color: #0f172a; }
      .np-cloud-auth-hint { min-height: 22px; margin-top: 14px; color: #dc2626; font-size: 13px; line-height: 1.6; }
      .hidden { display: none !important; }
    </style>
  `;

  const apiInput = document.getElementById("np-cloud-api");
  const emailInput = document.getElementById("np-cloud-email");
  const passwordInput = document.getElementById("np-cloud-password");
  const inviteInput = document.getElementById("np-cloud-invite");
  const inviteRow = document.getElementById("np-cloud-invite-row");
  const hint = document.getElementById("np-cloud-hint");
  const loginBtn = document.getElementById("np-cloud-login");
  const registerBtn = document.getElementById("np-cloud-register");

  apiInput?.addEventListener("change", () => {
    try { localStorage.setItem(CLOUD_API_KEY, apiInput.value.trim() || DEFAULT_CLOUD_API); } catch {}
  });

  loginBtn?.addEventListener("click", async () => {
    hint.textContent = "正在登录...";
    try {
      try { localStorage.setItem(CLOUD_API_KEY, apiInput.value.trim() || DEFAULT_CLOUD_API); } catch {}
      const device = await localDeviceIdentity();
      const data = await cloudFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value,
          deviceFingerprint: device.fingerprint,
          deviceName: device.name,
        }),
      });
      applyCloudSession(data);
      window.location.reload();
    } catch (error) {
      hint.textContent = authErrorText(error.message);
    }
  });

  registerBtn?.addEventListener("click", async () => {
    if (inviteRow.classList.contains("hidden")) {
      inviteRow.classList.remove("hidden");
      hint.textContent = "请输入邀请码后再次点击注册。";
      return;
    }
    hint.textContent = "正在注册...";
    try {
      try { localStorage.setItem(CLOUD_API_KEY, apiInput.value.trim() || DEFAULT_CLOUD_API); } catch {}
      const device = await localDeviceIdentity();
      const data = await cloudFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value,
          inviteCode: inviteInput.value.trim(),
          deviceFingerprint: device.fingerprint,
          deviceName: device.name,
        }),
      });
      applyCloudSession(data);
      window.location.reload();
    } catch (error) {
      hint.textContent = authErrorText(error.message);
    }
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[ch]));
}

function authErrorText(error) {
  const map = {
    invalid_credentials: "邮箱或密码错误。",
    account_not_active: "账号已被暂停或禁用，请联系管理员。",
    device_limit_reached: "这个账号已经绑定其他电脑，请联系管理员解绑。",
    invalid_invite: "邀请码无效。",
    invite_expired: "邀请码已过期。",
    invite_used_up: "邀请码使用次数已用完。",
    email_exists: "这个邮箱已经注册。",
    password_too_short: "密码至少需要 8 位。",
    missing_required_fields: "请填写完整信息。",
  };
  return map[error] || `连接云端授权失败：${error}`;
}

function applyCloudSession(data) {
  setToken(data.token || "");
  saveJson(USER_KEY, data.user || null);
  saveLicense(data.license || null);
  setCloudAuthObject({ user: data.user || null, license: data.license || null });
}

async function checkExistingSession() {
  if (localAuthEnabled) return applyLocalDevSession();
  if (!token()) return false;
  try {
    const license = await cloudFetch("/api/license/check");
    if (!license || license.accountStatus !== "active") throw new Error("account_not_active");
    saveLicense(license);
    setCloudAuthObject({ user: license.user || readJson(USER_KEY), license });
    startRealtime();
    return true;
  } catch (error) {
    const code = String(error?.message || "");
    if (isHardAuthError(code)) {
      clearSession();
      return false;
    }
    const cachedLicense = cachedLicenseWithinGrace();
    if (cachedLicense) {
      setCloudAuthObject({ user: cachedLicense.user || readJson(USER_KEY), license: cachedLicense });
      return true;
    }
    return false;
  }
}

function canUseFeature(featureKey) {
  if (localAuthEnabled) return true;
  const license = readJson(LICENSE_KEY, {});
  return Boolean(license?.features?.[featureKey]);
}

function consumeCachedFeature(featureKey, amount = 1) {
  const count = amount === undefined || amount === null || amount === "" ? 1 : Number(amount);
  if (!Number.isInteger(count) || count <= 0) throw new Error("invalid_amount");
  const license = window.NewPulseCloudAuth?.license || readJson(LICENSE_KEY, {});
  if (!license?.offline) return null;
  if (!license?.features?.[featureKey]) throw new Error("feature_not_allowed");
  const key = `${String(featureKey || "").replace(/_daily$/, "")}_daily`;
  const quota = license?.quotas?.[key];
  if (!quota) return { ok: true, feature: featureKey, amount: count, offline: true, quota: { feature: featureKey, unlimited: true }, license };
  const limit = Number(quota.limit);
  const used = Number(quota.used || 0);
  if (Number.isFinite(limit) && used + count > limit) {
    const error = new Error("quota_exceeded");
    error.quota = {
      ...quota,
      used,
      remaining: Math.max(0, limit - used),
    };
    throw error;
  }
  const nextLicense = {
    ...license,
    quotas: {
      ...license.quotas,
      [key]: {
        ...quota,
        used: used + count,
        remaining: Number.isFinite(limit) ? Math.max(0, limit - used - count) : quota.remaining,
      },
    },
  };
  saveJson(LICENSE_KEY, nextLicense);
  if (window.NewPulseCloudAuth) window.NewPulseCloudAuth.license = nextLicense;
  try { window.dispatchEvent(new CustomEvent("newpulse:cloud-license-updated")); } catch {}
  return { ok: true, feature: featureKey, amount: count, offline: true, quota: nextLicense.quotas[key], license: nextLicense };
}

async function consumeFeature(featureKey, amount = 1) {
  if (localAuthEnabled) return { ok: true, feature: featureKey, amount, localAuth: true };
  try {
    const result = await cloudFetch("/api/license/consume", {
      method: "POST",
      body: JSON.stringify({ feature: featureKey, amount }),
    });
    if (result.license) {
      saveLicense(result.license);
      if (window.NewPulseCloudAuth) window.NewPulseCloudAuth.license = result.license;
      try { window.dispatchEvent(new CustomEvent("newpulse:cloud-license-updated")); } catch {}
    }
    return result;
  } catch (error) {
    if (/Failed to fetch|NetworkError|network/i.test(String(error?.message || ""))) {
      const cachedResult = consumeCachedFeature(featureKey, amount);
      if (cachedResult) return cachedResult;
    }
    if (isHardAuthError(error?.message)) {
      clearSession();
      renderGate(document.body, "账号授权已失效，请重新登录。");
    }
    throw error;
  }
}

function startRealtime() {
  const value = token();
  if (!value) return;
  const base = cloudApi().replace(/^http/i, "ws");
  let ws;
  try {
    ws = new WebSocket(`${base}/realtime?token=${encodeURIComponent(value)}`);
  } catch {
    return;
  }
  ws.addEventListener("message", (event) => {
    let data = null;
    try { data = JSON.parse(event.data); } catch {}
    if (!data?.event) return;
    if (["force_logout", "account_disabled", "device_unbound"].includes(data.event)) {
      clearSession();
      renderGate(document.body, "账号已被管理员下线或禁用，请重新登录。");
    }
    if (["subscription_changed", "permission_changed"].includes(data.event)) {
      cloudFetch("/api/license/check").then((license) => {
        saveLicense(license);
        if (window.NewPulseCloudAuth) window.NewPulseCloudAuth.license = license;
        try { window.dispatchEvent(new CustomEvent("newpulse:cloud-license-updated")); } catch {}
      }).catch(() => {});
    }
  });
}

export async function ensureCloudAuthorized(root = document.body) {
  await loadBakedCloudConfig();
  if (await checkExistingSession()) return true;
  renderGate(root);
  return new Promise(() => {});
}
