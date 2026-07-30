const STORAGE_KEY = "pulse_personal_data_profile_v1";

const DEFAULT_PROFILE = {
  version: 1,
  permissions: {
    chatSignals: true,
    lifeCare: true,
    businessSignals: true,
  },
  quiet: {
    enabled: false,
    start: "23:00",
    end: "08:00",
  },
};

function cloneDefaultProfile() {
  return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
}

function normalizeBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeTime(value, fallback) {
  const text = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

function mergeProfile(value) {
  const base = cloneDefaultProfile();
  const input = value && typeof value === "object" ? value : {};
  const permissions = input.permissions && typeof input.permissions === "object" ? input.permissions : {};
  const quiet = input.quiet && typeof input.quiet === "object" ? input.quiet : {};
  return {
    version: 1,
    permissions: {
      chatSignals: normalizeBool(permissions.chatSignals, base.permissions.chatSignals),
      lifeCare: normalizeBool(permissions.lifeCare, base.permissions.lifeCare),
      businessSignals: normalizeBool(permissions.businessSignals, base.permissions.businessSignals),
    },
    quiet: {
      enabled: normalizeBool(quiet.enabled, base.quiet.enabled),
      start: normalizeTime(quiet.start, base.quiet.start),
      end: normalizeTime(quiet.end, base.quiet.end),
    },
  };
}

function mergePatch(base, patch) {
  const next = mergeProfile(base);
  if (patch?.permissions && typeof patch.permissions === "object") {
    next.permissions = {
      ...next.permissions,
      ...patch.permissions,
    };
  }
  if (patch?.quiet && typeof patch.quiet === "object") {
    next.quiet = {
      ...next.quiet,
      ...patch.quiet,
    };
  }
  return mergeProfile(next);
}

function minutesFromTime(value) {
  const [h, m] = normalizeTime(value, "00:00").split(":").map(Number);
  return h * 60 + m;
}

export function loadPersonalDataProfile() {
  try {
    return mergeProfile(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return cloneDefaultProfile();
  }
}

export function savePersonalDataProfile(patch) {
  const profile = mergePatch(loadPersonalDataProfile(), patch);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {}
  return profile;
}

export function canUseChatSignals(profile = loadPersonalDataProfile()) {
  return profile?.permissions?.chatSignals !== false;
}

export function canUseLifeCare(profile = loadPersonalDataProfile()) {
  return profile?.permissions?.lifeCare !== false;
}

export function canUseBusinessSignals(profile = loadPersonalDataProfile()) {
  return profile?.permissions?.businessSignals !== false;
}

export function isQuietNow(profile = loadPersonalDataProfile(), now = new Date()) {
  if (profile?.quiet?.enabled !== true) return false;
  const start = minutesFromTime(profile.quiet.start);
  const end = minutesFromTime(profile.quiet.end);
  if (start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function quietEndsAt(profile = loadPersonalDataProfile(), now = new Date()) {
  if (!isQuietNow(profile, now)) return null;
  const end = minutesFromTime(profile.quiet.end);
  const current = now.getHours() * 60 + now.getMinutes();
  const today = new Date(now);
  today.setSeconds(0, 0);
  today.setHours(Math.floor(end / 60), end % 60, 0, 0);
  if (today.getTime() <= now.getTime() || current >= minutesFromTime(profile.quiet.start)) {
    today.setDate(today.getDate() + 1);
  }
  return today.getTime();
}
