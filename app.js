const STORAGE_KEY = "rizhi.diary.entries.v1";
const STORAGE_BACKUP_KEY = "rizhi.diary.entries.backup.v1";
const STORAGE_SNAPSHOT_KEY = "rizhi.diary.snapshots.v1";
const STORAGE_SNAPSHOT_LIMIT = 12;
const DUPLICATE_IGNORE_KEY = "rizhi.duplicates.ignored.v1";
const LIFE_REPORT_KEY = "rizhi.life.report.v1";
const LIFE_QA_KEY = "rizhi.life.questions.v1";
const IMPORTED_SOURCE_IDS_KEY = "rizhi.imported.sourceIds.v1";
const EDITOR_DRAFT_KEY = "rizhi.editor.draft.v1";
const QQ_IMPORT_URL = "./data/qq-notepad-import.json";
const AUTH_KEY = "rizhi.auth.v1";
const AUTH_SESSION_KEY = "rizhi.auth.unlocked.v1";
const AUTH_RECOVERY_VERIFIED_KEY = "rizhi.auth.recoveryVerified.v1";
const AUTH_ITERATIONS = 180000;
const RECOVERY_QUESTION_COUNT = 3;
const AUTO_LOCK_MS = 5 * 60 * 1000;
const SHARED_STORAGE_API = "./api/storage";
const SERVER_AUTH_VERIFY_API = "./api/auth/verify";
const CLOUD_SYNC_API_KEY = "rizhi.cloudSync.api.v1";
const CLOUD_SYNC_TOKEN_KEY = "rizhi.cloudSync.token.v1";
const CLOUD_SYNC_ENCRYPTION_KEY = "rizhi.cloudSync.encryptionKey.v1";
const SHARED_STORAGE_KEYS = [
  STORAGE_KEY,
  STORAGE_BACKUP_KEY,
  STORAGE_SNAPSHOT_KEY,
  DUPLICATE_IGNORE_KEY,
  LIFE_REPORT_KEY,
  LIFE_QA_KEY,
  IMPORTED_SOURCE_IDS_KEY,
  AUTH_KEY
];
const CLOUD_SYNC_STORAGE_KEYS = [
  STORAGE_KEY,
  DUPLICATE_IGNORE_KEY,
  LIFE_REPORT_KEY,
  LIFE_QA_KEY,
  IMPORTED_SOURCE_IDS_KEY,
  AUTH_KEY
];

const THEME_MAP = {
  工作: ["工作", "项目", "会议", "加班", "同事", "领导", "汇报", "任务", "单位"],
  家庭: ["家", "父亲", "母亲", "爸", "妈", "孩子", "亲人", "家庭", "春节"],
  健康: ["身体", "睡眠", "失眠", "医院", "医生", "疲惫", "生病", "运动", "健康"],
  学习: ["学习", "读书", "考试", "课程", "笔记", "研究", "写作", "训练"],
  关系: ["朋友", "同学", "见面", "聊天", "关系", "感情", "喜欢", "争执"],
  旅行: ["旅行", "火车", "飞机", "酒店", "城市", "路上", "风景", "出差"],
  理想: ["理想", "目标", "未来", "愿望", "选择", "人生", "方向", "坚持"],
  情绪: ["难过", "焦虑", "开心", "平静", "愤怒", "委屈", "孤独", "期待"]
};

const MOODS = ["平静", "开心", "低落", "焦虑", "疲惫", "愤怒", "期待", "感激", "复杂"];
const PRIVACY_LEVELS = ["普通", "私密", "极私密"];
const SOURCE_TYPES = ["手动记录", "纸质日记照片", "截图导入", "图片日记", "语音整理", "QQ邮箱记事本"];
const STATUS_TYPES = ["正式", "待校对"];
const QQ_SYNC_STATUSES = {
  pending: { label: "待同步", tone: "amber" },
  synced: { label: "已同步", tone: "" },
  failed: { label: "同步失败", tone: "rose" },
  skipped: { label: "暂不同步", tone: "plum" }
};
const QQ_SYNC_FILTERS = [
  ["pending", "待同步"],
  ["failed", "同步失败"],
  ["synced", "已同步"],
  ["skipped", "暂不同步"],
  ["all", "全部状态"]
];
const RECOVERY_QUESTIONS = [
  "你的小学名字叫什么？",
  "你的大学舍友对面床是谁？",
  "你的高一同桌是谁？",
  "我最难忘的一位朋友叫什么？",
  "我第一部手机的品牌或型号是什么？",
  "我最喜欢的一本书或电影是什么？",
  "我常用的一个私人纪念日是什么？",
  "我给自己的一个重要目标是什么？"
];

const state = {
  view: "library",
  selectedId: null,
  editingId: null,
  query: "",
  filters: {
    year: "all",
    mood: "all",
    tag: "all",
    status: "all",
    privacy: "all",
    sort: "desc"
  },
  reviewFilters: {
    source: "all",
    issue: "all"
  },
  entryDraft: {},
  pendingAttachments: [],
  importDraft: {},
  importAttachments: [],
  importNotice: null,
  libraryNotice: null,
  qqSyncFilter: "pending",
  qqSyncNotice: null,
  entries: [],
  authMode: "unlock",
  authError: "",
  preAuthRepairNotice: null,
  securityNotice: null,
  cloudSyncNotice: null,
  lifeReportNotice: null,
  editorNotice: null,
  lifeQuestion: "",
  lifeAnswer: null
};

const app = document.querySelector("#app");
const appShell = document.querySelector(".app-shell");
const lockScreen = document.querySelector("#lock-screen");
const searchInput = document.querySelector("#global-search");
let autoLockTimer = null;
let lastActivityAt = Date.now();
let sharedStorageReady = false;
let sharedStorageLastError = "";
let sharedStorageWriteQueue = Promise.resolve();
let sharedStorageLastSignature = "";

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPublicStaticDeployment() {
  return /(^|\.)github\.io$/i.test(window.location.hostname);
}

function normalizeSyncApi(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getCloudSyncConfig() {
  const api = normalizeSyncApi(localStorage.getItem(CLOUD_SYNC_API_KEY));
  const token = String(localStorage.getItem(CLOUD_SYNC_TOKEN_KEY) || "").trim();
  const encryptionKey = String(localStorage.getItem(CLOUD_SYNC_ENCRYPTION_KEY) || "").trim();
  return { api, token, encryptionKey, enabled: Boolean(api && token), encrypted: Boolean(api && token && encryptionKey) };
}

function saveCloudSyncConfig(api, token, encryptionKey = "") {
  localStorage.setItem(CLOUD_SYNC_API_KEY, normalizeSyncApi(api));
  localStorage.setItem(CLOUD_SYNC_TOKEN_KEY, String(token || "").trim());
  if (encryptionKey) localStorage.setItem(CLOUD_SYNC_ENCRYPTION_KEY, String(encryptionKey).trim());
}

function clearCloudSyncConfig() {
  localStorage.removeItem(CLOUD_SYNC_API_KEY);
  localStorage.removeItem(CLOUD_SYNC_TOKEN_KEY);
  localStorage.removeItem(CLOUD_SYNC_ENCRYPTION_KEY);
}

function applyCloudSyncConfigFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const api = params.get("syncApi") || hashParams.get("syncApi");
  const token = params.get("syncToken") || hashParams.get("syncToken");
  const encryptionKey = params.get("syncKey") || hashParams.get("syncKey");
  if (!api && !token && !encryptionKey) return;

  const current = getCloudSyncConfig();
  saveCloudSyncConfig(api || current.api, token || current.token, encryptionKey || current.encryptionKey);

  params.delete("syncApi");
  params.delete("syncToken");
  params.delete("syncKey");
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
  window.history.replaceState({}, "", nextUrl);
}

function sharedStorageUrl() {
  const config = getCloudSyncConfig();
  return config.enabled ? `${config.api}/api/storage` : SHARED_STORAGE_API;
}

function sharedStorageHeaders(extra = {}) {
  const config = getCloudSyncConfig();
  return {
    Accept: "application/json",
    ...(config.enabled ? { Authorization: `Bearer ${config.token}` } : {}),
    ...extra
  };
}

function parseJsonSafe(raw, fallback = null) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function generateCloudEncryptionKey() {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  return bytesToBase64(key);
}

async function importCloudEncryptionKey() {
  const { encryptionKey } = getCloudSyncConfig();
  if (!encryptionKey) throw new Error("Missing cloud encryption key");
  return crypto.subtle.importKey("raw", base64ToBytes(encryptionKey), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptCloudStorageKeys(keys, reason = "云同步") {
  if (!hasPasswordCrypto()) throw new Error("Cloud encryption unavailable");
  const key = await importCloudEncryptionKey();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = JSON.stringify({
    version: 1,
    reason,
    createdAt: new Date().toISOString(),
    keys
  });
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return {
    version: 1,
    algorithm: "AES-GCM",
    keyFormat: "raw-256",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function decryptCloudStoragePayload(payload) {
  if (!payload?.iv || !payload?.ciphertext) throw new Error("Invalid encrypted payload");
  const key = await importCloudEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.ciphertext)
  );
  const data = JSON.parse(new TextDecoder().decode(decrypted));
  return data?.keys && typeof data.keys === "object" ? data.keys : {};
}

function sharedStorageKeyList() {
  return getCloudSyncConfig().enabled ? CLOUD_SYNC_STORAGE_KEYS : SHARED_STORAGE_KEYS;
}

function collectSharedStorageKeys(keys = sharedStorageKeyList()) {
  return keys.reduce((payload, key) => {
    const value = localStorage.getItem(key);
    if (value !== null) payload[key] = value;
    return payload;
  }, {});
}

function entryTimeValue(entry) {
  const value = entry?.updatedAt || entry?.deletedAt || entry?.createdAt || entry?.entryDate || "";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeMergedEntry(entry) {
  return {
    ...entry,
    analysis: entry.analysis || analyzeEntry(entry)
  };
}

function mergeEntryStorage(localRaw, remoteRaw) {
  const localEntries = parseJsonSafe(localRaw, []);
  const remoteEntries = parseJsonSafe(remoteRaw, []);
  const items = [...(Array.isArray(remoteEntries) ? remoteEntries : []), ...(Array.isArray(localEntries) ? localEntries : [])];
  const byKey = new Map();

  items.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const id = entry.id || uid();
    const normalized = normalizeMergedEntry({ ...entry, id });
    const key = entryDedupeKey(normalized);
    byKey.set(key, choosePreferredEntry(byKey.get(key), normalized));
  });

  const merged = [...byKey.values()].sort((a, b) => {
    const dateCompare = String(b.entryDate || "").localeCompare(String(a.entryDate || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
  return merged.length ? JSON.stringify(merged) : "";
}

function mergeJsonObjectByUpdatedAt(localRaw, remoteRaw) {
  if (!localRaw) return remoteRaw || "";
  if (!remoteRaw) return localRaw || "";
  const local = parseJsonSafe(localRaw, null);
  const remote = parseJsonSafe(remoteRaw, null);
  if (!local || !remote) return localRaw || remoteRaw || "";
  const localTime = Date.parse(local.updatedAt || local.savedAt || local.createdAt || "");
  const remoteTime = Date.parse(remote.updatedAt || remote.savedAt || remote.createdAt || "");
  if (Number.isNaN(localTime) && Number.isNaN(remoteTime)) return localRaw;
  return (localTime || 0) >= (remoteTime || 0) ? localRaw : remoteRaw;
}

function isValidAuthRaw(raw) {
  const config = parseJsonSafe(raw, null);
  return Boolean(config?.salt && config?.passwordHash);
}

function mergeAuthStorage(localRaw, remoteRaw) {
  const localValid = isValidAuthRaw(localRaw);
  const remoteValid = isValidAuthRaw(remoteRaw);
  if (remoteValid && !localValid) return remoteRaw;
  if (localValid && !remoteValid) return localRaw;
  if (!localValid && !remoteValid) return "";
  return mergeJsonObjectByUpdatedAt(localRaw, remoteRaw);
}

function entryDedupeKey(entry) {
  const importMeta = entry.importMeta || {};
  const source = importMeta.source || entry.sourceType || "";
  const sourceId = importMeta.sourceId || importMeta.id || "";
  const contentHash = importMeta.contentHash || entry.contentHash || "";

  if (sourceId) return `source:${source}:${sourceId}`;
  if (contentHash) return `hash:${contentHash}`;

  const date = String(entry.entryDate || "");
  const title = normalizeDuplicateText(entry.title);
  const content = normalizeDuplicateText(entry.content);
  const isQQ = source === "QQ邮箱记事本" || entry.sourceType === "QQ邮箱记事本";
  if (isQQ && date && title) return `qq:${date}:${title}:${content.slice(0, 120)}`;
  if (date && title && content.length >= 20) return `text:${date}:${title}:${content.slice(0, 140)}`;
  return `id:${entry.id || uid()}`;
}

function entryRichness(entry) {
  return (
    String(entry.content || "").length +
    (entry.attachments || []).length * 80 +
    (entry.analysis ? 20 : 0) +
    (entry.deletedAt ? 0 : 10)
  );
}

function choosePreferredEntry(existing, incoming) {
  if (!existing) return incoming;
  const existingTime = entryTimeValue(existing);
  const incomingTime = entryTimeValue(incoming);
  if (incomingTime !== existingTime) return incomingTime > existingTime ? incoming : existing;
  return entryRichness(incoming) >= entryRichness(existing) ? incoming : existing;
}

function mergeJsonArraySet(localRaw, remoteRaw, limit = 500) {
  const local = parseJsonSafe(localRaw, []);
  const remote = parseJsonSafe(remoteRaw, []);
  const values = [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])];
  return values.length ? JSON.stringify([...new Set(values)].slice(-limit)) : "";
}

function mergeSnapshotStorage(localRaw, remoteRaw) {
  const local = parseJsonSafe(localRaw, []);
  const remote = parseJsonSafe(remoteRaw, []);
  const values = [...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])];
  const byKey = new Map();

  values.forEach((snapshot) => {
    if (!snapshot || typeof snapshot !== "object") return;
    const key = snapshot.fingerprint || snapshot.id || uid();
    const existing = byKey.get(key);
    const currentTime = Date.parse(snapshot.createdAt || "");
    const existingTime = Date.parse(existing?.createdAt || "");
    if (!existing || (currentTime || 0) >= (existingTime || 0)) byKey.set(key, snapshot);
  });

  const merged = [...byKey.values()]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, STORAGE_SNAPSHOT_LIMIT);
  return merged.length ? JSON.stringify(merged) : "";
}

function mergeQuestionHistory(localRaw, remoteRaw) {
  const local = parseJsonSafe(localRaw, []);
  const remote = parseJsonSafe(remoteRaw, []);
  const values = [...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])];
  const byKey = new Map();

  values.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const key = item.id || `${item.question || ""}::${item.createdAt || item.updatedAt || ""}`;
    if (!byKey.has(key)) byKey.set(key, item);
  });

  const merged = [...byKey.values()]
    .sort((a, b) => String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || "")))
    .slice(0, 12);
  return merged.length ? JSON.stringify(merged) : "";
}

function mergeSharedStorage(localKeys = {}, remoteKeys = {}) {
  const merged = {};
  const entryRaw = mergeEntryStorage(
    localKeys[STORAGE_KEY] || localKeys[STORAGE_BACKUP_KEY],
    remoteKeys[STORAGE_KEY] || remoteKeys[STORAGE_BACKUP_KEY]
  );

  if (entryRaw) {
    merged[STORAGE_KEY] = entryRaw;
    merged[STORAGE_BACKUP_KEY] = entryRaw;
  }

  const snapshots = mergeSnapshotStorage(localKeys[STORAGE_SNAPSHOT_KEY], remoteKeys[STORAGE_SNAPSHOT_KEY]);
  if (snapshots) merged[STORAGE_SNAPSHOT_KEY] = snapshots;

  const ignored = mergeJsonArraySet(localKeys[DUPLICATE_IGNORE_KEY], remoteKeys[DUPLICATE_IGNORE_KEY]);
  if (ignored) merged[DUPLICATE_IGNORE_KEY] = ignored;

  const importedIds = mergeJsonArraySet(localKeys[IMPORTED_SOURCE_IDS_KEY], remoteKeys[IMPORTED_SOURCE_IDS_KEY], 5000);
  if (importedIds) merged[IMPORTED_SOURCE_IDS_KEY] = importedIds;

  const lifeReport = mergeJsonObjectByUpdatedAt(localKeys[LIFE_REPORT_KEY], remoteKeys[LIFE_REPORT_KEY]);
  if (lifeReport) merged[LIFE_REPORT_KEY] = lifeReport;

  const questions = mergeQuestionHistory(localKeys[LIFE_QA_KEY], remoteKeys[LIFE_QA_KEY]);
  if (questions) merged[LIFE_QA_KEY] = questions;

  const auth = mergeAuthStorage(localKeys[AUTH_KEY], remoteKeys[AUTH_KEY]);
  if (auth) merged[AUTH_KEY] = auth;

  return merged;
}

function applySharedStorageKeys(keys = {}) {
  SHARED_STORAGE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(keys, key)) {
      localStorage.setItem(key, keys[key]);
    }
  });
}

function storageSignature(keys = collectSharedStorageKeys(), signatureKeys = sharedStorageKeyList()) {
  return signatureKeys.map((key) => `${key}:${keys[key] || ""}`).join("\n");
}

async function readSharedStorage() {
  const response = await fetch(`${sharedStorageUrl()}?t=${Date.now()}`, {
    cache: "no-store",
    headers: sharedStorageHeaders()
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data?.encrypted) return decryptCloudStoragePayload(data.payload);
  return data?.keys && typeof data.keys === "object" ? data.keys : {};
}

async function writeSharedStorage(reason = "数据同步") {
  if (!sharedStorageReady || typeof fetch !== "function") return false;
  const keys = collectSharedStorageKeys();
  const signature = storageSignature(keys);
  if (signature === sharedStorageLastSignature) return true;
  sharedStorageLastSignature = signature;

  const config = getCloudSyncConfig();
  const body = config.enabled
    ? { reason, encrypted: true, payload: await encryptCloudStorageKeys(keys, reason) }
    : { reason, keys };
  const response = await fetch(sharedStorageUrl(), {
    method: "POST",
    headers: sharedStorageHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return true;
}

function queueSharedStorageWrite(reason = "数据同步") {
  if (!sharedStorageReady || typeof fetch !== "function") return;
  sharedStorageWriteQueue = sharedStorageWriteQueue
    .catch(() => {})
    .then(() => writeSharedStorage(reason))
    .catch(() => {
      sharedStorageReady = false;
    });
}

async function initializeSharedStorage() {
  if (typeof fetch !== "function") return false;
  applyCloudSyncConfigFromUrl();
  if (isPublicStaticDeployment() && !getCloudSyncConfig().enabled) return false;
  try {
    const remoteKeys = await readSharedStorage();
    sharedStorageReady = true;
    sharedStorageLastError = "";
    const localKeys = collectSharedStorageKeys(SHARED_STORAGE_KEYS);
    const merged = mergeSharedStorage(localKeys, remoteKeys);
    applySharedStorageKeys(merged);
    sharedStorageLastSignature = storageSignature(remoteKeys);
    await writeSharedStorage("启动同步");
    return true;
  } catch (error) {
    sharedStorageReady = false;
    sharedStorageLastError = String(error?.message || error || "sync_failed");
    return false;
  }
}

function todayStr() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function dateLabel(value) {
  if (!value) return "未标日期";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function monthDay(value) {
  if (!value || value.length < 10) return "";
  return value.slice(5);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function splitList(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value) {
  return Array.isArray(value) ? value.join("，") : "";
}

function truncate(value, length = 110) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function icon(name) {
  const template = document.querySelector("#icon-template");
  const node = template?.content?.querySelector(`svg[data-name="${name}"]`);
  return node ? node.outerHTML : "";
}

function hydrateStaticIcons() {
  document.querySelectorAll(".icon[data-icon]").forEach((item) => {
    item.innerHTML = icon(item.dataset.icon);
  });
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function hasPasswordCrypto() {
  return Boolean(window.crypto?.subtle && window.crypto?.getRandomValues);
}

function getAuthConfig() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    const config = raw ? JSON.parse(raw) : null;
    if (!config?.salt || !config?.passwordHash) return null;
    return config;
  } catch {
    return null;
  }
}

function setSessionUnlocked(value) {
  if (value) {
    sessionStorage.setItem(AUTH_SESSION_KEY, "1");
    return;
  }
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

function isSessionUnlocked() {
  return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
}

function stopAutoLockTimer() {
  if (!autoLockTimer) return;
  clearTimeout(autoLockTimer);
  autoLockTimer = null;
}

function handleAutoLockTimeout() {
  if (!isSessionUnlocked() || appShell.classList.contains("hidden")) {
    stopAutoLockTimer();
    return;
  }
  const inactiveFor = Date.now() - lastActivityAt;
  if (inactiveFor >= AUTO_LOCK_MS) {
    lockApp();
    return;
  }
  autoLockTimer = window.setTimeout(handleAutoLockTimeout, AUTO_LOCK_MS - inactiveFor);
}

function scheduleAutoLock() {
  stopAutoLockTimer();
  if (!isSessionUnlocked() || appShell.classList.contains("hidden")) return;
  autoLockTimer = window.setTimeout(handleAutoLockTimeout, AUTO_LOCK_MS);
}

function noteUserActivity() {
  if (!isSessionUnlocked() || appShell.classList.contains("hidden")) return;
  const now = Date.now();
  if (autoLockTimer && now - lastActivityAt < 1000) return;
  lastActivityAt = now;
  scheduleAutoLock();
}

function startAutoLockTimer() {
  lastActivityAt = Date.now();
  scheduleAutoLock();
}

function setRecoveryVerified(value) {
  if (value) {
    sessionStorage.setItem(AUTH_RECOVERY_VERIFIED_KEY, "1");
    return;
  }
  sessionStorage.removeItem(AUTH_RECOVERY_VERIFIED_KEY);
}

function isRecoveryVerified() {
  return sessionStorage.getItem(AUTH_RECOVERY_VERIFIED_KEY) === "1";
}

async function derivePasswordHash(password, saltBase64, iterations = AUTH_ITERATIONS) {
  if (!hasPasswordCrypto()) throw new Error("Password crypto is unavailable");
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(saltBase64),
      iterations
    },
    keyMaterial,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

function secureCompare(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function normalizeRecoveryAnswer(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hasRecoveryConfig(config = getAuthConfig()) {
  const questions = config?.recovery?.questions;
  return (
    Array.isArray(questions) &&
    questions.length >= RECOVERY_QUESTION_COUNT &&
    questions.slice(0, RECOVERY_QUESTION_COUNT).every((item) => item.question && item.salt && item.answerHash)
  );
}

function recoveryQuestionOptions() {
  return RECOVERY_QUESTIONS.map(
    (question) => `<option value="${escapeHtml(question)}"></option>`
  ).join("");
}

function preferredRecoveryQuestions() {
  return RECOVERY_QUESTIONS.slice(0, RECOVERY_QUESTION_COUNT).map((question) => ({ question }));
}

function renderRecoveryFields(prefix = "recovery", savedQuestions = []) {
  return `
    <div class="recovery-fields">
      ${Array.from({ length: RECOVERY_QUESTION_COUNT })
        .map((_, index) => {
          const number = index + 1;
          const saved = savedQuestions[index]?.question || RECOVERY_QUESTIONS[index];
          return `
            <div class="recovery-row">
              <div class="field">
                <label for="${prefix}-question-${number}">找回问题 ${number}</label>
                <input id="${prefix}-question-${number}" name="${prefix}Question${number}" list="${prefix}-question-options-${number}" value="${escapeHtml(saved)}" autocomplete="off" />
                <datalist id="${prefix}-question-options-${number}">
                  ${recoveryQuestionOptions()}
                </datalist>
              </div>
              <div class="field">
                <label for="${prefix}-answer-${number}">答案</label>
                <input id="${prefix}-answer-${number}" name="${prefix}Answer${number}" autocomplete="off" />
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function collectRecoveryItems(data, prefix = "recovery") {
  return Array.from({ length: RECOVERY_QUESTION_COUNT }).map((_, index) => {
    const number = index + 1;
    return {
      question: String(data[`${prefix}Question${number}`] || "").trim(),
      answer: normalizeRecoveryAnswer(data[`${prefix}Answer${number}`])
    };
  });
}

function validateRecoveryItems(items) {
  if (items.some((item) => !item.question || item.answer.length < 2)) {
    return "请完整设置 3 个找回问题，答案至少 2 个字符。";
  }
  if (new Set(items.map((item) => item.question)).size !== items.length) {
    return "3 个找回问题不能重复。";
  }
  return "";
}

async function buildRecoveryConfig(items) {
  const questions = [];
  for (const item of items) {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const saltBase64 = bytesToBase64(salt);
    questions.push({
      question: item.question,
      salt: saltBase64,
      answerHash: await derivePasswordHash(item.answer, saltBase64)
    });
  }
  return {
    version: 1,
    questionCount: RECOVERY_QUESTION_COUNT,
    questions,
    updatedAt: new Date().toISOString()
  };
}

async function savePasswordConfig(password, recoveryItems = null) {
  if (!hasPasswordCrypto()) throw new Error("Password crypto is unavailable");
  const existing = getAuthConfig();
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltBase64 = bytesToBase64(salt);
  const passwordHash = await derivePasswordHash(password, saltBase64);
  const recovery = recoveryItems ? await buildRecoveryConfig(recoveryItems) : existing?.recovery || null;
  localStorage.setItem(
    AUTH_KEY,
    JSON.stringify({
      version: 1,
      algorithm: "PBKDF2-SHA256",
      iterations: AUTH_ITERATIONS,
      salt: saltBase64,
      passwordHash,
      recovery,
      updatedAt: new Date().toISOString()
    })
  );
  await writeSharedStorage("密码更新").catch(() => {});
}

async function saveRecoveryConfig(recoveryItems) {
  const existing = getAuthConfig();
  if (!existing) return false;
  localStorage.setItem(
    AUTH_KEY,
    JSON.stringify({
      ...existing,
      recovery: await buildRecoveryConfig(recoveryItems),
      updatedAt: new Date().toISOString()
    })
  );
  await writeSharedStorage("找回问题更新").catch(() => {});
  return true;
}

async function verifyPassword(password) {
  const config = getAuthConfig();
  if (!config) return false;
  if (!hasPasswordCrypto()) return verifyPasswordOnServer(password);
  const passwordHash = await derivePasswordHash(password, config.salt, config.iterations || AUTH_ITERATIONS);
  return secureCompare(passwordHash, config.passwordHash);
}

async function verifyPasswordOnServer(password) {
  if (typeof fetch !== "function") throw new Error("Server auth unavailable");
  const response = await fetch(SERVER_AUTH_VERIFY_API, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ password })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return Boolean(data?.matched);
}

async function verifyRecoveryAnswers(answers) {
  const config = getAuthConfig();
  if (!hasRecoveryConfig(config)) return false;
  const questions = config.recovery.questions.slice(0, RECOVERY_QUESTION_COUNT);
  const checks = await Promise.all(
    questions.map(async (item, index) => {
      const normalizedAnswer = normalizeRecoveryAnswer(answers[index]);
      const answerHash = await derivePasswordHash(normalizedAnswer, item.salt, config.iterations || AUTH_ITERATIONS);
      return secureCompare(answerHash, item.answerHash);
    })
  );
  return checks.every(Boolean);
}

function validateNewPassword(password, confirmPassword) {
  if (password.length < 6) return "密码至少需要 6 位。";
  if (password !== confirmPassword) return "两次输入的密码不一致。";
  return "";
}

function renderLockScreen(mode = "unlock", message = "", messageType = "error") {
  stopAutoLockTimer();
  state.authMode = mode;
  state.authError = message;
  setRecoveryVerified(false);
  document.body.dataset.view = "locked";
  appShell.classList.add("hidden");
  lockScreen.classList.remove("hidden");

  const isSetup = mode === "setup";
  if (!isSetup) {
    const placeholder = message || "密码";
    lockScreen.innerHTML = `
      <div class="lock-card lock-card-minimal">
        <form id="password-unlock-form" class="lock-form lock-form-minimal">
          <div class="unlock-row">
            <input
              id="lock-password"
              class="${message ? "lock-input-error" : ""}"
              name="password"
              type="password"
              autocomplete="current-password"
              aria-label="密码"
              placeholder="${escapeHtml(placeholder)}"
            />
            <button class="primary-button" type="submit">回车</button>
          </div>
          <button class="text-link lock-link" data-action="forgot-password" type="button">忘记密码？</button>
        </form>
      </div>
    `;
    requestAnimationFrame(() => lockScreen.querySelector("input")?.focus());
    return;
  }

  const repairNotice = state.preAuthRepairNotice
    ? `<div class="form-message ${state.preAuthRepairNotice.type === "error" ? "error" : "success"}">${escapeHtml(state.preAuthRepairNotice.text)}</div>`
    : "";
  lockScreen.innerHTML = `
    <div class="lock-card">
      <div class="lock-brand-row">
        <div class="lock-mark" aria-hidden="true">
          <span class="icon" data-icon="lock"></span>
        </div>
        <div>
          <span class="eyebrow">日记档案馆</span>
          <strong>个人日记管理与人生复盘系统</strong>
        </div>
      </div>
      <h1>${isSetup ? "建立你的私人日记档案馆" : "日记档案馆已上锁"}</h1>
      <p>${isSetup ? "为日记、旧照片、QQ 记事本和人生复盘资料设置进入密码。" : "这是用于记录、导入、整理、备份和复盘个人日记的专属系统。"}</p>
      <div class="lock-feature-row" aria-label="系统能力">
        <span>日常记录</span>
        <span>历史导入</span>
        <span>人生复盘</span>
        <span>安全备份</span>
      </div>
      ${repairNotice}
      <form id="${isSetup ? "password-setup-form" : "password-unlock-form"}" class="lock-form">
        <div class="field">
          <label for="lock-password">${isSetup ? "设置密码" : "密码"}</label>
          <input id="lock-password" name="password" type="password" autocomplete="${isSetup ? "new-password" : "current-password"}" />
        </div>
        ${
          isSetup
            ? `<div class="field">
                <label for="lock-password-confirm">确认密码</label>
                <input id="lock-password-confirm" name="confirmPassword" type="password" autocomplete="new-password" />
              </div>`
            : ""
        }
        ${isSetup ? `<div class="form-message">找回问题用于忘记密码时验证身份，答案不会明文保存。</div>${renderRecoveryFields("setupRecovery")}` : ""}
        ${message ? `<div class="form-message ${messageType === "success" ? "success" : "error"}">${escapeHtml(message)}</div>` : ""}
        <button class="primary-button full-width" type="submit">
          <span class="icon" data-icon="${isSetup ? "check" : "lock"}"></span>
          <span>${isSetup ? "开启日记馆" : "解锁"}</span>
        </button>
        ${
          !isSetup
            ? `<button class="text-link lock-link" data-action="forgot-password" type="button">忘记密码？</button>`
            : ""
        }
      </form>
    </div>
  `;
  hydrateStaticIcons();
  requestAnimationFrame(() => lockScreen.querySelector("input")?.focus());
}

function renderLockLoadingScreen(message = "请稍候") {
  stopAutoLockTimer();
  state.authMode = "loading";
  setRecoveryVerified(false);
  document.body.dataset.view = "locked";
  appShell.classList.add("hidden");
  lockScreen.classList.remove("hidden");
  lockScreen.innerHTML = `
    <div class="lock-card lock-card-minimal">
      <form class="lock-form lock-form-minimal" aria-busy="true">
        <div class="unlock-row">
          <input
            id="lock-password"
            name="password"
            type="password"
            autocomplete="current-password"
            aria-label="密码"
            placeholder="${escapeHtml(message)}"
            disabled
          />
          <button class="primary-button" type="button" disabled>回车</button>
        </div>
        <button class="text-link lock-link" type="button" disabled>忘记密码？</button>
      </form>
    </div>
  `;
}

function renderPasswordResetScreen(error = "") {
  stopAutoLockTimer();
  state.authMode = "reset";
  state.authError = error;
  setRecoveryVerified(false);
  document.body.dataset.view = "locked";
  appShell.classList.add("hidden");
  lockScreen.classList.remove("hidden");
  const config = getAuthConfig();
  if (!hasRecoveryConfig(config)) {
    lockScreen.innerHTML = `
      <div class="lock-card">
        <div class="lock-mark" aria-hidden="true">
          <span class="icon" data-icon="lock"></span>
        </div>
        <span class="eyebrow">无法重置</span>
        <h1>还没有找回问题</h1>
        <p>这台电脑还没有设置找回问题。为了避免任何人直接重置密码，请先用密码登录后补充找回问题。</p>
        <div class="lock-form">
          <div class="form-message error">没有找回问题时，不能通过“忘记密码”修改密码。</div>
          <button class="ghost-button full-width" data-action="back-unlock" type="button">返回解锁</button>
        </div>
      </div>
    `;
    hydrateStaticIcons();
    return;
  }

  lockScreen.innerHTML = `
    <div class="lock-card">
      <div class="lock-mark" aria-hidden="true">
        <span class="icon" data-icon="lock"></span>
      </div>
      <span class="eyebrow">身份验证</span>
      <h1>重置密码锁</h1>
      <p>先回答找回问题。全部答对后，才能重新设置进入密码。</p>
      <form id="password-reset-form" class="lock-form">
        <div class="form-message">答案只在本机验证，不会显示原答案。</div>
        <div class="recovery-fields">
          ${config.recovery.questions
            .slice(0, RECOVERY_QUESTION_COUNT)
            .map(
              (item, index) => `
                <div class="field">
                  <label for="reset-answer-${index + 1}">${escapeHtml(item.question)}</label>
                  <input id="reset-answer-${index + 1}" name="answer${index + 1}" autocomplete="off" />
                </div>
              `
            )
            .join("")}
        </div>
        ${error ? `<div class="form-message error">${escapeHtml(error)}</div>` : ""}
        <button class="primary-button full-width" type="submit">
          <span class="icon" data-icon="check"></span><span>验证并重设密码</span>
        </button>
        <button class="ghost-button full-width" data-action="back-unlock" type="button">返回解锁</button>
      </form>
    </div>
  `;
  hydrateStaticIcons();
  requestAnimationFrame(() => lockScreen.querySelector("input")?.focus());
}

function renderRecoveredPasswordScreen(error = "") {
  stopAutoLockTimer();
  if (!isRecoveryVerified()) {
    renderPasswordResetScreen("请先回答找回问题。");
    return;
  }
  state.authMode = "recovered";
  state.authError = error;
  document.body.dataset.view = "locked";
  appShell.classList.add("hidden");
  lockScreen.classList.remove("hidden");
  lockScreen.innerHTML = `
    <div class="lock-card">
      <div class="lock-mark" aria-hidden="true">
        <span class="icon" data-icon="lock"></span>
      </div>
      <span class="eyebrow">验证通过</span>
      <h1>设置新密码</h1>
      <p>找回问题已验证。请设置新的进入密码，原找回问题会继续保留。</p>
      <form id="password-recovered-form" class="lock-form">
        <div class="field">
          <label for="recovered-password">新密码</label>
          <input id="recovered-password" name="password" type="password" autocomplete="new-password" />
        </div>
        <div class="field">
          <label for="recovered-password-confirm">确认新密码</label>
          <input id="recovered-password-confirm" name="confirmPassword" type="password" autocomplete="new-password" />
        </div>
        ${error ? `<div class="form-message error">${escapeHtml(error)}</div>` : ""}
        <button class="primary-button full-width" type="submit">
          <span class="icon" data-icon="check"></span><span>保存新密码</span>
        </button>
      </form>
    </div>
  `;
  hydrateStaticIcons();
  requestAnimationFrame(() => lockScreen.querySelector("input")?.focus());
}

function renderRecoverySetupScreen(message = "", messageType = "error") {
  stopAutoLockTimer();
  const config = getAuthConfig();
  state.authMode = "recovery-setup";
  state.authError = message;
  document.body.dataset.view = "locked";
  appShell.classList.add("hidden");
  lockScreen.classList.remove("hidden");
  lockScreen.innerHTML = `
    <div class="lock-card">
      <div class="lock-mark" aria-hidden="true">
        <span class="icon" data-icon="lock"></span>
      </div>
      <span class="eyebrow">安全补充</span>
      <h1>先设置找回问题</h1>
      <p>为了避免忘记密码被任何人滥用，请先设置 3 个找回问题。</p>
      <form id="recovery-setup-form" class="lock-form">
        <div class="field">
          <label for="recovery-current-password">当前密码</label>
          <input id="recovery-current-password" name="currentPassword" type="password" autocomplete="current-password" />
        </div>
        ${renderRecoveryFields("setupRecovery", config?.recovery?.questions || [])}
        ${message ? `<div class="form-message ${messageType === "success" ? "success" : "error"}">${escapeHtml(message)}</div>` : ""}
        <button class="primary-button full-width" type="submit">
          <span class="icon" data-icon="check"></span><span>保存并进入系统</span>
        </button>
      </form>
    </div>
  `;
  hydrateStaticIcons();
  requestAnimationFrame(() => lockScreen.querySelector("input")?.focus());
}

function showAppShell() {
  lockScreen.classList.add("hidden");
  lockScreen.innerHTML = "";
  appShell.classList.remove("hidden");
}

function resetVisibleDiaryContent() {
  state.entries = [];
  state.selectedId = null;
  state.editingId = null;
  state.entryDraft = {};
  state.pendingAttachments = [];
  state.importDraft = {};
  state.importAttachments = [];
  state.view = "library";
  state.securityNotice = null;
  state.editorNotice = null;
  state.libraryNotice = null;
  app.innerHTML = "";
  searchInput.value = "";
  document.querySelector("#side-stats").innerHTML = "";
}

function lockApp() {
  saveEditorDraftBeforeLock();
  stopAutoLockTimer();
  setSessionUnlocked(false);
  setRecoveryVerified(false);
  resetVisibleDiaryContent();
  renderLockScreen(getAuthConfig() ? "unlock" : "setup");
}

async function handlePasswordSetup(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const password = String(data.password || "");
  const confirmPassword = String(data.confirmPassword || "");
  const error = validateNewPassword(password, confirmPassword);
  if (error) {
    renderLockScreen("setup", error);
    return;
  }
  const recoveryItems = collectRecoveryItems(data, "setupRecovery");
  const recoveryError = validateRecoveryItems(recoveryItems);
  if (recoveryError) {
    renderLockScreen("setup", recoveryError);
    return;
  }

  try {
    await savePasswordConfig(password, recoveryItems);
    setSessionUnlocked(true);
    state.authError = "";
    await startApp();
  } catch {
    renderLockScreen("setup", "当前浏览器无法启用密码锁，请用本地服务器打开系统。");
  }
}

async function handlePasswordUnlock(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const password = String(data.password || "");
  if (!password) {
    renderLockScreen("unlock", "请输入密码。");
    return;
  }

  try {
    const matched = await verifyPassword(password);
    if (!matched) {
      renderLockScreen("unlock", "密码不正确。");
      return;
    }
    setSessionUnlocked(true);
    state.authError = "";
    if (!hasRecoveryConfig()) {
      renderRecoverySetupScreen("请先补充找回问题。");
      return;
    }
    await startApp();
  } catch {
    renderLockScreen("unlock", "解锁服务不可用，请重新双击启动脚本。");
  }
}

async function handlePasswordChange(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const currentPassword = String(data.currentPassword || "");
  const newPassword = String(data.newPassword || "");
  const confirmPassword = String(data.confirmPassword || "");
  const validationError = validateNewPassword(newPassword, confirmPassword);

  if (!currentPassword) {
    state.securityNotice = { type: "error", text: "请先输入当前密码。" };
    render();
    return;
  }
  if (validationError) {
    state.securityNotice = { type: "error", text: validationError };
    render();
    return;
  }

  try {
    const matched = await verifyPassword(currentPassword);
    if (!matched) {
      state.securityNotice = { type: "error", text: "当前密码不正确。" };
      render();
      return;
    }
    await savePasswordConfig(newPassword);
    setSessionUnlocked(true);
    state.securityNotice = { type: "success", text: "密码已更新。" };
    render();
  } catch {
    state.securityNotice = { type: "error", text: "密码更新失败，请稍后再试。" };
    render();
  }
}

async function handlePasswordReset(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const answers = Array.from({ length: RECOVERY_QUESTION_COUNT }).map((_, index) => data[`answer${index + 1}`] || "");
  if (answers.some((answer) => !normalizeRecoveryAnswer(answer))) {
    renderPasswordResetScreen("请完整回答所有找回问题。");
    return;
  }

  try {
    const matched = await verifyRecoveryAnswers(answers);
    if (!matched) {
      renderPasswordResetScreen("找回问题答案不正确。");
      return;
    }
    setRecoveryVerified(true);
    renderRecoveredPasswordScreen();
  } catch {
    renderPasswordResetScreen("当前浏览器无法验证找回问题。");
  }
}

async function handleRecoveredPasswordSetup(form) {
  if (!isRecoveryVerified()) {
    renderPasswordResetScreen("请先回答找回问题。");
    return;
  }
  const data = Object.fromEntries(new FormData(form).entries());
  const password = String(data.password || "");
  const confirmPassword = String(data.confirmPassword || "");
  const error = validateNewPassword(password, confirmPassword);
  if (error) {
    renderRecoveredPasswordScreen(error);
    return;
  }

  try {
    await savePasswordConfig(password);
    setRecoveryVerified(false);
    setSessionUnlocked(true);
    state.authError = "";
    await startApp();
  } catch {
    renderRecoveredPasswordScreen("当前浏览器无法保存新密码。");
  }
}

async function handleRecoverySetup(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const currentPassword = String(data.currentPassword || "");
  const recoveryItems = collectRecoveryItems(data, "setupRecovery");
  const recoveryError = validateRecoveryItems(recoveryItems);
  if (!currentPassword) {
    renderRecoverySetupScreen("请先输入当前密码。");
    return;
  }
  if (recoveryError) {
    renderRecoverySetupScreen(recoveryError);
    return;
  }

  try {
    const matched = await verifyPassword(currentPassword);
    if (!matched) {
      renderRecoverySetupScreen("当前密码不正确。");
      return;
    }
    await saveRecoveryConfig(recoveryItems);
    setSessionUnlocked(true);
    await startApp();
  } catch {
    renderRecoverySetupScreen("找回问题保存失败，请稍后再试。");
  }
}

async function handleRecoveryChange(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const currentPassword = String(data.currentPassword || "");
  const recoveryItems = collectRecoveryItems(data, "changeRecovery");
  const recoveryError = validateRecoveryItems(recoveryItems);
  if (!currentPassword) {
    state.securityNotice = { type: "error", text: "请先输入当前密码。" };
    render();
    return;
  }
  if (recoveryError) {
    state.securityNotice = { type: "error", text: recoveryError };
    render();
    return;
  }

  try {
    const matched = await verifyPassword(currentPassword);
    if (!matched) {
      state.securityNotice = { type: "error", text: "当前密码不正确。" };
      render();
      return;
    }
    await saveRecoveryConfig(recoveryItems);
    state.securityNotice = { type: "success", text: "找回问题已更新。" };
    render();
  } catch {
    state.securityNotice = { type: "error", text: "找回问题更新失败，请稍后再试。" };
    render();
  }
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state.entries = JSON.parse(raw);
      return;
    }
    const backupRaw = localStorage.getItem(STORAGE_BACKUP_KEY);
    state.entries = backupRaw ? JSON.parse(backupRaw) : [];
  } catch {
    try {
      const backupRaw = localStorage.getItem(STORAGE_BACKUP_KEY);
      state.entries = backupRaw ? JSON.parse(backupRaw) : [];
    } catch {
      state.entries = [];
    }
  }
}

function dataFingerprint(raw = "") {
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `${raw.length}-${hash.toString(16)}`;
}

function entryCounts(entries = []) {
  const active = entries.filter((entry) => !isDeletedEntry(entry));
  const deleted = entries.filter(isDeletedEntry);
  return {
    total: active.length,
    all: entries.length,
    deleted: deleted.length,
    qq: active.filter((entry) => entry.sourceType === "QQ邮箱记事本" || entry.importMeta?.source === "QQ邮箱记事本").length,
    manual: active.filter((entry) => entry.sourceType === "手动记录").length
  };
}

function readDataSnapshots() {
  try {
    const raw = localStorage.getItem(STORAGE_SNAPSHOT_KEY);
    const snapshots = raw ? JSON.parse(raw) : [];
    return Array.isArray(snapshots) ? snapshots : [];
  } catch {
    return [];
  }
}

function persistDataSnapshots(snapshots) {
  const trimmed = snapshots.slice(0, STORAGE_SNAPSHOT_LIMIT);
  while (trimmed.length) {
    try {
      localStorage.setItem(STORAGE_SNAPSHOT_KEY, JSON.stringify(trimmed));
      return true;
    } catch {
      trimmed.pop();
    }
  }
  try {
    localStorage.removeItem(STORAGE_SNAPSHOT_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
  return false;
}

function createSnapshotFromRaw(raw, reason = "自动保护") {
  if (!raw) return null;
  try {
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries) || !entries.length) return null;
    const fingerprint = dataFingerprint(raw);
    const snapshots = readDataSnapshots();
    if (snapshots[0]?.fingerprint === fingerprint) return snapshots[0];
    const counts = entryCounts(entries);
    const snapshot = {
      id: uid(),
      reason,
      createdAt: new Date().toISOString(),
      entryCount: counts.total,
      qqCount: counts.qq,
      manualCount: counts.manual,
      byteLength: raw.length,
      fingerprint,
      entries
    };
    persistDataSnapshots([snapshot, ...snapshots.filter((item) => item.fingerprint !== fingerprint)]);
    return snapshot;
  } catch {
    return null;
  }
}

function createCurrentDataSnapshot(reason = "手动快照") {
  const raw = JSON.stringify(state.entries || []);
  return createSnapshotFromRaw(raw, reason);
}

function saveEntries(reason = "数据更新") {
  const previousRaw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_BACKUP_KEY);
  state.entries.sort((a, b) => {
    const dateCompare = String(b.entryDate || "").localeCompare(String(a.entryDate || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
  const payload = JSON.stringify(state.entries);
  if (previousRaw && previousRaw !== payload) createSnapshotFromRaw(previousRaw, `写入前：${reason}`);
  localStorage.setItem(STORAGE_KEY, payload);
  localStorage.setItem(STORAGE_BACKUP_KEY, payload);
  queueSharedStorageWrite(reason);
}

function restoreDataSnapshot(id) {
  const snapshot = readDataSnapshots().find((item) => item.id === id);
  if (!snapshot?.entries?.length) {
    state.securityNotice = { type: "error", text: "没有找到这个快照。" };
    render();
    return;
  }
  if (!confirm(`恢复 ${snapshot.entryCount} 篇日记？当前数据会先自动保存一份快照。`)) return;
  state.entries = snapshot.entries.map((entry) => ({
    ...entry,
    analysis: entry.analysis || analyzeEntry(entry)
  }));
  saveEntries("恢复快照");
  state.securityNotice = { type: "success", text: `已恢复快照：${snapshot.entryCount} 篇日记。` };
  state.view = "archive";
  render();
}

function handleCreateDataSnapshot() {
  loadEntries();
  const snapshot = createCurrentDataSnapshot("手动快照");
  state.securityNotice = snapshot
    ? { type: "success", text: `已保存快照：${snapshot.entryCount} 篇日记。` }
    : { type: "error", text: "当前没有可保存的日记数据。" };
  render();
}

function isDeletedEntry(entry) {
  return Boolean(entry.deletedAt);
}

function activeEntries() {
  return state.entries.filter((entry) => !isDeletedEntry(entry));
}

function trashedEntries() {
  return state.entries.filter(isDeletedEntry);
}

function defaultQQSyncStatus(entry) {
  return entry?.sourceType === "QQ邮箱记事本" ? "synced" : "pending";
}

function getQQSyncStatus(entry) {
  const status = entry?.qqSync?.status;
  return QQ_SYNC_STATUSES[status] ? status : defaultQQSyncStatus(entry);
}

function qqSyncInfo(entry) {
  const status = getQQSyncStatus(entry);
  return {
    status,
    ...QQ_SYNC_STATUSES[status]
  };
}

function defaultQQSyncMeta(entry, now = new Date().toISOString()) {
  const status = defaultQQSyncStatus(entry);
  return {
    status,
    updatedAt: now,
    ...(status === "synced" ? { syncedAt: now, note: "来自 QQ 记事本导入" } : {})
  };
}

function buildQQSyncStats(entries = activeEntries()) {
  return entries.reduce(
    (stats, entry) => {
      stats.total += 1;
      stats[getQQSyncStatus(entry)] += 1;
      return stats;
    },
    { total: 0, pending: 0, synced: 0, failed: 0, skipped: 0 }
  );
}

function qqSyncStatusPill(entry) {
  const info = qqSyncInfo(entry);
  const tone = info.tone ? ` ${info.tone}` : "";
  return `<span class="pill${tone}">${escapeHtml(info.label)}</span>`;
}

function entrySyncRelevantChanged(existing, nextEntry) {
  if (!existing) return false;
  const fields = ["title", "entryDate", "content", "mood", "weather", "location", "privacy", "sourceType", "futureOpenDate"];
  if (fields.some((field) => String(existing[field] || "") !== String(nextEntry[field] || ""))) return true;
  const listFields = ["people", "tags"];
  if (listFields.some((field) => joinList(existing[field] || []) !== joinList(nextEntry[field] || []))) return true;
  return JSON.stringify(existing.attachments || []) !== JSON.stringify(nextEntry.attachments || []);
}

function normalizeDuplicateText(value = "") {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s"'“”‘’.,，。！？!?；;：:、（）()【】\[\]《》<>〈〉{}「」『』·•\-_\/\\|]+/g, "");
}

function duplicatePairKey(leftId, rightId) {
  return [leftId, rightId].sort().join("::");
}

function readIgnoredDuplicateKeys() {
  try {
    const raw = localStorage.getItem(DUPLICATE_IGNORE_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(items) ? items : []);
  } catch {
    return new Set();
  }
}

function saveIgnoredDuplicateKeys(keys) {
  try {
    localStorage.setItem(DUPLICATE_IGNORE_KEY, JSON.stringify([...keys].slice(-500)));
    queueSharedStorageWrite("重复日记忽略记录");
  } catch {
    // 忽略保存失败，不影响日记主体数据。
  }
}

function duplicateTextRelation(leftText, rightText, minLength = 18) {
  if (!leftText || !rightText) return "";
  if (leftText === rightText) return "same";
  const shorter = leftText.length <= rightText.length ? leftText : rightText;
  const longer = leftText.length > rightText.length ? leftText : rightText;
  if (shorter.length >= minLength && longer.includes(shorter)) return "contains";
  return "";
}

function scoreDuplicatePair(left, right) {
  const reasons = [];
  let score = 0;
  const sameDate = left.entryDate && right.entryDate && left.entryDate === right.entryDate;
  const sameSource = left.sourceType && right.sourceType && left.sourceType === right.sourceType;
  const leftHash = left.importMeta?.contentHash || "";
  const rightHash = right.importMeta?.contentHash || "";
  const sameHash = leftHash && rightHash && leftHash === rightHash;
  const titleRelation = duplicateTextRelation(normalizeDuplicateText(left.title), normalizeDuplicateText(right.title), 4);
  const contentRelation = duplicateTextRelation(normalizeDuplicateText(left.content), normalizeDuplicateText(right.content), 28);

  if (sameHash) {
    score += 90;
    reasons.push("正文指纹相同");
  }
  if (sameDate) {
    score += 25;
    reasons.push("日期相同");
  }
  if (titleRelation === "same") {
    score += 45;
    reasons.push("标题相同");
  } else if (titleRelation === "contains") {
    score += 28;
    reasons.push("标题相近");
  }
  if (contentRelation === "same") {
    score += 60;
    reasons.push("正文相同");
  } else if (contentRelation === "contains") {
    score += 38;
    reasons.push("正文相近");
  }
  if (sameSource) {
    score += 8;
    reasons.push("来源相同");
  }

  return {
    score,
    reasons,
    shouldShow: sameHash || (sameDate && score >= 60) || score >= 92
  };
}

function findDuplicateCandidates(limit = 12) {
  const entries = activeEntries();
  const ignoredKeys = readIgnoredDuplicateKeys();
  const candidates = [];

  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      const key = duplicatePairKey(left.id, right.id);
      if (ignoredKeys.has(key)) continue;
      const result = scoreDuplicatePair(left, right);
      if (!result.shouldShow) continue;
      candidates.push({ left, right, score: result.score, reasons: result.reasons, key });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score || String(b.left.entryDate || "").localeCompare(String(a.left.entryDate || "")))
    .slice(0, limit);
}

function allTags() {
  return [...new Set(activeEntries().flatMap((entry) => entry.tags || []))].sort((a, b) => a.localeCompare(b, "zh"));
}

function allYears() {
  return [...new Set(activeEntries().map((entry) => String(entry.entryDate || "").slice(0, 4)).filter(Boolean))].sort(
    (a, b) => b.localeCompare(a)
  );
}

function formatSize(dataUrl = "") {
  const kb = Math.round((dataUrl.length * 0.75) / 1024);
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function readFiles(files) {
  const tasks = [...files].map(
    (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            id: uid(),
            name: file.name,
            type: file.type || "application/octet-stream",
            dataUrl: reader.result
          });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })
  );
  return Promise.all(tasks);
}

function analyzeEntry(entry) {
  const text = `${entry.title || ""}\n${entry.content || ""}`;
  const themes = Object.entries(THEME_MAP)
    .filter(([, words]) => words.some((word) => text.includes(word)))
    .map(([theme]) => theme);
  const firstSentence = String(entry.content || "")
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .find(Boolean);

  return {
    summary: firstSentence ? truncate(firstSentence, 90) : truncate(entry.title || "这篇记录还没有正文。", 90),
    themes: themes.length ? themes : ["日常"],
    mood: entry.mood || "未标注",
    people: entry.people || [],
    places: entry.location ? [entry.location] : [],
    keywords: [...new Set([...(entry.tags || []), ...themes])].slice(0, 8)
  };
}

function setActiveNav() {
  const activeView = state.view === "editor" ? "write" : state.view === "lifeReport" ? "insights" : state.view;
  document.querySelectorAll(".nav-item").forEach((button) => {
    const isWrite = button.dataset.action === "new-entry" && activeView === "write";
    button.classList.toggle("active", button.dataset.view === activeView || isWrite);
  });
}

function renderSideStats() {
  const entries = activeEntries();
  const total = entries.length;
  const pending = entries.filter((entry) => entry.status === "待校对").length;
  const deleted = trashedEntries().length;
  const syncStats = buildQQSyncStats(entries);
  const years = allYears();
  const range = years.length ? `${years.at(-1)}-${years[0]}` : "等待第一篇";
  document.querySelector("#side-stats").innerHTML = `
    <div class="stat-line"><span>日记总数</span><strong>${total}</strong></div>
    <div class="stat-line"><span>待校对</span><strong>${pending}</strong></div>
    <div class="stat-line"><span>待同步</span><strong>${syncStats.pending}</strong></div>
    <div class="stat-line"><span>回收站</span><strong>${deleted}</strong></div>
    <div class="stat-line"><span>时间跨度</span><strong>${escapeHtml(range)}</strong></div>
  `;
}

function render() {
  document.body.dataset.view = state.view;
  setActiveNav();
  renderSideStats();
  searchInput.value = state.query;

  const renderers = {
    library: renderLibrary,
    editor: renderEditor,
    import: renderImport,
    review: renderReview,
    sync: renderQQSync,
    timeline: renderTimeline,
    insights: renderInsights,
    lifeReport: renderLifeReport,
    detail: renderDetail,
    trash: renderTrash,
    archive: renderArchive
  };

  (renderers[state.view] || renderLibrary)();
  hydrateStaticIcons();
}

function filteredEntries() {
  const query = state.query.trim().toLowerCase();

  const entries = activeEntries().filter((entry) => {
    if (state.filters.year !== "all" && String(entry.entryDate || "").slice(0, 4) !== state.filters.year) return false;
    if (state.filters.mood !== "all" && entry.mood !== state.filters.mood) return false;
    if (state.filters.tag !== "all" && !(entry.tags || []).includes(state.filters.tag)) return false;
    if (state.filters.status !== "all" && entry.status !== state.filters.status) return false;
    if (state.filters.privacy !== "all" && entry.privacy !== state.filters.privacy) return false;

    if (!query) return true;
    const haystack = [
      entry.title,
      entry.entryDate,
      entry.content,
      entry.mood,
      entry.weather,
      entry.location,
      entry.privacy,
      entry.sourceType,
      ...(entry.people || []),
      ...(entry.tags || [])
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  return sortEntriesByDate(entries, state.filters.sort === "asc" ? "asc" : "desc");
}

function renderLibrary() {
  const entries = filteredEntries();
  const allActive = activeEntries();
  const pending = allActive.filter((entry) => entry.status === "待校对");
  const todayMemories = allActive.filter((entry) => monthDay(entry.entryDate) === monthDay(todayStr()));
  const futureLetters = allActive.filter((entry) => entry.futureOpenDate && entry.futureOpenDate <= todayStr());
  const totalAttachments = allActive.reduce((sum, entry) => sum + (entry.attachments || []).length, 0);
  const years = allYears();
  const activeNotice = state.libraryNotice || state.importNotice;
  const notice = activeNotice
    ? `<div class="form-message ${activeNotice.type === "error" ? "error" : "success"}">${escapeHtml(activeNotice.text)}</div>`
    : "";

  app.innerHTML = `
    <section class="desk-panel">
      <div class="desk-copy">
        <span class="eyebrow">${dateLabel(todayStr())}</span>
        <h2>今天想留下些什么？</h2>
        <p>新的片段、旧的一页、忽然想起的人和事，都先放进这里。</p>
      </div>
        <div class="desk-actions">
        <button class="ghost-button" data-action="random-entry" type="button">
          <span class="icon" data-icon="shuffle"></span><span>随机回看</span>
        </button>
        <button class="primary-button" data-action="new-entry" type="button">
          <span class="icon" data-icon="pen"></span><span>写日记</span>
        </button>
        <button class="ghost-button" data-view="import" type="button">
          <span class="icon" data-icon="image"></span><span>导入旧日记</span>
        </button>
        <button class="ghost-button" data-action="restore-qq-notepad" type="button">
          <span class="icon" data-icon="archive"></span><span>恢复 QQ 记事本日记</span>
        </button>
      </div>
      <div class="desk-metrics">
        <div><strong>${allActive.length}</strong><span>篇记录</span></div>
        <div><strong>${years.length || 0}</strong><span>个年份</span></div>
        <div><strong>${totalAttachments}</strong><span>份原件</span></div>
      </div>
    </section>

    ${notice}

    <div class="library-grid">
      <section class="archive-main">
        <div class="section-heading">
          <div>
            <h2>全部记录</h2>
            <p>${entries.length ? `当前视图 ${entries.length} 篇` : "还没有形成记录流"}</p>
          </div>
        </div>
        ${renderFilters()}
        <div class="entry-list">
          ${entries.length ? entries.map(renderEntryCard).join("") : renderEmptyState()}
        </div>
      </section>

      <aside>
        <section class="memory-panel">
          <h3>往年今日</h3>
          ${renderMiniList(todayMemories, "今天附近还没有旧记录")}
        </section>
        <section class="memory-panel">
          <h3>未来信件</h3>
          ${renderMiniList(futureLetters, "还没有到期的未来日记")}
        </section>
        <section class="memory-panel">
          <h3>待校对旧日记</h3>
          ${
            pending.length
              ? `<div class="mini-list">${pending
                  .slice(0, 4)
                  .map(
                    (entry) => `
                    <button class="text-link mini-item" data-action="view-entry" data-id="${entry.id}" type="button">
                      <strong>${escapeHtml(entry.title)}</strong>
                      <span>${dateLabel(entry.entryDate)}</span>
                    </button>`
                  )
                  .join("")}</div>`
              : `<p class="muted-text">旧材料都已整理。</p>`
          }
        </section>
      </aside>
    </div>
  `;
}

function renderFilters() {
  const years = allYears();
  const tags = allTags();
  return `
    <div class="filter-row" aria-label="日记筛选">
      <div class="field compact-field">
        <label class="sr-only" for="filter-year">年份</label>
        <select id="filter-year" data-filter="year">
          <option value="all">全部年份</option>
          ${years.map((year) => `<option value="${year}" ${state.filters.year === year ? "selected" : ""}>${year}</option>`).join("")}
        </select>
      </div>
      <div class="field compact-field">
        <label class="sr-only" for="filter-mood">心情</label>
        <select id="filter-mood" data-filter="mood">
          <option value="all">全部心情</option>
          ${MOODS.map((mood) => `<option value="${mood}" ${state.filters.mood === mood ? "selected" : ""}>${mood}</option>`).join("")}
        </select>
      </div>
      <div class="field compact-field">
        <label class="sr-only" for="filter-tag">标签</label>
        <select id="filter-tag" data-filter="tag">
          <option value="all">全部标签</option>
          ${tags.map((tag) => `<option value="${escapeHtml(tag)}" ${state.filters.tag === tag ? "selected" : ""}>${escapeHtml(tag)}</option>`).join("")}
        </select>
      </div>
      <div class="field compact-field">
        <label class="sr-only" for="filter-status">状态</label>
        <select id="filter-status" data-filter="status">
          <option value="all">全部状态</option>
          ${STATUS_TYPES.map((status) => `<option value="${status}" ${state.filters.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </div>
      <div class="field compact-field">
        <label class="sr-only" for="filter-privacy">私密</label>
        <select id="filter-privacy" data-filter="privacy">
          <option value="all">全部等级</option>
          ${PRIVACY_LEVELS.map((level) => `<option value="${level}" ${state.filters.privacy === level ? "selected" : ""}>${level}</option>`).join("")}
        </select>
      </div>
      <div class="field compact-field">
        <label class="sr-only" for="filter-sort">排序</label>
        <select id="filter-sort" data-filter="sort">
          <option value="desc" ${state.filters.sort === "desc" ? "selected" : ""}>倒序：最新在前</option>
          <option value="asc" ${state.filters.sort === "asc" ? "selected" : ""}>正序：最早在前</option>
        </select>
      </div>
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-illustration" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <h3>从第一页开始</h3>
      <p>今天的一句话，或多年前的一张旧纸，都可以先放进档案馆。</p>
      <div class="empty-actions">
        <button class="primary-button" data-action="new-entry" type="button">
          <span class="icon" data-icon="pen"></span><span>写日记</span>
        </button>
        <button class="ghost-button" data-action="restore-qq-notepad" type="button">
          <span class="icon" data-icon="archive"></span><span>恢复 QQ 记事本日记</span>
        </button>
        <button class="ghost-button" data-view="import" type="button">
          <span class="icon" data-icon="image"></span><span>导入旧日记</span>
        </button>
      </div>
    </div>
  `;
}

function renderMiniList(entries, emptyText) {
  if (!entries.length) return `<p class="muted-text">${escapeHtml(emptyText)}</p>`;
  return `
    <div class="mini-list">
      ${entries
        .slice(0, 4)
        .map(
          (entry) => `
            <button class="text-link mini-item" data-action="view-entry" data-id="${entry.id}" type="button">
              <strong>${escapeHtml(entry.title)}</strong>
              <span>${dateLabel(entry.entryDate)}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderEntryCard(entry) {
  const attachmentCount = (entry.attachments || []).length;
  const preview = truncate(entry.content) || (attachmentCount ? `保存了 ${attachmentCount} 份原始材料` : "还没有正文");
  const [year = "", month = "", day = ""] = String(entry.entryDate || "").split("-");
  return `
    <article class="entry-card">
      <div class="entry-date-block">
        <strong>${day ? Number(day) : "--"}</strong>
        <span>${month ? `${Number(month)}月` : "未标"}</span>
        <em>${escapeHtml(year || "日期")}</em>
      </div>
      <div class="entry-card-main">
        <div class="entry-card-head">
          <div>
            <h3>${escapeHtml(entry.title)}</h3>
            <div class="entry-date">${dateLabel(entry.entryDate)}</div>
          </div>
          <div class="status-stack">
            <span class="pill ${entry.status === "待校对" ? "amber" : ""}">${escapeHtml(entry.status || "正式")}</span>
            ${qqSyncStatusPill(entry)}
          </div>
        </div>
        <p class="entry-preview">${escapeHtml(preview)}</p>
        <div class="meta-line">
          ${entry.mood ? `<span class="pill">${escapeHtml(entry.mood)}</span>` : ""}
          ${entry.location ? `<span class="pill plum">${escapeHtml(entry.location)}</span>` : ""}
          ${entry.privacy ? `<span class="pill rose">${escapeHtml(entry.privacy)}</span>` : ""}
          ${attachmentCount ? `<span class="pill amber">${attachmentCount} 份附件</span>` : ""}
        </div>
        <div class="tag-row">
          ${(entry.tags || []).slice(0, 6).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
          ${(entry.people || []).slice(0, 4).map((person) => `<span class="pill plum">${escapeHtml(person)}</span>`).join("")}
        </div>
        <div class="entry-actions">
          ${entry.status === "待校对" ? `<button class="quiet-button" data-action="confirm-entry" data-id="${entry.id}" type="button"><span class="icon" data-icon="check"></span><span>确认入库</span></button>` : ""}
          <button class="ghost-button" data-action="view-entry" data-id="${entry.id}" type="button">查看</button>
          <button class="quiet-button" data-action="edit-entry" data-id="${entry.id}" type="button"><span class="icon" data-icon="edit"></span><span>编辑</span></button>
          <button class="danger-button" data-action="delete-entry" data-id="${entry.id}" type="button"><span class="icon" data-icon="trash"></span><span>删除</span></button>
        </div>
      </div>
    </article>
  `;
}

function renderTrashCard(entry) {
  const deletedTime = dateTimeLabel(entry.deletedAt);
  const preview = truncate(entry.content) || "这篇记录没有正文。";
  return `
    <article class="entry-card trash-card">
      <div class="entry-date-block">
        <strong>${String(entry.entryDate || "").slice(8, 10) || "--"}</strong>
        <span>${String(entry.entryDate || "").slice(5, 7) ? `${Number(String(entry.entryDate).slice(5, 7))}月` : "未标"}</span>
        <em>${escapeHtml(String(entry.entryDate || "").slice(0, 4) || "日期")}</em>
      </div>
      <div class="entry-card-main">
        <div class="entry-card-head">
          <div>
            <h3>${escapeHtml(entry.title)}</h3>
            <div class="entry-date">删除时间：${escapeHtml(deletedTime)}</div>
          </div>
          <span class="pill amber">回收站</span>
        </div>
        <p class="entry-preview">${escapeHtml(preview)}</p>
        <div class="meta-line">
          <span class="pill">${escapeHtml(entry.sourceType || "日记")}</span>
          ${entry.privacy ? `<span class="pill rose">${escapeHtml(entry.privacy)}</span>` : ""}
        </div>
        <div class="entry-actions">
          <button class="primary-button" data-action="restore-entry" data-id="${entry.id}" type="button">
            <span class="icon" data-icon="check"></span><span>恢复</span>
          </button>
          <button class="danger-button" data-action="permanently-delete-entry" data-id="${entry.id}" type="button">
            <span class="icon" data-icon="trash"></span><span>永久删除</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderTrash() {
  const entries = trashedEntries().sort((a, b) => String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")));
  const notice = state.securityNotice
    ? `<div class="form-message ${state.securityNotice.type === "error" ? "error" : "success"}">${escapeHtml(state.securityNotice.text)}</div>`
    : "";
  app.innerHTML = `
    <div class="view-header">
      <div>
        <h2>回收站</h2>
        <p>${entries.length ? `${entries.length} 篇可恢复记录` : "没有被删除的日记"}</p>
      </div>
      <button class="ghost-button" data-action="back-library" type="button">返回日记库</button>
    </div>
    ${notice}
    <section class="archive-main">
      <div class="entry-list">
        ${
          entries.length
            ? entries.map(renderTrashCard).join("")
            : `<div class="empty-state"><h3>回收站是空的</h3><p>以后删除的日记会先放在这里，可以再恢复。</p></div>`
        }
      </div>
    </section>
  `;
}

function openNewEntry() {
  state.libraryNotice = null;
  state.editorNotice = null;
  state.view = "editor";
  state.editingId = null;
  state.entryDraft = {
    title: "",
    entryDate: todayStr(),
    mood: "平静",
    weather: "",
    location: "",
    people: "",
    tags: "",
    privacy: "私密",
    sourceType: "手动记录",
    status: "正式",
    futureOpenDate: "",
    content: ""
  };
  state.pendingAttachments = [];
  render();
}

function openEditor(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry || isDeletedEntry(entry)) return;
  state.libraryNotice = null;
  state.editorNotice = null;
  state.view = "editor";
  state.editingId = id;
  state.entryDraft = {
    title: entry.title || "",
    entryDate: entry.entryDate || todayStr(),
    mood: entry.mood || "平静",
    weather: entry.weather || "",
    location: entry.location || "",
    people: joinList(entry.people),
    tags: joinList(entry.tags),
    privacy: entry.privacy || "私密",
    sourceType: entry.sourceType || "手动记录",
    status: entry.status || "正式",
    futureOpenDate: entry.futureOpenDate || "",
    content: entry.content || ""
  };
  state.pendingAttachments = [...(entry.attachments || [])];
  render();
}

function renderEditor() {
  const draft = state.entryDraft;
  const notice = state.editorNotice
    ? `<div class="form-message ${state.editorNotice.type === "error" ? "error" : "success"}">${escapeHtml(state.editorNotice.text)}</div>`
    : "";
  app.innerHTML = `
    <div class="view-header">
      <div>
        <h2>${state.editingId ? "编辑日记" : "写日记"}</h2>
        <p>${state.editingId ? "修改已经入档的记录" : "想写就写，想补就补"}</p>
      </div>
      <button class="ghost-button" data-action="back-library" type="button">返回日记库</button>
    </div>

    ${notice}

    <form class="writing-form" id="diary-form">
      <section class="writing-main">
        <div class="field title-field">
          <label for="entry-title">标题</label>
          <input id="entry-title" name="title" value="${escapeHtml(draft.title)}" placeholder="可以先空着" />
        </div>
        <div class="textarea-field prose-field">
          <label for="entry-content">正文</label>
          <textarea id="entry-content" name="content" placeholder="今天留下些什么">${escapeHtml(draft.content)}</textarea>
        </div>
        <div class="file-drop">
          <label class="inline-label" for="entry-files">附件</label>
          <input id="entry-files" type="file" accept="image/*,.pdf,.txt,.md" multiple />
          ${renderAttachments(state.pendingAttachments, "remove-attachment")}
        </div>
      </section>

      <aside class="writing-meta">
        <div class="field">
          <label for="entry-date">日期</label>
          <input id="entry-date" name="entryDate" type="date" value="${escapeHtml(draft.entryDate)}" />
        </div>
        <div class="field">
          <label for="entry-mood">心情</label>
          <select id="entry-mood" name="mood">
            ${MOODS.map((mood) => `<option value="${mood}" ${draft.mood === mood ? "selected" : ""}>${mood}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="entry-weather">天气</label>
          <input id="entry-weather" name="weather" value="${escapeHtml(draft.weather)}" />
        </div>
        <div class="field">
          <label for="entry-location">地点</label>
          <input id="entry-location" name="location" value="${escapeHtml(draft.location)}" />
        </div>
        <div class="field">
          <label for="entry-people">人物</label>
          <input id="entry-people" name="people" value="${escapeHtml(draft.people)}" placeholder="多人用逗号分隔" />
        </div>
        <div class="field">
          <label for="entry-tags">标签</label>
          <input id="entry-tags" name="tags" value="${escapeHtml(draft.tags)}" placeholder="学习，家庭，旅行" />
        </div>
        <div class="field">
          <label for="entry-privacy">私密等级</label>
          <select id="entry-privacy" name="privacy">
            ${PRIVACY_LEVELS.map((level) => `<option value="${level}" ${draft.privacy === level ? "selected" : ""}>${level}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="entry-source">来源</label>
          <select id="entry-source" name="sourceType">
            ${SOURCE_TYPES.map((type) => `<option value="${type}" ${draft.sourceType === type ? "selected" : ""}>${type}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="entry-status">状态</label>
          <select id="entry-status" name="status">
            ${STATUS_TYPES.map((status) => `<option value="${status}" ${draft.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="entry-future">未来打开</label>
          <input id="entry-future" name="futureOpenDate" type="date" value="${escapeHtml(draft.futureOpenDate)}" />
        </div>
        <div class="form-actions stacked">
          <span class="muted-text">${state.pendingAttachments.length ? `已添加 ${state.pendingAttachments.length} 份附件` : "原始图片会随记录一起保存"}</span>
          <button class="primary-button full-width" type="submit">
            <span class="icon" data-icon="save"></span><span>保存日记</span>
          </button>
        </div>
      </aside>
    </form>
  `;
}

function renderAttachments(attachments, removeAction) {
  if (!attachments.length) return "";
  return `
    <div class="attachment-grid">
      ${attachments
        .map(
          (file, index) => `
            <div class="attachment-tile">
              ${file.type.startsWith("image/") ? `<img src="${file.dataUrl}" alt="${escapeHtml(file.name)}" />` : `<div class="file-placeholder"><strong>${escapeHtml(file.name)}</strong></div>`}
              <footer>
                <span title="${escapeHtml(file.name)}">${escapeHtml(truncate(file.name, 18))} · ${formatSize(file.dataUrl)}</span>
                ${
                  removeAction
                    ? `<button class="icon-button" data-action="${removeAction}" data-index="${index}" type="button" title="移除">${icon("trash")}</button>`
                    : ""
                }
              </footer>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function collectEntryDraft() {
  const form = document.querySelector("#diary-form");
  if (!form) return state.entryDraft;
  const data = Object.fromEntries(new FormData(form).entries());
  state.entryDraft = { ...state.entryDraft, ...data };
  return state.entryDraft;
}

function draftHasContent(draft = {}, attachments = []) {
  return Boolean(
    String(draft.title || "").trim() ||
      String(draft.content || "").trim() ||
      String(draft.location || "").trim() ||
      String(draft.people || "").trim() ||
      String(draft.tags || "").trim() ||
      attachments.length
  );
}

function clearSavedEditorDraft() {
  sessionStorage.removeItem(EDITOR_DRAFT_KEY);
}

function saveEditorDraftBeforeLock() {
  if (state.view !== "editor") return;
  const draft = collectEntryDraft();
  if (!draftHasContent(draft, state.pendingAttachments)) {
    clearSavedEditorDraft();
    return;
  }
  sessionStorage.setItem(
    EDITOR_DRAFT_KEY,
    JSON.stringify({
      editingId: state.editingId,
      entryDraft: draft,
      pendingAttachments: state.pendingAttachments,
      savedAt: new Date().toISOString()
    })
  );
}

function restoreEditorDraftAfterUnlock() {
  try {
    const raw = sessionStorage.getItem(EDITOR_DRAFT_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved?.entryDraft) return false;
    state.view = "editor";
    state.editingId = saved.editingId || null;
    state.entryDraft = saved.entryDraft;
    state.pendingAttachments = Array.isArray(saved.pendingAttachments) ? saved.pendingAttachments : [];
    state.editorNotice = { type: "success", text: "已恢复锁定前未保存的草稿。" };
    return true;
  } catch {
    clearSavedEditorDraft();
    return false;
  }
}

function saveEntryFromDraft() {
  try {
    const draft = collectEntryDraft();
    const now = new Date().toISOString();
    const existing = state.entries.find((entry) => entry.id === state.editingId);
    const entryDate = draft.entryDate || todayStr();
    const title = draft.title?.trim() || `${dateLabel(entryDate)}的日记`;
    const entry = {
      ...(existing || {}),
      id: existing?.id || uid(),
      title,
      entryDate,
      content: draft.content || "",
      mood: draft.mood || "",
      weather: draft.weather || "",
      location: draft.location || "",
      people: splitList(draft.people),
      tags: splitList(draft.tags),
      privacy: draft.privacy || "私密",
      sourceType: draft.sourceType || "手动记录",
      status: draft.status || "正式",
      futureOpenDate: draft.futureOpenDate || "",
      attachments: [...state.pendingAttachments],
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    const previousSync = existing?.qqSync || defaultQQSyncMeta(entry, now);
    entry.qqSync = previousSync;
    if (existing && entrySyncRelevantChanged(existing, entry) && getQQSyncStatus(existing) === "synced") {
      entry.qqSync = {
        ...previousSync,
        status: "pending",
        staleSince: now,
        updatedAt: now,
        note: "日记修改后待重新同步"
      };
    }
    entry.analysis = analyzeEntry(entry);

    const previousEntries = state.entries;
    state.entries = existing ? state.entries.map((item) => (item.id === existing.id ? entry : item)) : [...state.entries, entry];
    try {
      saveEntries(existing ? "编辑日记" : "新增日记");
    } catch (error) {
      state.entries = previousEntries;
      throw error;
    }

    clearSavedEditorDraft();
    state.editorNotice = null;
    state.libraryNotice = { type: "success", text: `已保存《${entry.title}》。` };
    state.selectedId = null;
    state.entryDraft = {};
    state.pendingAttachments = [];
    state.view = "library";
    render();
  } catch (error) {
    state.editorNotice = {
      type: "error",
      text: error?.name === "QuotaExceededError" ? "保存失败：本地存储空间不足，请先清理大附件或导出备份。" : "保存失败，请稍后重试。"
    };
    state.view = "editor";
    render();
  }
}

function renderImport() {
  const draft = state.importDraft;
  const notice = state.importNotice
    ? `<div class="form-message ${state.importNotice.type === "error" ? "error" : "success"}">${escapeHtml(state.importNotice.text)}</div>`
    : "";
  app.innerHTML = `
    <div class="view-header">
      <div>
        <h2>历史导入</h2>
        <p>纸质日记、截图、旧照片先进入待校对区</p>
      </div>
      <div class="topbar-actions">
        <button class="ghost-button" data-action="restore-qq-notepad" type="button">
          <span class="icon" data-icon="archive"></span><span>恢复 QQ 记事本日记</span>
        </button>
        <button class="ghost-button" data-action="back-library" type="button">返回日记库</button>
      </div>
    </div>

    ${notice}

    <form class="writing-form import-workflow" id="import-form">
      <section class="writing-main">
        <div class="file-drop import-drop">
          <label class="inline-label" for="import-files">原始材料</label>
          <input id="import-files" type="file" accept="image/*,.pdf" multiple />
          ${renderAttachments(state.importAttachments, "remove-import-attachment")}
        </div>
        <div class="textarea-field prose-field compact-prose">
          <label for="import-raw">原始转写</label>
          <textarea id="import-raw" name="rawText" placeholder="先放粗转写或你看到的文字">${escapeHtml(draft.rawText || "")}</textarea>
        </div>
        <div class="textarea-field prose-field compact-prose">
          <label for="import-corrected">校对稿</label>
          <textarea id="import-corrected" name="correctedText" placeholder="确认后进入正式日记">${escapeHtml(draft.correctedText || "")}</textarea>
        </div>
      </section>

      <aside class="writing-meta">
        <div class="field">
          <label for="import-title">标题</label>
          <input id="import-title" name="title" value="${escapeHtml(draft.title || "")}" placeholder="例如：2004年秋天的日记" />
        </div>
        <div class="field">
          <label for="import-date">原始日期</label>
          <input id="import-date" name="entryDate" type="date" value="${escapeHtml(draft.entryDate || "")}" />
        </div>
        <div class="field">
          <label for="import-source">来源</label>
          <select id="import-source" name="sourceType">
            ${["纸质日记照片", "截图导入", "图片日记"].map((type) => `<option value="${type}" ${(draft.sourceType || "纸质日记照片") === type ? "selected" : ""}>${type}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="import-privacy">私密等级</label>
          <select id="import-privacy" name="privacy">
            ${PRIVACY_LEVELS.map((level) => `<option value="${level}" ${(draft.privacy || "极私密") === level ? "selected" : ""}>${level}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="import-status">状态</label>
          <select id="import-status" name="status">
            ${STATUS_TYPES.map((status) => `<option value="${status}" ${(draft.status || "待校对") === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="import-location">地点</label>
          <input id="import-location" name="location" value="${escapeHtml(draft.location || "")}" />
        </div>
        <div class="field">
          <label for="import-people">人物</label>
          <input id="import-people" name="people" value="${escapeHtml(draft.people || "")}" />
        </div>
        <div class="field">
          <label for="import-tags">标签</label>
          <input id="import-tags" name="tags" value="${escapeHtml(draft.tags || "")}" />
        </div>
        <div class="form-actions stacked">
          <span class="muted-text">${state.importAttachments.length ? `已保存 ${state.importAttachments.length} 份原始材料` : "可以先只保存图片，之后再补文字"}</span>
          <button class="primary-button full-width" type="submit">
            <span class="icon" data-icon="save"></span><span>保存导入</span>
          </button>
        </div>
      </aside>
    </form>
  `;
}

function reviewIssueLabels(entry) {
  const labels = [];
  if (entry.importMeta?.bodyMissing || !String(entry.content || "").trim()) labels.push("正文待补");
  if (entry.importMeta?.dateWasYearless || !entry.entryDate) labels.push("日期待核");
  if (!(entry.tags || []).length) labels.push("标签待补");
  if (!(entry.people || []).length) labels.push("人物待补");
  return labels;
}

function reviewEntries() {
  return activeEntries()
    .filter((entry) => entry.status === "待校对")
    .filter((entry) => {
      if (state.reviewFilters.source !== "all" && entry.sourceType !== state.reviewFilters.source) return false;
      const issues = reviewIssueLabels(entry);
      if (state.reviewFilters.issue === "body" && !issues.includes("正文待补")) return false;
      if (state.reviewFilters.issue === "date" && !issues.includes("日期待核")) return false;
      if (state.reviewFilters.issue === "meta" && !issues.some((item) => item === "标签待补" || item === "人物待补")) return false;
      if (state.reviewFilters.issue === "clean" && issues.length) return false;
      return true;
    })
    .sort((a, b) => String(a.entryDate || "").localeCompare(String(b.entryDate || "")));
}

function renderReviewFilters(sources) {
  return `
    <div class="filter-row" aria-label="校对筛选">
      <div class="field compact-field">
        <label class="sr-only" for="review-source">来源</label>
        <select id="review-source" data-review-filter="source">
          <option value="all">全部来源</option>
          ${sources.map((source) => `<option value="${escapeHtml(source)}" ${state.reviewFilters.source === source ? "selected" : ""}>${escapeHtml(source)}</option>`).join("")}
        </select>
      </div>
      <div class="field compact-field">
        <label class="sr-only" for="review-issue">问题</label>
        <select id="review-issue" data-review-filter="issue">
          <option value="all" ${state.reviewFilters.issue === "all" ? "selected" : ""}>全部问题</option>
          <option value="body" ${state.reviewFilters.issue === "body" ? "selected" : ""}>正文待补</option>
          <option value="date" ${state.reviewFilters.issue === "date" ? "selected" : ""}>日期待核</option>
          <option value="meta" ${state.reviewFilters.issue === "meta" ? "selected" : ""}>人物/标签待补</option>
          <option value="clean" ${state.reviewFilters.issue === "clean" ? "selected" : ""}>可直接入库</option>
        </select>
      </div>
    </div>
  `;
}

function renderReviewCard(entry) {
  const issues = reviewIssueLabels(entry);
  const issuePills = issues.length
    ? issues.map((issue) => `<span class="pill amber">${escapeHtml(issue)}</span>`).join("")
    : `<span class="pill">可直接入库</span>`;
  const preview = truncate(entry.content, 180) || "正文为空，建议先补充或核对原始材料。";
  return `
    <article class="entry-card review-card">
      <div class="entry-date-block">
        <strong>${String(entry.entryDate || "").slice(8, 10) || "--"}</strong>
        <span>${String(entry.entryDate || "").slice(5, 7) ? `${Number(String(entry.entryDate).slice(5, 7))}月` : "未标"}</span>
        <em>${escapeHtml(String(entry.entryDate || "").slice(0, 4) || "日期")}</em>
      </div>
      <div class="entry-card-main">
        <div class="entry-card-head">
          <div>
            <h3>${escapeHtml(entry.title)}</h3>
            <div class="entry-date">${dateLabel(entry.entryDate)} · ${escapeHtml(entry.sourceType || "未知来源")}</div>
          </div>
          <span class="pill amber">待校对</span>
        </div>
        <p class="entry-preview">${escapeHtml(preview)}</p>
        <div class="tag-row">
          ${issuePills}
          ${(entry.tags || []).slice(0, 4).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
        </div>
        <div class="entry-actions">
          <button class="primary-button" data-action="confirm-entry" data-id="${entry.id}" type="button">
            <span class="icon" data-icon="check"></span><span>确认入库</span>
          </button>
          <button class="ghost-button" data-action="view-entry" data-id="${entry.id}" type="button">查看</button>
          <button class="quiet-button" data-action="edit-entry" data-id="${entry.id}" type="button">
            <span class="icon" data-icon="edit"></span><span>编辑</span>
          </button>
          <button class="danger-button" data-action="delete-entry" data-id="${entry.id}" type="button">
            <span class="icon" data-icon="trash"></span><span>移入回收站</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderDuplicateMiniEntry(entry) {
  const preview = truncate(entry.content, 130) || "正文为空";
  return `
    <div class="duplicate-entry">
      <strong>${escapeHtml(entry.title || "未命名日记")}</strong>
      <span>${dateLabel(entry.entryDate)} · ${escapeHtml(entry.sourceType || "未知来源")}</span>
      <p>${escapeHtml(preview)}</p>
    </div>
  `;
}

function renderDuplicateCandidate(candidate) {
  const reasonPills = candidate.reasons.map((reason) => `<span class="pill amber">${escapeHtml(reason)}</span>`).join("");
  return `
    <article class="duplicate-item">
      <div class="duplicate-item-head">
        <div>
          <h3>疑似重复</h3>
          <p>${reasonPills || `<span class="pill">需要人工确认</span>`}</p>
        </div>
        <span class="pill">匹配度 ${candidate.score}</span>
      </div>
      <div class="duplicate-sides">
        ${renderDuplicateMiniEntry(candidate.left)}
        ${renderDuplicateMiniEntry(candidate.right)}
      </div>
      <div class="entry-actions">
        <button class="primary-button" data-action="merge-duplicate" data-left="${escapeHtml(candidate.left.id)}" data-right="${escapeHtml(candidate.right.id)}" type="button">
          <span class="icon" data-icon="check"></span><span>合并</span>
        </button>
        <button class="ghost-button" data-action="ignore-duplicate" data-left="${escapeHtml(candidate.left.id)}" data-right="${escapeHtml(candidate.right.id)}" type="button">
          不是重复
        </button>
      </div>
    </article>
  `;
}

function renderDuplicatePanel(candidates) {
  return `
    <section class="archive-main duplicate-panel">
      <div class="section-heading">
        <div>
          <h2>疑似重复</h2>
          <p>${candidates.length ? `发现 ${candidates.length} 组需要你确认的记录` : "暂未发现明显重复记录"}</p>
        </div>
      </div>
      <div class="duplicate-list">
        ${
          candidates.length
            ? candidates.map(renderDuplicateCandidate).join("")
            : `<div class="empty-state compact-empty"><h3>没有重复候选</h3><p>系统会继续在导入和整理后自动检查。</p></div>`
        }
      </div>
    </section>
  `;
}

function renderReview() {
  const pending = activeEntries().filter((entry) => entry.status === "待校对");
  const entries = reviewEntries();
  const duplicateCandidates = findDuplicateCandidates();
  const sources = [...new Set(pending.map((entry) => entry.sourceType || "未知来源"))].sort((a, b) => a.localeCompare(b, "zh"));
  const bodyMissing = pending.filter((entry) => reviewIssueLabels(entry).includes("正文待补")).length;
  const dateIssues = pending.filter((entry) => reviewIssueLabels(entry).includes("日期待核")).length;
  const ready = pending.filter((entry) => !reviewIssueLabels(entry).length).length;
  const notice = state.importNotice
    ? `<div class="form-message ${state.importNotice.type === "error" ? "error" : "success"}">${escapeHtml(state.importNotice.text)}</div>`
    : "";

  app.innerHTML = `
    <div class="view-header">
      <div>
        <h2>校对台</h2>
        <p>${pending.length ? `${pending.length} 篇旧日记等待确认` : "旧日记都已确认入库"}</p>
      </div>
      <div class="topbar-actions">
        <button class="ghost-button" data-action="restore-qq-notepad" type="button">
          <span class="icon" data-icon="archive"></span><span>恢复 QQ 记事本日记</span>
        </button>
        <button class="primary-button" data-action="confirm-review-visible" type="button" ${entries.length ? "" : "disabled"}>
          <span class="icon" data-icon="check"></span><span>确认当前列表</span>
        </button>
      </div>
    </div>
    ${notice}
    <section class="desk-panel review-summary">
      <div class="desk-metrics">
        <div><strong>${pending.length}</strong><span>待校对</span></div>
        <div><strong>${bodyMissing}</strong><span>正文待补</span></div>
        <div><strong>${dateIssues}</strong><span>日期待核</span></div>
        <div><strong>${ready}</strong><span>可入库</span></div>
        <div><strong>${duplicateCandidates.length}</strong><span>疑似重复</span></div>
      </div>
    </section>
    ${renderDuplicatePanel(duplicateCandidates)}
    <section class="archive-main">
      <div class="section-heading">
        <div>
          <h2>待校对队列</h2>
          <p>${entries.length ? `当前筛选 ${entries.length} 篇` : "没有符合条件的记录"}</p>
        </div>
      </div>
      ${renderReviewFilters(sources)}
      <div class="entry-list">
        ${
          entries.length
            ? entries.map(renderReviewCard).join("")
            : `<div class="empty-state"><h3>没有待处理记录</h3><p>换个筛选条件，或去历史导入里补充旧材料。</p></div>`
        }
      </div>
    </section>
  `;
}

function collectImportDraft() {
  const form = document.querySelector("#import-form");
  if (!form) return state.importDraft;
  const data = Object.fromEntries(new FormData(form).entries());
  state.importDraft = { ...state.importDraft, ...data };
  return state.importDraft;
}

function saveImportFromDraft() {
  const draft = collectImportDraft();
  const now = new Date().toISOString();
  const entryDate = draft.entryDate || todayStr();
  const content = draft.correctedText?.trim() || draft.rawText?.trim() || "";
  const entry = {
    id: uid(),
    title: draft.title?.trim() || `${dateLabel(entryDate)}的旧日记`,
    entryDate,
    content,
    mood: "",
    weather: "",
    location: draft.location || "",
    people: splitList(draft.people),
    tags: splitList(draft.tags),
    privacy: draft.privacy || "极私密",
    sourceType: draft.sourceType || "纸质日记照片",
    status: draft.status || "待校对",
    futureOpenDate: "",
    attachments: [...state.importAttachments],
    importMeta: {
      rawText: draft.rawText || "",
      correctedText: draft.correctedText || ""
    },
    createdAt: now,
    updatedAt: now
  };
  entry.qqSync = defaultQQSyncMeta(entry, now);
  entry.analysis = analyzeEntry(entry);
  state.entries.push(entry);
  saveEntries("历史导入");
  state.importDraft = {};
  state.importAttachments = [];
  state.selectedId = entry.id;
  state.view = "detail";
  render();
}

function formatQQSyncText(entry) {
  const title = entry.title || `${dateLabel(entry.entryDate)}的日记`;
  const meta = [
    `日期：${dateLabel(entry.entryDate)}`,
    entry.mood ? `心情：${entry.mood}` : "",
    entry.weather ? `天气：${entry.weather}` : "",
    entry.location ? `地点：${entry.location}` : "",
    (entry.people || []).length ? `人物：${joinList(entry.people)}` : "",
    (entry.tags || []).length ? `标签：${joinList(entry.tags)}` : ""
  ].filter(Boolean);
  const body = String(entry.content || "").trim() || "（无正文）";
  return `${title}\n\n${meta.join("\n")}\n\n${body}`;
}

function filteredQQSyncEntries() {
  const entries = sortEntriesByDate(activeEntries(), "desc");
  if (state.qqSyncFilter === "all") return entries;
  return entries.filter((entry) => getQQSyncStatus(entry) === state.qqSyncFilter);
}

function qqSyncMetaText(entry) {
  const sync = entry.qqSync || {};
  const items = [];
  if (sync.lastCopiedAt) items.push(`最近复制：${dateTimeLabel(sync.lastCopiedAt)}`);
  if (sync.syncedAt) items.push(`同步确认：${dateTimeLabel(sync.syncedAt)}`);
  if (sync.failedAt) items.push(`失败记录：${dateTimeLabel(sync.failedAt)}`);
  if (sync.staleSince) items.push(`修改待同步：${dateTimeLabel(sync.staleSince)}`);
  if (sync.note) items.push(sync.note);
  if (!items.length && entry.sourceType === "QQ邮箱记事本") items.push("来自 QQ 记事本导入");
  return items.length ? items.join(" · ") : "还没有同步记录";
}

function renderQQSyncFilters() {
  return `
    <div class="sync-toolbar">
      <div class="field compact-field">
        <label class="sr-only" for="qq-sync-filter">同步状态</label>
        <select id="qq-sync-filter" data-qq-sync-filter="status">
          ${QQ_SYNC_FILTERS.map(([value, label]) => `<option value="${value}" ${state.qqSyncFilter === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      <button class="ghost-button" data-action="copy-qq-sync-list" type="button">
        <span class="icon" data-icon="upload"></span><span>复制当前列表</span>
      </button>
    </div>
  `;
}

function renderQQSyncCard(entry) {
  const [year = "", month = "", day = ""] = String(entry.entryDate || "").split("-");
  const info = qqSyncInfo(entry);
  const preview = truncate(entry.content, 150) || "这篇记录没有正文。";
  const status = info.status;
  return `
    <article class="entry-card sync-card ${escapeHtml(status)}">
      <div class="entry-date-block">
        <strong>${day ? Number(day) : "--"}</strong>
        <span>${month ? `${Number(month)}月` : "未标"}</span>
        <em>${escapeHtml(year || "日期")}</em>
      </div>
      <div class="entry-card-main">
        <div class="entry-card-head">
          <div>
            <h3>${escapeHtml(entry.title)}</h3>
            <div class="entry-date">${dateLabel(entry.entryDate)}</div>
          </div>
          ${qqSyncStatusPill(entry)}
        </div>
        <p class="entry-preview">${escapeHtml(preview)}</p>
        <div class="meta-line">
          <span class="pill">${escapeHtml(entry.sourceType || "手动记录")}</span>
          ${entry.mood ? `<span class="pill">${escapeHtml(entry.mood)}</span>` : ""}
          ${entry.privacy ? `<span class="pill rose">${escapeHtml(entry.privacy)}</span>` : ""}
          ${(entry.tags || []).slice(0, 4).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
        </div>
        <div class="sync-meta">${escapeHtml(qqSyncMetaText(entry))}</div>
        <div class="entry-actions">
          <button class="primary-button" data-action="copy-qq-sync-entry" data-id="${entry.id}" type="button">
            <span class="icon" data-icon="upload"></span><span>复制内容</span>
          </button>
          ${status !== "synced" ? `<button class="ghost-button" data-action="mark-qq-sync" data-status="synced" data-id="${entry.id}" type="button">已同步</button>` : ""}
          ${status !== "failed" ? `<button class="quiet-button" data-action="mark-qq-sync" data-status="failed" data-id="${entry.id}" type="button">标记失败</button>` : ""}
          ${status !== "pending" ? `<button class="quiet-button" data-action="mark-qq-sync" data-status="pending" data-id="${entry.id}" type="button">重新同步</button>` : ""}
          ${status !== "skipped" ? `<button class="quiet-button" data-action="mark-qq-sync" data-status="skipped" data-id="${entry.id}" type="button">暂不同步</button>` : ""}
          <button class="ghost-button" data-action="view-entry" data-id="${entry.id}" type="button">查看</button>
        </div>
      </div>
    </article>
  `;
}

function renderQQSync() {
  const stats = buildQQSyncStats();
  const entries = filteredQQSyncEntries();
  const notice = state.qqSyncNotice
    ? `<div class="form-message ${state.qqSyncNotice.type === "error" ? "error" : "success"}">${escapeHtml(state.qqSyncNotice.text)}</div>`
    : "";

  app.innerHTML = `
    <div class="view-header">
      <div>
        <h2>QQ 同步箱</h2>
        <p>把本系统里的日记整理成可粘贴到 QQ 记事本的内容，并保留同步状态</p>
      </div>
      <button class="ghost-button" data-action="back-library" type="button">返回日记库</button>
    </div>

    <section class="desk-panel sync-summary">
      <div class="desk-copy">
        <span class="eyebrow">同步状态</span>
        <h2>${stats.pending ? `${stats.pending} 篇待同步` : "当前没有待同步"}</h2>
        <p>QQ 记事本导入的旧日记默认记为已同步；新写和修改后的日记会进入待同步。</p>
      </div>
      <div class="desk-metrics">
        <div><strong>${stats.pending}</strong><span>待同步</span></div>
        <div><strong>${stats.synced}</strong><span>已同步</span></div>
        <div><strong>${stats.failed}</strong><span>失败</span></div>
      </div>
    </section>

    ${notice}
    ${renderQQSyncFilters()}

    <section class="archive-main">
      <div class="entry-list">
        ${
          entries.length
            ? entries.map(renderQQSyncCard).join("")
            : `<div class="empty-state compact-empty"><h3>这个状态下没有日记</h3><p>切换上方状态，或新写一篇日记后再回来同步。</p></div>`
        }
      </div>
    </section>
  `;
}

function renderDetail() {
  const entry = activeEntries().find((item) => item.id === state.selectedId);
  if (!entry) {
    state.view = "library";
    render();
    return;
  }
  const analysis = entry.analysis || analyzeEntry(entry);
  app.innerHTML = `
    <div class="view-header">
      <div>
        <h2>${escapeHtml(entry.title)}</h2>
        <p>${dateLabel(entry.entryDate)} · ${escapeHtml(entry.sourceType || "手动记录")}</p>
      </div>
      <div class="topbar-actions">
        <button class="ghost-button" data-action="back-library" type="button">返回日记库</button>
        <button class="primary-button" data-action="edit-entry" data-id="${entry.id}" type="button">
          <span class="icon" data-icon="edit"></span><span>编辑</span>
        </button>
        <button class="danger-button" data-action="delete-entry" data-id="${entry.id}" type="button">
          <span class="icon" data-icon="trash"></span><span>删除</span>
        </button>
      </div>
    </div>

    <div class="detail-layout">
      <article class="form-surface">
        <div class="meta-line">
          <span class="pill">${escapeHtml(entry.status || "正式")}</span>
          ${qqSyncStatusPill(entry)}
          ${entry.mood ? `<span class="pill">${escapeHtml(entry.mood)}</span>` : ""}
          ${entry.location ? `<span class="pill plum">${escapeHtml(entry.location)}</span>` : ""}
          <span class="pill rose">${escapeHtml(entry.privacy || "私密")}</span>
        </div>
        <div class="tag-row">
          ${(entry.tags || []).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
          ${(entry.people || []).map((person) => `<span class="pill plum">${escapeHtml(person)}</span>`).join("")}
        </div>
        <div class="detail-body">${escapeHtml(entry.content || "这篇记录还没有正文。")}</div>
        ${renderAttachments(entry.attachments || [], "")}
      </article>

      <aside class="insight-panel">
        <h3>自动整理</h3>
        <div class="analysis-list">
          <div class="analysis-row"><strong>摘要</strong><span>${escapeHtml(analysis.summary)}</span></div>
          <div class="analysis-row"><strong>主题</strong><span>${escapeHtml(analysis.themes.join("，"))}</span></div>
          <div class="analysis-row"><strong>人物</strong><span>${escapeHtml((analysis.people.length ? analysis.people : ["未标注"]).join("，"))}</span></div>
          <div class="analysis-row"><strong>地点</strong><span>${escapeHtml((analysis.places.length ? analysis.places : ["未标注"]).join("，"))}</span></div>
          <div class="analysis-row"><strong>关键词</strong><span>${escapeHtml(analysis.keywords.join("，") || "未形成关键词")}</span></div>
        </div>
        ${
          entry.status === "待校对"
            ? `<button class="primary-button full-width" data-action="confirm-entry" data-id="${entry.id}" type="button"><span class="icon" data-icon="check"></span><span>确认入库</span></button>`
            : ""
        }
      </aside>
    </div>
  `;
}

function groupByTimeline(entries) {
  const grouped = {};
  entries.forEach((entry) => {
    const date = entry.entryDate || "未标日期";
    const year = date.slice(0, 4) || "未标日期";
    const month = date.length >= 7 ? date.slice(5, 7) : "00";
    grouped[year] ||= {};
    grouped[year][month] ||= [];
    grouped[year][month].push(entry);
  });
  return grouped;
}

function renderTimeline() {
  const grouped = groupByTimeline(activeEntries());
  const years = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  app.innerHTML = `
    <div class="view-header">
      <div>
        <h2>时间轴</h2>
        <p>${years.length ? `${years.length} 个年份` : "第一条记录出现后，这里会自动展开"}</p>
      </div>
      <button class="primary-button" data-action="new-entry" type="button">
        <span class="icon" data-icon="plus"></span><span>写一篇</span>
      </button>
    </div>
    ${
      years.length
        ? `<div class="timeline">${years
            .map(
              (year) => `
              <section class="year-block">
                <div class="year-label">${escapeHtml(year)}</div>
                <div class="month-stack">
                  ${Object.keys(grouped[year])
                    .sort((a, b) => b.localeCompare(a))
                    .map(
                      (month) => `
                        <div class="month-block">
                          <h3>${month === "00" ? "未标月份" : `${Number(month)}月`}</h3>
                          <div class="month-links">
                            ${grouped[year][month]
                              .map(
                                (entry) => `
                                  <button class="text-link" data-action="view-entry" data-id="${entry.id}" type="button">
                                    ${escapeHtml(entry.entryDate || "")} · ${escapeHtml(entry.title)}
                                  </button>
                                `
                              )
                              .join("")}
                          </div>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              </section>
            `
            )
            .join("")}</div>`
        : renderEmptyState()
    }
  `;
}

function countItems(items) {
  const counts = new Map();
  items.filter(Boolean).forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"));
}

function renderBars(items) {
  if (!items.length) return `<p class="muted-text">还没有形成稳定记录。</p>`;
  const max = Math.max(...items.map(([, count]) => count), 1);
  return `
    <div class="bar-list">
      ${items
        .slice(0, 7)
        .map(
          ([name, count]) => `
          <div class="bar-row">
            <span>${escapeHtml(name)}</span>
            <div class="bar-track"><div class="bar-fill" style="width: ${(count / max) * 100}%"></div></div>
            <strong>${count}</strong>
          </div>
        `
        )
        .join("")}
    </div>
  `;
}

function entryYear(entry) {
  const year = String(entry.entryDate || "").slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "未标年份";
}

function entryTimestamp(entry) {
  const value = Date.parse(entry.entryDate || "");
  return Number.isNaN(value) ? 0 : value;
}

function sortEntriesByDate(entries, direction = "desc") {
  return [...entries].sort((a, b) => {
    const result = entryTimestamp(a) - entryTimestamp(b);
    return direction === "asc" ? result : -result;
  });
}

function dateRangeText(entries) {
  const dated = sortEntriesByDate(entries.filter((entry) => entry.entryDate), "asc");
  if (!dated.length) return "未形成时间跨度";
  const first = dated[0].entryDate;
  const last = dated[dated.length - 1].entryDate;
  return first === last ? dateLabel(first) : `${dateLabel(first)} - ${dateLabel(last)}`;
}

function entriesMatchingTheme(entries, theme) {
  return entries.filter((entry) => (entry.analysis || analyzeEntry(entry)).themes.includes(theme));
}

function renderEvidenceLinks(entries, limit = 3) {
  const items = sortEntriesByDate(entries, "desc").slice(0, limit);
  if (!items.length) return `<p class="muted-text">暂无可回看的来源日记。</p>`;
  return `
    <div class="evidence-links">
      ${items
        .map(
          (entry) => `
            <button class="text-link evidence-link" data-action="view-entry" data-id="${entry.id}" type="button">
              <strong>${escapeHtml(entry.title || "未命名日记")}</strong>
              <span>${dateLabel(entry.entryDate)} · ${escapeHtml(entry.sourceType || "日记")}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function evidenceLine(entry) {
  return `- ${dateLabel(entry.entryDate)}《${entry.title || "未命名日记"}》`;
}

function evidenceBlock(entries, limit = 4) {
  const items = sortEntriesByDate(entries, "desc").slice(0, limit);
  return items.length ? items.map(evidenceLine).join("\n") : "- 暂无可回看的来源日记";
}

function themeReviewText(theme) {
  const copy = {
    工作: "工作和责任相关内容占比高，适合继续梳理哪些事情带来成就感，哪些事情长期消耗你。",
    家庭: "家庭线索比较稳定，可以回看亲情、责任和安全感在不同阶段怎样影响你的选择。",
    健康: "健康反复出现时，值得把睡眠、精力和身体信号作为未来决策的前置条件。",
    学习: "学习和成长是长期线索，可以提炼出你最有效的自我提升方式。",
    关系: "关系主题较多时，适合看清哪些连接支持你，哪些关系容易带来反复拉扯。",
    旅行: "旅行和地点变化可能对应着放松、逃离、探索或阶段转换，可以单独整理成生活补给线。",
    理想: "理想和选择相关内容适合拿来校准未来方向：哪些目标曾经重要，现在是否仍然重要。",
    情绪: "情绪线索适合拿来识别高压情境，以及你过去真正有效的恢复方式。",
    日常: "大量日常记录能说明你对细节和生活秩序的感受，这些常常是长期状态的底色。"
  };
  return copy[theme] || "这个主题在日记中多次出现，值得继续归档成一条长期线索。";
}

function findTurningPoints(entries) {
  const keywords = [
    "毕业",
    "高考",
    "大学",
    "工作",
    "入职",
    "辞职",
    "离职",
    "调动",
    "升职",
    "创业",
    "结婚",
    "恋爱",
    "分手",
    "搬家",
    "买房",
    "生病",
    "住院",
    "父亲",
    "母亲",
    "去世",
    "出生",
    "考试",
    "决定",
    "选择",
    "未来",
    "目标"
  ];

  return entries
    .map((entry) => {
      const text = `${entry.title || ""}\n${entry.content || ""}\n${(entry.tags || []).join(" ")}`;
      const hits = keywords.filter((word) => text.includes(word));
      const score = hits.length * 18 + Math.min(String(entry.content || "").length / 260, 16) + (entry.status === "正式" ? 2 : 0);
      return { entry, hits, score };
    })
    .filter((item) => item.hits.length)
    .sort((a, b) => b.score - a.score || entryTimestamp(b.entry) - entryTimestamp(a.entry))
    .slice(0, 8);
}

function buildYearReviews(entries) {
  const grouped = {};
  entries.forEach((entry) => {
    const year = entryYear(entry);
    grouped[year] ||= [];
    grouped[year].push(entry);
  });

  return Object.entries(grouped)
    .map(([year, yearEntries]) => {
      const analyses = yearEntries.map((entry) => entry.analysis || analyzeEntry(entry));
      return {
        year,
        entries: sortEntriesByDate(yearEntries, "desc"),
        themes: countItems(analyses.flatMap((analysis) => analysis.themes)).slice(0, 3),
        moods: countItems(yearEntries.map((entry) => entry.mood)).slice(0, 2),
        people: countItems(yearEntries.flatMap((entry) => entry.people || [])).slice(0, 3)
      };
    })
    .sort((a, b) => b.year.localeCompare(a.year));
}

function buildPeopleReviews(entries) {
  return countItems(entries.flatMap((entry) => entry.people || []))
    .slice(0, 8)
    .map(([person, count]) => {
      const related = entries.filter((entry) => (entry.people || []).includes(person));
      return {
        person,
        count,
        range: dateRangeText(related),
        entries: related
      };
    });
}

function entryReviewText(entry) {
  const analysis = entry.analysis || analyzeEntry(entry);
  return `${entry.title || ""}\n${entry.content || ""}\n${(entry.tags || []).join(" ")}\n${(entry.people || []).join(" ")}\n${analysis.themes.join(" ")}`;
}

function yearReviewSentence(stage) {
  const topTheme = stage.themes[0]?.[0] || "日常";
  const topMood = stage.moods[0]?.[0] || "未标注";
  const topPeople = stage.people.slice(0, 2).map(([person]) => person);
  const peopleText = topPeople.length ? `，经常出现的人物是 ${topPeople.join("、")}` : "";
  return `这一年主要围绕“${topTheme}”展开，常见状态是“${topMood}”${peopleText}。`;
}

function patternDefinitions() {
  return [
    {
      key: "work-pressure",
      title: "工作压力与责任",
      words: ["工作", "项目", "任务", "领导", "汇报", "加班", "压力", "疲惫", "忙"],
      advice: "未来遇到类似阶段时，不只看任务量，也要提前给精力、边界和恢复时间留位置。"
    },
    {
      key: "direction-choice",
      title: "方向、选择与未来感",
      words: ["方向", "选择", "未来", "目标", "理想", "决定", "迷茫", "坚持"],
      advice: "做重要选择时，先回到长期目标，再判断这件事是在靠近目标，还是只是在消耗注意力。"
    },
    {
      key: "body-energy",
      title: "身体和精力信号",
      words: ["身体", "睡眠", "失眠", "医院", "生病", "疲惫", "累", "健康"],
      advice: "身体反复提醒时，应该把休息和健康放到决策前置条件里，而不是等到撑不住再处理。"
    },
    {
      key: "relationship-boundary",
      title: "关系牵动与边界",
      words: ["朋友", "同学", "关系", "争执", "委屈", "聊天", "喜欢", "感情"],
      advice: "关系里的感受值得被看见，也适合区分哪些连接在支持你，哪些连接让你长期内耗。"
    },
    {
      key: "family-responsibility",
      title: "家庭责任与牵挂",
      words: ["父亲", "母亲", "爸", "妈", "家庭", "亲人", "春节", "家"],
      advice: "家庭是重要底色。未来做选择时，可以同时看责任、亲密感和你自己的生活节奏。"
    }
  ];
}

function buildRepeatedPatterns(entries) {
  return patternDefinitions()
    .map((definition) => {
      const matches = entries.filter((entry) => {
        const text = entryReviewText(entry);
        return definition.words.some((word) => text.includes(word));
      });
      const years = new Set(matches.map(entryYear));
      return {
        ...definition,
        count: matches.length,
        years: [...years].filter((year) => year !== "未标年份").sort((a, b) => a.localeCompare(b)),
        entries: matches
      };
    })
    .filter((pattern) => pattern.count >= 2 || pattern.years.length >= 2)
    .sort((a, b) => b.years.length - a.years.length || b.count - a.count)
    .slice(0, 5);
}

function noteThemeLabel(entry) {
  const themes = (entry.analysis || analyzeEntry(entry)).themes;
  if (themes.includes("工作")) return "面对责任";
  if (themes.includes("健康")) return "照顾身体";
  if (themes.includes("理想")) return "校准方向";
  if (themes.includes("家庭")) return "安放家庭";
  if (themes.includes("关系")) return "处理关系";
  if (themes.includes("学习")) return "继续成长";
  return "回看自己";
}

function noteAdviceText(entry) {
  const themes = (entry.analysis || analyzeEntry(entry)).themes;
  if (themes.includes("工作")) return "过去的记录提醒你：工作重要，但不要把所有价值感都押在任务完成上。";
  if (themes.includes("健康")) return "过去的记录提醒你：身体状态不是背景音，它会直接影响判断力和耐心。";
  if (themes.includes("理想")) return "过去的记录提醒你：真正重要的目标会反复出现，值得定期拿出来校准。";
  if (themes.includes("家庭")) return "过去的记录提醒你：家庭牵挂很重要，但你的节奏和边界也需要被照顾。";
  if (themes.includes("关系")) return "过去的记录提醒你：让你变松弛的关系要珍惜，让你长期紧绷的关系要看清。";
  if (themes.includes("学习")) return "过去的记录提醒你：你一直有通过学习重新整理自己的能力。";
  return "这篇日记可以作为一个旧坐标，帮你判断现在的处境是不是又回到了熟悉的问题。";
}

function buildPastSelfNotes(entries) {
  const reflectiveWords = ["明白", "觉得", "应该", "以后", "决定", "坚持", "目标", "方向", "选择", "值得", "不要", "希望", "未来"];
  const steadyMoods = ["平静", "开心", "期待", "感激"];
  return entries
    .map((entry) => {
      const text = entryReviewText(entry);
      const wordScore = reflectiveWords.filter((word) => text.includes(word)).length * 12;
      const moodScore = steadyMoods.includes(entry.mood) ? 12 : 0;
      const lengthScore = Math.min(String(entry.content || "").length / 160, 10);
      return {
        entry,
        score: wordScore + moodScore + lengthScore + (entry.status === "正式" ? 3 : 0)
      };
    })
    .filter((item) => item.score > 6)
    .sort((a, b) => b.score - a.score || entryTimestamp(b.entry) - entryTimestamp(a.entry))
    .slice(0, 6)
    .map(({ entry }) => ({
      title: noteThemeLabel(entry),
      text: noteAdviceText(entry),
      entry
    }));
}

function buildLifeSuggestions(entries, themeCounts, moodCounts, peopleReviews, turningPoints) {
  const suggestions = [];
  const add = (title, text, evidence) => suggestions.push({ title, text, evidence: evidence || [] });
  const topTheme = themeCounts[0];
  const pressureMoods = ["低落", "焦虑", "疲惫", "愤怒", "复杂"];
  const steadyMoods = ["平静", "开心", "期待", "感激"];
  const pressureCount = moodCounts.filter(([mood]) => pressureMoods.includes(mood)).reduce((sum, [, count]) => sum + count, 0);
  const steadyCount = moodCounts.filter(([mood]) => steadyMoods.includes(mood)).reduce((sum, [, count]) => sum + count, 0);
  const pending = entries.filter((entry) => entry.status === "待校对").length;

  if (topTheme) {
    add(
      "先复盘最稳定的主题",
      `“${topTheme[0]}”出现了 ${topTheme[1]} 次。它很可能不是偶然事件，而是你长期生活里反复回到的议题。`,
      entriesMatchingTheme(entries, topTheme[0])
    );
  }
  if (pressureCount >= Math.max(3, entries.length * 0.16)) {
    add(
      "给未来留一个减压预案",
      `低落、焦虑、疲惫等状态共出现 ${pressureCount} 次。可以回看这些日记，找出当时的触发点和真正有效的恢复方式。`,
      entries.filter((entry) => pressureMoods.includes(entry.mood))
    );
  } else if (steadyCount) {
    add(
      "把稳定感变成可复用的方法",
      `平静、开心、期待、感激等状态共出现 ${steadyCount} 次。可以从这些日记里提炼出让你恢复能量的人、事和环境。`,
      entries.filter((entry) => steadyMoods.includes(entry.mood))
    );
  }
  if (peopleReviews[0]) {
    add(
      "整理重要关系的影响",
      `“${peopleReviews[0].person}”在 ${peopleReviews[0].count} 篇日记里出现。可以看一看这段关系在不同阶段给你带来的支持、牵动或提醒。`,
      peopleReviews[0].entries
    );
  }
  if (turningPoints.length) {
    add(
      "把关键节点串成一条线",
      "系统识别到一些可能的选择、变化或人生节点。把它们按时间读一遍，往往能看见你真正的成长路径。",
      turningPoints.map((item) => item.entry)
    );
  }
  if (pending) {
    add(
      "先补齐旧日记的校对",
      `还有 ${pending} 篇旧日记处于待校对状态。旧资料越完整，复盘结论会越可靠。`,
      entries.filter((entry) => entry.status === "待校对")
    );
  }
  if (!suggestions.length) {
    add("先继续积累材料", "当日记数量更多、日期和人物标签更完整后，这里会自动形成更清晰的人生线索。", entries);
  }

  return suggestions.slice(0, 5);
}

function joinQuoted(items) {
  return items.length ? `“${items.join("”“")}”` : "";
}

function buildLifeConclusion(entries, themeCounts, moodCounts, peopleReviews, yearReviews, repeatedPatterns, turningPoints) {
  const topThemes = themeCounts.slice(0, 3).map(([theme]) => theme);
  const topThemeText = topThemes.length ? joinQuoted(topThemes) : "日常经验";
  const newestStage = yearReviews[0];
  const oldestStage = yearReviews.at(-1);
  const newestTheme = newestStage?.themes?.[0]?.[0] || "";
  const oldestTheme = oldestStage?.themes?.[0]?.[0] || "";
  const pressureMoods = ["低落", "焦虑", "疲惫", "愤怒", "复杂"];
  const steadyMoods = ["平静", "开心", "期待", "感激"];
  const pressureEntries = entries.filter((entry) => pressureMoods.includes(entry.mood));
  const steadyEntries = entries.filter((entry) => steadyMoods.includes(entry.mood));
  const strongestPattern = repeatedPatterns[0];
  const strongestPerson = peopleReviews[0];
  const topThemeEntries = topThemes.flatMap((theme) => entriesMatchingTheme(entries, theme));

  const stageText =
    oldestStage && newestStage && oldestStage.year !== newestStage.year
      ? `从 ${oldestStage.year} 年的“${oldestTheme || "日常"}”到 ${newestStage.year} 年的“${newestTheme || "日常"}”，可以看到关注点在持续变化，但有些核心议题一直在回来。`
      : "当前资料已经能形成初步主线，继续补齐年份和正文后，阶段变化会更清楚。";

  const summary = `这批日记的价值不只是保存回忆，而是让你看到自己长期围绕 ${topThemeText} 反复思考和行动。${stageText}`;

  const findings = [
    {
      title: "长期主线",
      text: topThemes.length
        ? `${topThemeText} 是最稳定的主题。它们说明这些年真正牵动你的，不是单点事件，而是一组长期议题。`
        : "主题还不够集中，继续补正文和标签后会更清楚。",
      evidence: topThemeEntries
    },
    {
      title: "可依靠的资源",
      text: strongestPerson
        ? `“${strongestPerson.person}”等人物反复出现，说明重要关系会持续影响你的判断、情绪和选择。`
        : steadyEntries.length
          ? `平静、开心、期待、感激等状态出现过 ${steadyEntries.length} 次，可以从这些日记里提炼恢复能量的方法。`
          : "可以继续补人物和心情标签，系统会逐步识别你的支持来源。",
      evidence: strongestPerson ? strongestPerson.entries : steadyEntries
    },
    {
      title: "需要提前防范",
      text: strongestPattern
        ? `“${strongestPattern.title}”跨多个阶段出现，未来遇到类似处境时要提前设边界、留余地，而不是事后补救。`
        : pressureEntries.length
          ? `低落、焦虑、疲惫等状态出现过 ${pressureEntries.length} 次，建议回看触发点和恢复方式。`
          : "目前没有明显反复消耗模式，这是好事；后续可以继续观察。",
      evidence: strongestPattern ? strongestPattern.entries : pressureEntries
    }
  ];

  const recommendations = [
    {
      title: "把日记当成决策参照",
      text: topThemes.length
        ? `以后遇到和 ${topThemeText} 有关的选择，先回看这些主题下的旧日记，再决定要不要继续投入。`
        : "重要选择前，先查一查过去有没有类似处境，不要只凭当下情绪判断。",
      evidence: topThemeEntries
    },
    {
      title: "建立个人预警清单",
      text: strongestPattern
        ? `把“${strongestPattern.title}”整理成预警项：触发信号是什么、过去怎样恶化、什么办法真的有用。`
        : "从压力和疲惫相关日记里整理出三个早期信号，作为以后提醒自己的清单。",
      evidence: strongestPattern ? strongestPattern.entries : pressureEntries
    },
    {
      title: "把复盘变成固定动作",
      text: "每月只做一件事：选 3 篇代表日记，写下当时的处境、选择、结果和今天的看法。这样十几年记录才会转化成经验。",
      evidence: turningPoints.map((item) => item.entry)
    }
  ];

  const actions = [
    {
      time: "本周",
      text: "先看“反复踩坑提醒”的第一组证据，写下触发点、当时反应、后来结果。"
    },
    {
      time: "本月",
      text: "挑一个高频主题，整理成一页个人专题：我为什么在意它，它给我带来什么，又消耗什么。"
    },
    {
      time: "今年",
      text: "把年度总结补成真正的人生年表，每年只保留 3 个关键词和 3 篇代表日记。"
    }
  ];

  return { summary, findings, recommendations, actions };
}

function buildLifeReview(entries) {
  const analyses = entries.map((entry) => entry.analysis || analyzeEntry(entry));
  const themeCounts = countItems(analyses.flatMap((analysis) => analysis.themes));
  const peopleReviews = buildPeopleReviews(entries);
  const moodCounts = countItems(entries.map((entry) => entry.mood));
  const tagCounts = countItems(entries.flatMap((entry) => entry.tags || []));
  const yearReviews = buildYearReviews(entries);
  const turningPoints = findTurningPoints(entries);
  const repeatedPatterns = buildRepeatedPatterns(entries);
  const pastSelfNotes = buildPastSelfNotes(entries);
  const suggestions = buildLifeSuggestions(entries, themeCounts, moodCounts, peopleReviews, turningPoints);
  const conclusion = buildLifeConclusion(entries, themeCounts, moodCounts, peopleReviews, yearReviews, repeatedPatterns, turningPoints);
  const years = allYears();

  return {
    entries,
    conclusion,
    themeCounts,
    peopleReviews,
    moodCounts,
    tagCounts,
    yearReviews,
    turningPoints,
    repeatedPatterns,
    pastSelfNotes,
    suggestions,
    years,
    attachments: entries.reduce((sum, entry) => sum + (entry.attachments || []).length, 0),
    pending: entries.filter((entry) => entry.status === "待校对").length,
    range: dateRangeText(entries)
  };
}

function lifeReportStorageFallback(review) {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entryCount: review.entries.length,
    yearCount: review.years.length,
    content: generateLifeReportText(review)
  };
}

function readLifeReport() {
  try {
    const raw = localStorage.getItem(LIFE_REPORT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLifeReport(report) {
  const payload = {
    ...report,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(LIFE_REPORT_KEY, JSON.stringify(payload));
  queueSharedStorageWrite("人生复盘报告");
  return payload;
}

function readLifeQuestionHistory() {
  try {
    const raw = localStorage.getItem(LIFE_QA_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function saveLifeQuestionHistory(items) {
  try {
    localStorage.setItem(LIFE_QA_KEY, JSON.stringify(items.slice(0, 12)));
    queueSharedStorageWrite("人生问答记录");
  } catch {
    // 问答历史保存失败不影响日记主体数据。
  }
}

function lifeReportTitle(review) {
  const years = review.years.length ? `${review.years.at(-1)}-${review.years[0]}` : "未标年份";
  return `人生复盘报告（${years}）`;
}

function generateLifeReportText(review) {
  const title = lifeReportTitle(review);
  const topThemes = review.themeCounts.slice(0, 5);
  const topPeople = review.peopleReviews.slice(0, 5);
  const topYears = review.yearReviews.slice(0, 8);
  const turningPoints = review.turningPoints.slice(0, 8);
  const patterns = review.repeatedPatterns.slice(0, 5);
  const pastNotes = review.pastSelfNotes.slice(0, 5);
  const generatedAt = dateTimeLabel(new Date().toISOString());

  const section = (name, body) => `\n## ${name}\n${body.trim()}\n`;
  const findingText = review.conclusion.findings
    .map((item, index) => `${index + 1}. ${item.title}：${item.text}\n证据：\n${evidenceBlock(item.evidence, 3)}`)
    .join("\n\n");
  const recommendationText = review.conclusion.recommendations
    .map((item, index) => `${index + 1}. ${item.title}：${item.text}\n证据：\n${evidenceBlock(item.evidence, 3)}`)
    .join("\n\n");
  const actionText = review.conclusion.actions.map((item) => `- ${item.time}：${item.text}`).join("\n");
  const yearlyText = topYears
    .map((stage) => {
      const themes = stage.themes.map(([theme, count]) => `${theme}${count}`).join("、") || "未形成主题";
      return `- ${stage.year}：${yearReviewSentence(stage)} 关键词：${themes}\n  代表日记：\n${evidenceBlock(stage.entries, 2)
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")}`;
    })
    .join("\n\n");
  const patternText = patterns.length
    ? patterns
        .map((pattern, index) => `${index + 1}. ${pattern.title}：${pattern.advice}\n出现范围：${pattern.years.length ? `${pattern.years[0]}-${pattern.years.at(-1)}` : "年份待补"}，共 ${pattern.count} 篇。\n证据：\n${evidenceBlock(pattern.entries, 3)}`)
        .join("\n\n")
    : "当前还没有足够证据形成稳定的反复模式。";
  const turningText = turningPoints.length
    ? turningPoints
        .map((item, index) => `${index + 1}. ${dateLabel(item.entry.entryDate)}《${item.entry.title || "未命名日记"}》：可能涉及 ${item.hits.slice(0, 5).join("、")}。`)
        .join("\n")
    : "当前还没有识别到明显转折点。";
  const relationText = topPeople.length
    ? topPeople.map((item, index) => `${index + 1}. ${item.person}：出现 ${item.count} 篇，时间范围 ${item.range}。\n证据：\n${evidenceBlock(item.entries, 2)}`).join("\n\n")
    : "人物标注还不够，暂时无法形成清晰关系线索。";
  const pastSelfText = pastNotes.length
    ? pastNotes.map((note, index) => `${index + 1}. ${note.title}：${note.text}\n来源：${dateLabel(note.entry.entryDate)}《${note.entry.title || "未命名日记"}》`).join("\n\n")
    : "还需要更多带有反思、决定或目标的日记，才能形成更像“过去的我”的提醒。";
  const themeText = topThemes.length
    ? topThemes.map(([theme, count], index) => `${index + 1}. ${theme}：${count} 篇。${themeReviewText(theme)}`).join("\n")
    : "主题还没有形成。";

  return `# ${title}

生成时间：${generatedAt}
覆盖范围：${review.range}
记录数量：${review.entries.length} 篇，涉及 ${review.years.length || 0} 个年份

## 一句话总评
${review.conclusion.summary}

${section("核心发现", findingText)}
${section("人生主线", yearlyText || "年份和日期还不够完整，暂时无法形成清晰主线。")}
${section("长期主题", themeText)}
${section("反复出现的模式", patternText)}
${section("关键转折点", turningText)}
${section("关系线索", relationText)}
${section("过去的我给现在", pastSelfText)}
${section("给现在的建议", recommendationText)}
${section("下一步行动清单", actionText)}
## 备注
这份报告是基于当前已入库日记自动生成的草稿。建议你把不准确的地方删掉，把真正击中的地方补充成自己的判断。`;
}

function ensureLifeReport(options = {}) {
  const review = buildLifeReview(activeEntries());
  const existing = readLifeReport();
  if (existing && !options.force) return existing;
  return saveLifeReport(lifeReportStorageFallback(review));
}

function questionCandidateTerms(question, review) {
  const text = String(question || "");
  const terms = new Set();
  Object.entries(THEME_MAP).forEach(([theme, words]) => {
    if (text.includes(theme)) terms.add(theme);
    words.forEach((word) => {
      if (text.includes(word)) terms.add(word);
    });
  });
  [...MOODS, ...review.peopleReviews.map((item) => item.person), ...review.tagCounts.map(([tag]) => tag)].forEach((item) => {
    if (item && text.includes(item)) terms.add(item);
  });
  String(question || "")
    .split(/[\s,，。！？!?；;：:、（）()【】《》]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !["为什么", "怎么办", "是不是", "有没有", "这些年", "过去的我", "现在的我"].includes(item))
    .forEach((item) => terms.add(item));
  return [...terms];
}

function detectQuestionPeople(question, review) {
  return review.peopleReviews.filter((item) => question.includes(item.person));
}

function detectQuestionThemes(question) {
  return Object.entries(THEME_MAP)
    .filter(([theme, words]) => question.includes(theme) || words.some((word) => question.includes(word)))
    .map(([theme]) => theme);
}

function scoreEntryForQuestion(entry, terms, themes, people, question) {
  const analysis = entry.analysis || analyzeEntry(entry);
  const text = entryReviewText(entry);
  let score = 0;
  terms.forEach((term) => {
    if (!term) return;
    if (text.includes(term)) score += term.length > 2 ? 10 : 7;
  });
  themes.forEach((theme) => {
    if (analysis.themes.includes(theme)) score += 18;
  });
  people.forEach((person) => {
    if ((entry.people || []).includes(person.person)) score += 26;
  });
  if (/焦虑|压力|疲惫|累|低落|难过|烦|撑/.test(question) && ["焦虑", "疲惫", "低落", "复杂"].includes(entry.mood)) score += 16;
  if (/建议|怎么办|未来|现在|提醒/.test(question) && /应该|以后|决定|希望|目标|方向|选择|坚持|不要/.test(text)) score += 14;
  return score;
}

function questionRangeText(entries) {
  const years = [...new Set(entries.map(entryYear).filter((year) => year !== "未标年份"))].sort((a, b) => a.localeCompare(b));
  if (!years.length) return "年份待补";
  return years.length === 1 ? `${years[0]} 年` : `${years[0]}-${years.at(-1)} 年`;
}

function buildLifeQuestionAnswer(question) {
  const cleanQuestion = String(question || "").trim();
  const review = buildLifeReview(activeEntries());
  const terms = questionCandidateTerms(cleanQuestion, review);
  const themes = detectQuestionThemes(cleanQuestion);
  const people = detectQuestionPeople(cleanQuestion, review);
  const scored = review.entries
    .map((entry) => ({ entry, score: scoreEntryForQuestion(entry, terms, themes, people, cleanQuestion) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || entryTimestamp(b.entry) - entryTimestamp(a.entry));
  const evidence = scored.slice(0, 10).map((item) => item.entry);
  const fallbackEvidence = evidence.length ? evidence : review.conclusion.recommendations.flatMap((item) => item.evidence).slice(0, 8);
  const relevant = fallbackEvidence.length ? fallbackEvidence : review.entries.slice(0, 8);
  const relatedAnalyses = relevant.map((entry) => entry.analysis || analyzeEntry(entry));
  const relatedThemes = countItems(relatedAnalyses.flatMap((analysis) => analysis.themes)).slice(0, 3);
  const relatedMoods = countItems(relevant.map((entry) => entry.mood)).slice(0, 3);
  const relatedPeople = countItems(relevant.flatMap((entry) => entry.people || [])).slice(0, 3);
  const matchedPattern = review.repeatedPatterns.find((pattern) => {
    const haystack = `${pattern.title} ${pattern.words.join(" ")}`;
    return terms.some((term) => haystack.includes(term)) || themes.some((theme) => pattern.title.includes(theme));
  });
  const askedAdvice = /建议|怎么办|未来|现在|提醒|选择/.test(cleanQuestion);
  const askedWhy = /为什么|总是|经常|反复|一直/.test(cleanQuestion);
  const askedPerson = people[0];
  const mainTheme = relatedThemes[0]?.[0] || themes[0] || review.themeCounts[0]?.[0] || "日常";
  const range = questionRangeText(relevant);
  const evidenceCount = relevant.length;

  let answer = `我在日记里找到 ${evidenceCount} 篇相关记录，时间主要覆盖 ${range}。`;
  if (askedPerson) {
    answer += `围绕“${askedPerson.person}”，记录显示这段关系不是孤立片段，而是和${relatedThemes.map(([theme]) => `“${theme}”`).join("、") || "你的阶段状态"}交织在一起。`;
  } else if (askedWhy && matchedPattern) {
    answer += `从证据看，问题更像“${matchedPattern.title}”这一类反复模式：它不是某一天突然出现，而是在多个阶段被不同事件触发。`;
  } else if (askedAdvice) {
    answer += `如果把过去的记录当成参照，现在最值得做的是：先确认这个问题属于“${mainTheme}”，再看过去哪些做法有效、哪些做法只是在消耗你。`;
  } else {
    answer += `相关记录最集中在“${mainTheme}”这个主题上，可以先把它当作理解问题的主线。`;
  }

  const findings = [
    relatedThemes.length
      ? `相关记录的高频主题是 ${relatedThemes.map(([theme, count]) => `“${theme}”${count}次`).join("、")}。`
      : "相关记录还没有形成稳定主题。",
    relatedMoods.length
      ? `常见状态是 ${relatedMoods.map(([mood, count]) => `“${mood || "未标注"}”${count}次`).join("、")}。`
      : "心情标注还不够，建议后续补齐。",
    relatedPeople.length
      ? `相关人物包括 ${relatedPeople.map(([person, count]) => `“${person}”${count}次`).join("、")}。`
      : "人物线索还不明显。"
  ];

  const advice = [];
  if (matchedPattern) advice.push(`把“${matchedPattern.title}”作为预警项，写下触发信号、过去的反应、真正有效的处理方式。`);
  if (askedPerson) advice.push(`单独给“${askedPerson.person}”建一页关系复盘：支持、牵动、消耗、边界，各写一句。`);
  if (askedAdvice || !advice.length) advice.push(`挑 3 篇最相关的日记重读，分别标注“当时发生了什么、我怎么判断、结果如何、现在怎么看”。`);
  advice.push(`以后遇到类似问题时，先回到这些证据日记，而不是只凭当下情绪做判断。`);

  return {
    id: uid(),
    question: cleanQuestion,
    answer,
    findings,
    advice: advice.slice(0, 4),
    evidenceIds: relevant.slice(0, 6).map((entry) => entry.id),
    createdAt: new Date().toISOString()
  };
}

function askLifeQuestion(question) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) {
    state.lifeAnswer = {
      id: "empty-question",
      question: "",
      answer: "先输入一个你想问的问题。",
      findings: [],
      advice: [],
      evidenceIds: [],
      createdAt: new Date().toISOString()
    };
    render();
    return;
  }
  const answer = buildLifeQuestionAnswer(cleanQuestion);
  const history = readLifeQuestionHistory();
  saveLifeQuestionHistory([answer, ...history.filter((item) => item.question !== answer.question)]);
  state.lifeQuestion = cleanQuestion;
  state.lifeAnswer = answer;
  state.view = "insights";
  render();
}

function renderLifeOverview(review) {
  const topTheme = review.themeCounts[0]?.[0] || "等待形成";
  const topMood = review.moodCounts[0]?.[0] || "未标注";
  return `
    <section class="life-overview">
      <div class="life-overview-copy">
        <span class="eyebrow">初步画像</span>
        <h2>从 ${review.entries.length} 篇日记里回看自己</h2>
        <p>${escapeHtml(review.range)}。当前先基于日期、主题、人物、心情和关键词做本地复盘，所有判断都可以点回来源日记。</p>
      </div>
      <div class="life-metrics">
        <div><strong>${review.years.length || 0}</strong><span>个年份</span></div>
        <div><strong>${escapeHtml(topTheme)}</strong><span>高频主题</span></div>
        <div><strong>${escapeHtml(topMood)}</strong><span>常见心情</span></div>
        <div><strong>${review.pending}</strong><span>待校对</span></div>
      </div>
    </section>
  `;
}

function renderConclusionPanel(review) {
  return `
    <section class="life-conclusion">
      <div class="conclusion-lead">
        <span class="eyebrow">结论先行</span>
        <h2>这批日记真正有用的地方，是帮你把过去变成判断力</h2>
        <p>${escapeHtml(review.conclusion.summary)}</p>
      </div>
      <div class="conclusion-block">
        <h3>核心发现</h3>
        <div class="conclusion-list">
          ${review.conclusion.findings
            .map(
              (item) => `
                <div class="conclusion-item">
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.text)}</p>
                  ${renderEvidenceLinks(item.evidence, 2)}
                </div>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="conclusion-block">
        <h3>给现在的建议</h3>
        <div class="advice-list">
          ${review.conclusion.recommendations
            .map(
              (item) => `
                <div class="advice-item">
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.text)}</p>
                  ${renderEvidenceLinks(item.evidence, 2)}
                </div>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="conclusion-block action-block">
        <h3>下一步行动</h3>
        <div class="action-list">
          ${review.conclusion.actions
            .map(
              (item) => `
                <div class="action-item">
                  <span>${escapeHtml(item.time)}</span>
                  <p>${escapeHtml(item.text)}</p>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderLifeQuestionEvidence(answer) {
  const ids = new Set(answer.evidenceIds || []);
  const entries = activeEntries().filter((entry) => ids.has(entry.id));
  return renderEvidenceLinks(entries, 6);
}

function renderLifeQuestionPanel(review) {
  const history = readLifeQuestionHistory();
  const answer = state.lifeAnswer || history[0];
  const topPerson = review.peopleReviews[0]?.person || "某个人";
  const quickQuestions = [
    "我这些年为什么总是为工作焦虑？",
    "过去的我会怎么建议现在的我？",
    `我和${topPerson}的关系变化是什么？`,
    "我反复踩过哪些坑？"
  ];
  return `
    <section class="life-qa-panel">
      <div class="life-qa-head">
        <div>
          <span class="eyebrow">问日记</span>
          <h2>把十几年记录当成你的私人参谋</h2>
          <p>输入一个具体问题，系统会从日记里找证据、提炼倾向，再给出可执行建议。</p>
        </div>
      </div>
      <div class="life-qa-box">
        <textarea id="life-question-input" placeholder="例如：我这些年为什么总是为工作焦虑？">${escapeHtml(state.lifeQuestion || "")}</textarea>
        <div class="life-qa-actions">
          <button class="primary-button" data-action="ask-life-question" type="button">
            <span class="icon" data-icon="search"></span><span>提问</span>
          </button>
          ${quickQuestions
            .map(
              (question) => `
                <button class="ghost-button qa-chip" data-action="quick-life-question" data-question="${escapeHtml(question)}" type="button">
                  ${escapeHtml(question)}
                </button>
              `
            )
            .join("")}
        </div>
      </div>
      ${
        answer
          ? `<div class="life-answer">
              <div class="life-answer-main">
                <span class="eyebrow">回答</span>
                <h3>${escapeHtml(answer.question || "待提问")}</h3>
                <p>${escapeHtml(answer.answer)}</p>
              </div>
              ${
                answer.findings?.length
                  ? `<div class="answer-grid">
                      <div>
                        <h4>系统看到的线索</h4>
                        <ul>${answer.findings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
                      </div>
                      <div>
                        <h4>给你的建议</h4>
                        <ul>${(answer.advice || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
                      </div>
                    </div>`
                  : ""
              }
              <div class="answer-evidence">
                <h4>证据日记</h4>
                ${renderLifeQuestionEvidence(answer)}
              </div>
            </div>`
          : ""
      }
      ${
        history.length
          ? `<div class="qa-history">
              <h3>最近提问</h3>
              <div class="qa-history-list">
                ${history
                  .slice(0, 4)
                  .map(
                    (item) => `
                      <button class="text-link qa-history-item" data-action="quick-life-question" data-question="${escapeHtml(item.question)}" type="button">
                        ${escapeHtml(item.question)}
                      </button>
                    `
                  )
                  .join("")}
              </div>
            </div>`
          : ""
      }
    </section>
  `;
}

function renderThemeReview(review) {
  const total = Math.max(review.entries.length, 1);
  return `
    <section class="insight-panel large">
      <div class="panel-head">
        <div>
          <h3>长期主题</h3>
          <p class="muted-text">看你这些年反复回到哪些问题。</p>
        </div>
      </div>
      <div class="life-row-list">
        ${
          review.themeCounts.length
            ? review.themeCounts
                .slice(0, 7)
                .map(([theme, count]) => {
                  const evidence = entriesMatchingTheme(review.entries, theme);
                  return `
                    <div class="life-row">
                      <div class="life-row-head">
                        <div>
                          <strong>${escapeHtml(theme)}</strong>
                          <span>${count} 篇 · 约 ${Math.round((count / total) * 100)}%</span>
                        </div>
                        <div class="bar-track slim"><div class="bar-fill" style="width: ${(count / total) * 100}%"></div></div>
                      </div>
                      <p>${escapeHtml(themeReviewText(theme))}</p>
                      ${renderEvidenceLinks(evidence)}
                    </div>
                  `;
                })
                .join("")
            : `<p class="muted-text">主题还没有形成，继续写几篇后会自动更新。</p>`
        }
      </div>
    </section>
  `;
}

function renderStageReview(review) {
  return `
    <section class="insight-panel large">
      <h3>阶段变化</h3>
      <p class="muted-text">按年份看主题、心情和人物如何变化。</p>
      <div class="stage-list">
        ${review.yearReviews
          .map(
            (stage) => `
              <div class="stage-row">
                <div class="stage-year">
                  <strong>${escapeHtml(stage.year)}</strong>
                  <span>${stage.entries.length} 篇</span>
                </div>
                <div class="stage-main">
                  <div class="tag-row">
                    ${stage.themes.map(([theme]) => `<span class="pill">${escapeHtml(theme)}</span>`).join("")}
                    ${stage.moods.map(([mood]) => `<span class="pill plum">${escapeHtml(mood || "未标注")}</span>`).join("")}
                    ${stage.people.map(([person]) => `<span class="pill amber">${escapeHtml(person)}</span>`).join("")}
                  </div>
                  ${renderEvidenceLinks(stage.entries, 2)}
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSuggestionReview(review) {
  return `
    <section class="insight-panel large">
      <h3>给现在的提醒</h3>
      <div class="suggestion-list">
        ${review.suggestions
          .map(
            (item) => `
              <div class="suggestion-item">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.text)}</p>
                ${renderEvidenceLinks(item.evidence)}
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderAnnualReport(review) {
  return `
    <section class="insight-panel large">
      <div class="panel-head">
        <div>
          <h3>年度总结</h3>
          <p class="muted-text">每一年先形成一句话画像，再点回代表日记。</p>
        </div>
      </div>
      <div class="annual-list">
        ${review.yearReviews
          .map(
            (stage) => `
              <div class="annual-card">
                <div class="annual-year">
                  <strong>${escapeHtml(stage.year)}</strong>
                  <span>${stage.entries.length} 篇</span>
                </div>
                <div class="annual-main">
                  <p>${escapeHtml(yearReviewSentence(stage))}</p>
                  <div class="tag-row">
                    ${stage.themes.map(([theme, count]) => `<span class="pill">${escapeHtml(theme)} ${count}</span>`).join("")}
                    ${stage.moods.map(([mood]) => `<span class="pill plum">${escapeHtml(mood || "未标注")}</span>`).join("")}
                  </div>
                  ${renderEvidenceLinks(stage.entries, 2)}
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderRepeatedPatternReview(review) {
  return `
    <section class="insight-panel large">
      <h3>反复踩坑提醒</h3>
      <p class="muted-text">不是给你贴标签，而是找出多年反复出现、值得提前防范的模式。</p>
      ${
        review.repeatedPatterns.length
          ? `<div class="pattern-list">${review.repeatedPatterns
              .map(
                (pattern) => `
                  <div class="pattern-item">
                    <div class="pattern-head">
                      <div>
                        <strong>${escapeHtml(pattern.title)}</strong>
                        <span>${pattern.count} 篇 · ${pattern.years.length ? `${pattern.years[0]}-${pattern.years.at(-1)}` : "年份待补"}</span>
                      </div>
                      <span class="pill amber">${pattern.years.length || 1} 个阶段</span>
                    </div>
                    <p>${escapeHtml(pattern.advice)}</p>
                    ${renderEvidenceLinks(pattern.entries)}
                  </div>
                `
              )
              .join("")}</div>`
          : `<p class="muted-text">当前还没有足够证据形成“反复模式”。日记正文和日期越完整，这里会越准。</p>`
      }
    </section>
  `;
}

function renderPastSelfReview(review) {
  return `
    <section class="insight-panel large">
      <h3>过去的我给现在</h3>
      <p class="muted-text">从旧日记里挑出更像“提醒”和“经验”的记录。</p>
      ${
        review.pastSelfNotes.length
          ? `<div class="past-note-list">${review.pastSelfNotes
              .map(
                (note) => `
                  <div class="past-note">
                    <span class="pill">${escapeHtml(note.title)}</span>
                    <p>${escapeHtml(note.text)}</p>
                    ${renderEvidenceLinks([note.entry], 1)}
                  </div>
                `
              )
              .join("")}</div>`
          : `<p class="muted-text">还需要更多带有反思、决定或目标的日记，才能形成更像“过去的我”的提醒。</p>`
      }
    </section>
  `;
}

function renderTurningPointReview(review) {
  return `
    <section class="insight-panel">
      <h3>关键节点</h3>
      ${
        review.turningPoints.length
          ? `<div class="turning-list">${review.turningPoints
              .map(
                (item) => `
                  <button class="text-link turning-item" data-action="view-entry" data-id="${item.entry.id}" type="button">
                    <strong>${escapeHtml(item.entry.title || "未命名日记")}</strong>
                    <span>${dateLabel(item.entry.entryDate)} · ${escapeHtml(item.hits.slice(0, 4).join("，"))}</span>
                  </button>
                `
              )
              .join("")}</div>`
          : `<p class="muted-text">还没有识别到明显节点。补全日期、标题和正文后会更准。</p>`
      }
    </section>
  `;
}

function renderPeopleReview(review) {
  return `
    <section class="insight-panel">
      <h3>关系线索</h3>
      ${
        review.peopleReviews.length
          ? `<div class="people-list">${review.peopleReviews
              .map(
                (item) => `
                  <div class="people-row">
                    <div>
                      <strong>${escapeHtml(item.person)}</strong>
                      <span>${item.count} 篇 · ${escapeHtml(item.range)}</span>
                    </div>
                    ${renderEvidenceLinks(item.entries, 1)}
                  </div>
                `
              )
              .join("")}</div>`
          : `<p class="muted-text">人物还没有标注。以后在日记里补人物，关系图谱会更有价值。</p>`
      }
    </section>
  `;
}

function renderCompletenessReview(review) {
  const withContent = review.entries.filter((entry) => String(entry.content || "").trim()).length;
  const withPeople = review.entries.filter((entry) => (entry.people || []).length).length;
  const withTags = review.entries.filter((entry) => (entry.tags || []).length).length;
  return `
    <section class="insight-panel">
      <h3>资料完整度</h3>
      <div class="analysis-list">
        <div class="analysis-row"><strong>有正文</strong><span>${withContent} / ${review.entries.length}</span></div>
        <div class="analysis-row"><strong>有人物</strong><span>${withPeople} / ${review.entries.length}</span></div>
        <div class="analysis-row"><strong>有标签</strong><span>${withTags} / ${review.entries.length}</span></div>
        <div class="analysis-row"><strong>原始材料</strong><span>${review.attachments} 份附件</span></div>
      </div>
      <button class="ghost-button full-width" data-view="review" type="button">去校对台补齐</button>
    </section>
  `;
}

function openLifeReport(options = {}) {
  if (!activeEntries().length) {
    state.importNotice = { type: "error", text: "还没有可生成报告的日记。" };
    state.view = "insights";
    render();
    return;
  }
  ensureLifeReport(options);
  state.view = "lifeReport";
  render();
}

function saveLifeReportFromEditor() {
  const textarea = document.querySelector("#life-report-content");
  const existing = readLifeReport() || ensureLifeReport();
  const content = textarea?.value || "";
  const review = buildLifeReview(activeEntries());
  saveLifeReport({
    ...existing,
    entryCount: review.entries.length,
    yearCount: review.years.length,
    content
  });
  state.lifeReportNotice = { type: "success", text: "报告已保存。" };
  render();
}

function regenerateLifeReport() {
  if (!confirm("重新生成会覆盖当前报告草稿，确定继续？")) return;
  ensureLifeReport({ force: true });
  state.lifeReportNotice = { type: "success", text: "已根据当前日记重新生成报告。" };
  state.view = "lifeReport";
  render();
}

function exportLifeReportText() {
  const textarea = document.querySelector("#life-report-content");
  const report = readLifeReport() || ensureLifeReport();
  const content = textarea?.value || report.content || "";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${lifeReportTitle(buildLifeReview(activeEntries()))}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function renderLifeReport() {
  if (!activeEntries().length) {
    state.view = "insights";
    render();
    return;
  }
  const review = buildLifeReview(activeEntries());
  const report = ensureLifeReport();
  const notice = state.lifeReportNotice
    ? `<div class="form-message ${state.lifeReportNotice.type === "error" ? "error" : "success"}">${escapeHtml(state.lifeReportNotice.text)}</div>`
    : "";
  const updatedAt = report.updatedAt ? dateTimeLabel(report.updatedAt) : "刚刚生成";
  app.innerHTML = `
    <div class="view-header">
      <div>
        <h2>人生复盘报告</h2>
        <p>把十几年日记整理成一份可以修改、保存和导出的报告</p>
      </div>
      <div class="topbar-actions">
        <button class="ghost-button" data-action="back-insights" type="button">返回复盘</button>
        <button class="primary-button" data-action="save-life-report" type="button">
          <span class="icon" data-icon="save"></span><span>保存报告</span>
        </button>
      </div>
    </div>
    ${notice}
    <section class="report-workbench">
      <div class="report-editor-panel">
        <div class="report-editor-head">
          <div>
            <h3>${escapeHtml(lifeReportTitle(review))}</h3>
            <p>最后保存：${escapeHtml(updatedAt)}</p>
          </div>
        </div>
        <textarea id="life-report-content" class="report-editor" spellcheck="false">${escapeHtml(report.content || "")}</textarea>
      </div>
      <aside class="report-side-panel">
        <section class="report-side-card">
          <h3>报告摘要</h3>
          <div class="analysis-list">
            <div class="analysis-row"><strong>记录数量</strong><span>${review.entries.length} 篇</span></div>
            <div class="analysis-row"><strong>时间跨度</strong><span>${escapeHtml(review.range)}</span></div>
            <div class="analysis-row"><strong>高频主题</strong><span>${escapeHtml(review.themeCounts.slice(0, 3).map(([theme]) => theme).join("，") || "等待形成")}</span></div>
            <div class="analysis-row"><strong>反复模式</strong><span>${review.repeatedPatterns.length} 组</span></div>
          </div>
        </section>
        <section class="report-side-card">
          <h3>报告操作</h3>
          <div class="report-actions">
            <button class="primary-button full-width" data-action="save-life-report" type="button">
              <span class="icon" data-icon="save"></span><span>保存报告</span>
            </button>
            <button class="ghost-button full-width" data-action="regenerate-life-report" type="button">
              重新生成
            </button>
            <button class="ghost-button full-width" data-action="print-life-report" type="button">
              <span class="icon" data-icon="download"></span><span>打印/另存 PDF</span>
            </button>
            <button class="ghost-button full-width" data-action="export-life-report" type="button">
              导出 TXT
            </button>
          </div>
        </section>
        <section class="report-side-card">
          <h3>编辑建议</h3>
          <p class="muted-text">先删掉你觉得不准确的判断，再把真正击中的地方补成自己的话。报告不是结论终点，而是帮助你继续理解自己的草稿。</p>
        </section>
      </aside>
    </section>
    <pre class="report-print-content">${escapeHtml(report.content || "")}</pre>
  `;
}

function renderInsights() {
  const entries = activeEntries();
  if (!entries.length) {
    app.innerHTML = `
      <div class="view-header">
        <div>
          <h2>人生复盘</h2>
          <p>日记多起来后，这里会形成长期画像</p>
        </div>
        <button class="primary-button" data-action="new-entry" type="button">
          <span class="icon" data-icon="plus"></span><span>写一篇</span>
        </button>
      </div>
      ${renderEmptyState()}
    `;
    return;
  }

  const review = buildLifeReview(entries);
  app.innerHTML = `
    <div class="view-header">
      <div>
        <h2>人生复盘</h2>
        <p>从十几年日记里看年度总结、长期主题、反复模式和给现在的提醒</p>
      </div>
      <div class="topbar-actions">
        <button class="primary-button" data-action="open-life-report" type="button">
          <span class="icon" data-icon="edit"></span><span>生成报告</span>
        </button>
        <button class="ghost-button" data-action="print-life-report" type="button">
          <span class="icon" data-icon="download"></span><span>打印报告</span>
        </button>
        <button class="ghost-button" data-action="back-library" type="button">返回日记库</button>
      </div>
    </div>
    ${renderConclusionPanel(review)}
    ${renderLifeQuestionPanel(review)}
    ${renderLifeOverview(review)}
    <div class="insight-grid life-grid">
      ${renderAnnualReport(review)}
      ${renderThemeReview(review)}
      ${renderRepeatedPatternReview(review)}
      ${renderPastSelfReview(review)}
      ${renderSuggestionReview(review)}
      ${renderStageReview(review)}
      ${renderTurningPointReview(review)}
      ${renderPeopleReview(review)}
      <section class="insight-panel">
        <h3>心情分布</h3>
        ${renderBars(review.moodCounts)}
      </section>
      <section class="insight-panel">
        <h3>标签线索</h3>
        ${renderBars(review.tagCounts)}
      </section>
      ${renderCompletenessReview(review)}
    </div>
  `;
}

function formatBytes(bytes = 0) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function dateTimeLabel(value) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderSnapshotList(snapshots) {
  if (!snapshots.length) {
    return `<p class="muted-text">还没有自动快照。下一次保存、删除、导入前会自动留下快照。</p>`;
  }
  return `
    <div class="snapshot-list">
      ${snapshots
        .slice(0, 6)
        .map(
          (snapshot) => `
            <div class="snapshot-item">
              <div>
                <strong>${escapeHtml(dateTimeLabel(snapshot.createdAt))}</strong>
                <span>${escapeHtml(snapshot.reason || "自动保护")} · ${snapshot.entryCount || 0} 篇 · QQ ${snapshot.qqCount || 0} 篇 · 手写 ${snapshot.manualCount || 0} 篇 · ${formatBytes(snapshot.byteLength || 0)}</span>
              </div>
              <button class="ghost-button" data-action="restore-data-snapshot" data-id="${escapeHtml(snapshot.id)}" type="button">
                <span class="icon" data-icon="archive"></span><span>恢复</span>
              </button>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function storageEntryCount(key) {
  try {
    const raw = localStorage.getItem(key);
    const entries = raw ? JSON.parse(raw) : [];
    return Array.isArray(entries) ? entries.length : null;
  } catch {
    return null;
  }
}

function renderDataHealth(counts, snapshots) {
  const primaryCount = storageEntryCount(STORAGE_KEY);
  const backupCount = storageEntryCount(STORAGE_BACKUP_KEY);
  const latestSnapshot = snapshots[0];
  const healthItems = [
    {
      label: "主数据",
      value: primaryCount === null ? "异常" : `${primaryCount} 条`,
      tone: primaryCount === null ? "error" : "ok"
    },
    {
      label: "备用数据",
      value: backupCount === null ? "异常" : `${backupCount} 条`,
      tone: backupCount === null || backupCount !== primaryCount ? "warn" : "ok"
    },
    {
      label: "自动快照",
      value: snapshots.length ? `${snapshots.length} 份` : "暂无",
      tone: snapshots.length ? "ok" : "warn"
    },
    {
      label: "最近快照",
      value: latestSnapshot ? dateTimeLabel(latestSnapshot.createdAt) : "暂无",
      tone: latestSnapshot ? "ok" : "warn"
    },
    {
      label: "QQ 记事本",
      value: `${counts.qq} 篇`,
      tone: counts.qq ? "ok" : "warn"
    },
    {
      label: "回收站",
      value: `${counts.deleted} 篇`,
      tone: counts.deleted ? "warn" : "ok"
    }
  ];
  return `
    <div class="health-grid">
      ${healthItems
        .map(
          (item) => `
            <div class="health-item ${item.tone}">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCloudSyncPanel() {
  const config = getCloudSyncConfig();
  const notice = state.cloudSyncNotice
    ? `<div class="form-message ${state.cloudSyncNotice.type === "error" ? "error" : "success"}">${escapeHtml(state.cloudSyncNotice.text)}</div>`
    : "";
  return `
    <section class="archive-panel">
      <h3>云同步</h3>
      <p class="muted-text">${config.enabled ? "已配置云同步。保存、导入、删除后会自动同步到私有接口。" : "配置私有同步接口后，公网手机端和电脑端可以读写同一份日记数据。"}</p>
      ${notice}
      <form id="cloud-sync-form" class="password-settings-form">
        <div class="field">
          <label for="cloud-sync-api">同步接口地址</label>
          <input id="cloud-sync-api" name="api" value="${escapeHtml(config.api)}" placeholder="https://你的-worker.workers.dev" autocomplete="off" />
        </div>
        <div class="field">
          <label for="cloud-sync-token">同步密钥</label>
          <input id="cloud-sync-token" name="token" type="password" placeholder="${config.token ? "已保存，留空则不修改" : "填写 Worker 里设置的 SYNC_TOKEN"}" autocomplete="off" />
        </div>
        <div class="field">
          <label for="cloud-sync-key">端到端加密钥匙</label>
          <input id="cloud-sync-key" name="encryptionKey" type="password" placeholder="${config.encryptionKey ? "已保存，留空则不修改" : "留空则自动生成"}" autocomplete="off" />
        </div>
        <div class="form-actions">
          <span class="muted-text">${config.encrypted ? "云端只保存加密后的日记密文。" : "加密钥匙不会发送到 Cloudflare，只保存在设备上。"}</span>
          <button class="ghost-button" data-action="clear-cloud-sync" type="button">关闭云同步</button>
          <button class="primary-button" type="submit">
            <span class="icon" data-icon="save"></span><span>保存并同步</span>
          </button>
        </div>
      </form>
    </section>
  `;
}

function renderArchive() {
  const notice = state.securityNotice
    ? `<div class="form-message ${state.securityNotice.type === "error" ? "error" : "success"}">${escapeHtml(state.securityNotice.text)}</div>`
    : "";
  const authConfig = getAuthConfig();
  const recoveryReady = hasRecoveryConfig(authConfig);
  const snapshots = readDataSnapshots();
  const counts = entryCounts(state.entries);
  app.innerHTML = `
    <div class="view-header">
      <div>
        <h2>备份</h2>
        <p>把日记数据带走，或者把旧备份导回来</p>
      </div>
      <button class="ghost-button" data-action="back-library" type="button">返回日记库</button>
    </div>
    <section class="archive-panel">
      <h3>数据备份</h3>
      <div class="archive-actions">
        <button class="primary-button" data-action="export-json" type="button">
          <span class="icon" data-icon="download"></span><span>导出备份</span>
        </button>
        <button class="ghost-button" data-action="choose-import-json" type="button">
          <span class="icon" data-icon="upload"></span><span>导入备份</span>
        </button>
        <input class="hidden" id="backup-file" type="file" accept="application/json" />
      </div>
    </section>
    <section class="archive-panel">
      <h3>数据保险箱</h3>
      <p class="muted-text">当前 ${counts.total} 篇，其中 QQ 记事本 ${counts.qq} 篇、手写 ${counts.manual} 篇、回收站 ${counts.deleted} 篇。保存、删除、导入前会自动留下快照。</p>
      <div class="archive-actions">
        <button class="ghost-button" data-action="create-data-snapshot" type="button">
          <span class="icon" data-icon="save"></span><span>立即保存快照</span>
        </button>
      </div>
      ${renderSnapshotList(snapshots)}
    </section>
    <section class="archive-panel">
      <h3>数据体检</h3>
      ${renderDataHealth(counts, snapshots)}
    </section>
    ${renderCloudSyncPanel()}
    <section class="archive-panel security-panel">
      <div class="panel-head">
        <div>
          <h3>密码锁</h3>
          <p class="muted-text">已开启进入密码，找回问题${recoveryReady ? "已设置" : "未设置"}。</p>
        </div>
        <button class="ghost-button" data-action="lock-now" type="button">
          <span class="icon" data-icon="lock"></span><span>立即锁定</span>
        </button>
      </div>
      ${notice}
      <form id="password-change-form" class="password-settings-form">
        <div class="field">
          <label for="current-password">当前密码</label>
          <input id="current-password" name="currentPassword" type="password" autocomplete="current-password" />
        </div>
        <div class="field">
          <label for="new-password">新密码</label>
          <input id="new-password" name="newPassword" type="password" autocomplete="new-password" />
        </div>
        <div class="field">
          <label for="new-password-confirm">确认新密码</label>
          <input id="new-password-confirm" name="confirmPassword" type="password" autocomplete="new-password" />
        </div>
        <div class="form-actions">
          <span class="muted-text">密码不会以明文保存。</span>
          <button class="primary-button" type="submit">
            <span class="icon" data-icon="save"></span><span>修改密码</span>
          </button>
        </div>
      </form>
      <div class="security-subpanel">
        <h4>找回问题</h4>
        <p class="muted-text">忘记密码时必须答对这些问题，才能设置新密码。</p>
        <form id="recovery-change-form" class="recovery-change-form">
          <div class="field">
            <label for="recovery-change-current-password">当前密码</label>
            <input id="recovery-change-current-password" name="currentPassword" type="password" autocomplete="current-password" />
          </div>
          ${renderRecoveryFields("changeRecovery", preferredRecoveryQuestions())}
          <div class="form-actions">
            <span class="muted-text">答案会加密保存，不会明文显示。</span>
            <button class="primary-button" type="submit">
              <span class="icon" data-icon="save"></span><span>更新找回问题</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function exportJson() {
  const payload = {
    app: "日记档案馆",
    exportedAt: new Date().toISOString(),
    entries: state.entries
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `日记档案馆备份-${todayStr()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importJson(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const incoming = Array.isArray(data) ? data : data.entries;
  if (!Array.isArray(incoming)) throw new Error("Invalid backup");
  const existingIds = new Set(state.entries.map((entry) => entry.id));
  const normalized = incoming.map((entry) => ({
    ...entry,
    id: entry.id && !existingIds.has(entry.id) ? entry.id : uid(),
    analysis: entry.analysis || analyzeEntry(entry)
  }));
  state.entries.push(...normalized);
  saveEntries("导入备份");
  state.view = "library";
  render();
}

function getImportedSourceIds() {
  try {
    const raw = localStorage.getItem(IMPORTED_SOURCE_IDS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveImportedSourceIds(ids) {
  localStorage.setItem(IMPORTED_SOURCE_IDS_KEY, JSON.stringify([...ids]));
  queueSharedStorageWrite("导入来源记录");
}

async function handleCloudSyncSettings(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const current = getCloudSyncConfig();
  const api = normalizeSyncApi(data.api);
  const token = String(data.token || "").trim() || current.token;
  let encryptionKey = String(data.encryptionKey || "").trim() || current.encryptionKey;

  if (!api || !token) {
    state.cloudSyncNotice = { type: "error", text: "请填写同步接口地址和同步密钥。" };
    render();
    return;
  }

  if (!/^https:\/\/.+/i.test(api) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(api)) {
    state.cloudSyncNotice = { type: "error", text: "公网同步接口必须使用 https 地址。" };
    render();
    return;
  }

  if (!encryptionKey) encryptionKey = generateCloudEncryptionKey();
  saveCloudSyncConfig(api, token, encryptionKey);
  try {
    await initializeSharedStorage();
    loadEntries();
    state.cloudSyncNotice = { type: "success", text: `云同步已连接，当前本机 ${activeEntries().length} 篇日记。` };
  } catch {
    state.cloudSyncNotice = { type: "error", text: "云同步连接失败，请检查接口地址和同步密钥。" };
  }
  state.view = "archive";
  render();
}

function handleClearCloudSync() {
  clearCloudSyncConfig();
  sharedStorageReady = false;
  state.cloudSyncNotice = { type: "success", text: "已关闭当前浏览器的云同步配置。" };
  state.view = "archive";
  render();
}

async function loadJson(url) {
  if (url === QQ_IMPORT_URL && window.RIZHI_QQ_IMPORT_DATA) {
    return window.RIZHI_QQ_IMPORT_DATA;
  }

  if (typeof fetch === "function") {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch {
      // Fall through to browser-native fallbacks below.
    }
  }

  if (typeof XMLHttpRequest === "function") {
    try {
      return await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", `${url}?t=${Date.now()}`, true);
        request.onload = () => {
          if (request.status < 200 || request.status >= 300) {
            reject(new Error(`HTTP ${request.status}`));
            return;
          }
          try {
            resolve(JSON.parse(request.responseText));
          } catch {
            reject(new Error("JSON 解析失败"));
          }
        };
        request.onerror = () => reject(new Error("网络读取失败"));
        request.send();
      });
    } catch {
      // Fall through to iframe fallback below.
    }
  }

  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.className = "hidden";
    iframe.setAttribute("aria-hidden", "true");
    const cleanup = () => iframe.remove();
    iframe.onload = () => {
      try {
        const text = iframe.contentDocument?.body?.textContent || "";
        cleanup();
        resolve(JSON.parse(text));
      } catch {
        cleanup();
        reject(new Error("本地 JSON 读取失败"));
      }
    };
    iframe.onerror = () => {
      cleanup();
      reject(new Error("本地 JSON 文件无法打开"));
    };
    iframe.src = `${url}?t=${Date.now()}`;
    document.body.appendChild(iframe);
  });
}

function normalizeQQTags(item) {
  const tags = new Set(["QQ邮箱记事本"]);
  if (item.category && item.category !== "未分类") tags.add(item.category);
  (item.tags || []).forEach((tag) => {
    if (tag && tag !== "未分类" && tag !== "QQ邮箱") tags.add(tag);
  });
  return [...tags];
}

function createQQEntryFromImport(item, now) {
  const entry = {
    id: uid(),
    title: item.title || "QQ邮箱记事本",
    entryDate: item.entryDate || todayStr(),
    content: item.content || "",
    mood: "",
    weather: "",
    location: "",
    people: [],
    tags: normalizeQQTags(item),
    privacy: "私密",
    sourceType: "QQ邮箱记事本",
    status: "待校对",
    futureOpenDate: "",
    attachments: [],
    importMeta: {
      source: item.source || "QQ邮箱记事本",
      sourceId: item.sourceId,
      category: item.category || "",
      contentHash: item.contentHash || "",
      bodyMissing: Boolean(item.bodyMissing),
      dateWasYearless: Boolean(item.dateWasYearless),
      importedAt: now
    },
    createdAt: now,
    updatedAt: now
  };
  entry.qqSync = defaultQQSyncMeta(entry, now);
  entry.analysis = analyzeEntry(entry);
  return entry;
}

function findExistingQQEntry(item) {
  return state.entries.find((entry) => entry.importMeta?.sourceId === item.sourceId) ||
    state.entries.find((entry) => {
      if (entry.sourceType !== "QQ邮箱记事本") return false;
      if (entry.title !== item.title || entry.entryDate !== item.entryDate) return false;
      const existingCategory = entry.importMeta?.category || "";
      return existingCategory === (item.category || "");
    });
}

function syncQQEntryFromImport(entry, item, now) {
  const shouldUpdate =
    entry.importMeta?.contentHash !== (item.contentHash || "") ||
    entry.importMeta?.bodyMissing !== Boolean(item.bodyMissing) ||
    entry.importMeta?.sourceId !== item.sourceId;
  if (!shouldUpdate) return false;

  entry.title = item.title || entry.title;
  entry.entryDate = item.entryDate || entry.entryDate;
  entry.content = item.content || "";
  entry.tags = normalizeQQTags(item);
  entry.sourceType = "QQ邮箱记事本";
  entry.importMeta = {
    ...(entry.importMeta || {}),
    source: item.source || "QQ邮箱记事本",
    sourceId: item.sourceId,
    category: item.category || "",
    contentHash: item.contentHash || "",
    bodyMissing: Boolean(item.bodyMissing),
    dateWasYearless: Boolean(item.dateWasYearless),
    updatedFromImportAt: now
  };
  entry.qqSync = {
    ...(entry.qqSync || {}),
    status: "synced",
    syncedAt: entry.qqSync?.syncedAt || now,
    updatedAt: now,
    note: "来自 QQ 记事本导入"
  };
  entry.updatedAt = now;
  entry.analysis = analyzeEntry(entry);
  return true;
}

async function importQQNotepadIfAvailable(options = {}) {
  const quiet = options.quiet !== false;
  const renderAfter = options.renderAfter !== false;
  try {
    const payload = await loadJson(QQ_IMPORT_URL);
    const incoming = Array.isArray(payload.entries) ? payload.entries : [];
    if (!incoming.length) {
      if (!quiet) {
        state.importNotice = { type: "error", text: "没有在 QQ 记事本导入文件里找到日记。" };
        render();
      }
      return { added: 0, updated: 0, total: 0 };
    }

    const importedIds = getImportedSourceIds();
    const now = new Date().toISOString();
    let changed = false;
    let updatedCount = 0;
    const newEntries = [];

    incoming.forEach((item) => {
      if (!item.sourceId) return;
      const existing = findExistingQQEntry(item);
      if (existing) {
        const updated = syncQQEntryFromImport(existing, item, now);
        if (updated) updatedCount += 1;
        changed = updated || changed;
        importedIds.add(item.sourceId);
        return;
      }
      const entry = createQQEntryFromImport(item, now);
      newEntries.push(entry);
      importedIds.add(item.sourceId);
    });

    if (newEntries.length) {
      state.entries.push(...newEntries);
      changed = true;
    }
    saveImportedSourceIds(importedIds);
    if (changed) saveEntries("恢复 QQ 记事本");
    state.view = "library";
    if (!quiet) {
      state.importNotice = {
        type: "success",
        text: newEntries.length || updatedCount
          ? `已恢复 QQ 记事本日记 ${newEntries.length} 篇，更新 ${updatedCount} 篇。`
          : `QQ 记事本日记已是最新，共识别 ${incoming.length} 篇。`
      };
    }
    if (renderAfter && (changed || !quiet)) render();
    return { added: newEntries.length, updated: updatedCount, total: incoming.length };
  } catch (error) {
    if (!quiet) {
      state.importNotice = {
        type: "error",
        text: `没有读到 QQ 记事本导入文件：${error?.message || "未知错误"}。`
      };
      if (renderAfter) render();
    }
    return { added: 0, updated: 0, total: 0, error: true };
  }
}

function deleteEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  if (isDeletedEntry(entry)) return;
  if (!confirm(`把《${entry.title}》移入回收站？`)) return;
  entry.deletedAt = new Date().toISOString();
  entry.updatedAt = entry.deletedAt;
  saveEntries("移入回收站");
  if (state.selectedId === id) state.selectedId = null;
  state.view = "library";
  render();
}

function restoreEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry || !isDeletedEntry(entry)) return;
  entry.deletedAt = "";
  entry.updatedAt = new Date().toISOString();
  saveEntries("从回收站恢复");
  state.securityNotice = { type: "success", text: `已恢复《${entry.title}》。` };
  state.view = "trash";
  render();
}

function permanentlyDeleteEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry || !isDeletedEntry(entry)) return;
  if (!confirm(`永久删除《${entry.title}》？这个动作不能从回收站恢复。`)) return;
  state.entries = state.entries.filter((item) => item.id !== id);
  saveEntries("永久删除");
  state.securityNotice = { type: "success", text: `已永久删除《${entry.title}》。` };
  state.view = "trash";
  render();
}

function uniqueStrings(...lists) {
  return [...new Set(lists.flat().filter(Boolean))];
}

function mergeAttachments(left = [], right = []) {
  const seen = new Set();
  return [...left, ...right].filter((file) => {
    const key = file.id || `${file.name || ""}|${String(file.dataUrl || "").slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function morePrivateLevel(left = "普通", right = "普通") {
  const leftIndex = PRIVACY_LEVELS.indexOf(left);
  const rightIndex = PRIVACY_LEVELS.indexOf(right);
  return PRIVACY_LEVELS[Math.max(leftIndex, rightIndex, 0)] || "私密";
}

function entryCompletenessScore(entry) {
  return (
    String(entry.content || "").trim().length +
    String(entry.title || "").trim().length * 2 +
    (entry.tags || []).length * 12 +
    (entry.people || []).length * 12 +
    (entry.attachments || []).length * 18 +
    (entry.status === "正式" ? 8 : 0)
  );
}

function chooseBetterTitle(left, right) {
  const first = String(left || "").trim();
  const second = String(right || "").trim();
  if (!first) return second;
  if (!second) return first;
  if (normalizeDuplicateText(first) === normalizeDuplicateText(second)) return first.length >= second.length ? first : second;
  return first.length >= second.length ? first : second;
}

function mergeEntryContent(keeper, removed) {
  const first = String(keeper.content || "").trim();
  const second = String(removed.content || "").trim();
  if (!first) return second;
  if (!second) return first;
  const firstText = normalizeDuplicateText(first);
  const secondText = normalizeDuplicateText(second);
  if (firstText === secondText || firstText.includes(secondText)) return first;
  if (secondText.includes(firstText)) return second;
  return `${first}\n\n--- 合并自《${removed.title || "另一篇日记"}》 ---\n${second}`;
}

function ignoreDuplicatePair(leftId, rightId) {
  const ignoredKeys = readIgnoredDuplicateKeys();
  ignoredKeys.add(duplicatePairKey(leftId, rightId));
  saveIgnoredDuplicateKeys(ignoredKeys);
  state.importNotice = { type: "success", text: "已标记为不是重复，后续不会再提醒这一组。" };
  render();
}

function mergeDuplicateEntries(leftId, rightId) {
  const left = state.entries.find((entry) => entry.id === leftId);
  const right = state.entries.find((entry) => entry.id === rightId);
  if (!left || !right || isDeletedEntry(left) || isDeletedEntry(right)) return;
  const [keeper, removed] = entryCompletenessScore(left) >= entryCompletenessScore(right) ? [left, right] : [right, left];

  if (!confirm(`合并《${left.title}》和《${right.title}》？系统会保留信息更完整的一篇，另一篇放入回收站。`)) return;

  const now = new Date().toISOString();
  keeper.title = chooseBetterTitle(keeper.title, removed.title) || keeper.title || removed.title || "未命名日记";
  keeper.entryDate = keeper.entryDate || removed.entryDate || todayStr();
  keeper.content = mergeEntryContent(keeper, removed);
  keeper.mood = keeper.mood || removed.mood || "";
  keeper.weather = keeper.weather || removed.weather || "";
  keeper.location = keeper.location || removed.location || "";
  keeper.people = uniqueStrings(keeper.people || [], removed.people || []);
  keeper.tags = uniqueStrings(keeper.tags || [], removed.tags || []);
  keeper.privacy = morePrivateLevel(keeper.privacy, removed.privacy);
  keeper.sourceType = keeper.sourceType || removed.sourceType || "手动记录";
  keeper.status = keeper.status === "待校对" || removed.status === "待校对" ? "待校对" : "正式";
  keeper.futureOpenDate = keeper.futureOpenDate || removed.futureOpenDate || "";
  keeper.attachments = mergeAttachments(keeper.attachments || [], removed.attachments || []);
  keeper.importMeta = {
    ...(keeper.importMeta || {}),
    mergedFrom: [
      ...((keeper.importMeta && Array.isArray(keeper.importMeta.mergedFrom)) ? keeper.importMeta.mergedFrom : []),
      {
        id: removed.id,
        title: removed.title,
        entryDate: removed.entryDate,
        sourceType: removed.sourceType,
        mergedAt: now
      }
    ]
  };
  keeper.updatedAt = now;
  keeper.analysis = analyzeEntry(keeper);

  removed.deletedAt = now;
  removed.deletedByMerge = true;
  removed.mergedInto = keeper.id;
  removed.updatedAt = now;

  const ignoredKeys = readIgnoredDuplicateKeys();
  ignoredKeys.add(duplicatePairKey(leftId, rightId));
  saveIgnoredDuplicateKeys(ignoredKeys);
  saveEntries("合并疑似重复");
  state.importNotice = { type: "success", text: `已合并为《${keeper.title}》，另一篇已放入回收站。` };
  state.view = "review";
  render();
}

function confirmEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry || isDeletedEntry(entry)) return;
  entry.status = "正式";
  entry.updatedAt = new Date().toISOString();
  entry.analysis = analyzeEntry(entry);
  saveEntries("确认入库");
  render();
}

function confirmVisibleReviewEntries() {
  const entries = reviewEntries();
  if (!entries.length) return;
  if (!confirm(`确认当前列表中的 ${entries.length} 篇日记入库？`)) return;
  const ids = new Set(entries.map((entry) => entry.id));
  const now = new Date().toISOString();
  state.entries.forEach((entry) => {
    if (!ids.has(entry.id) || isDeletedEntry(entry)) return;
    entry.status = "正式";
    entry.updatedAt = now;
    entry.analysis = analyzeEntry(entry);
  });
  saveEntries("批量确认校对");
  state.importNotice = { type: "success", text: `已确认 ${entries.length} 篇日记入库。` };
  render();
}

function randomEntry() {
  const entries = filteredEntries();
  if (!entries.length) {
    openNewEntry();
    return;
  }
  const entry = entries[Math.floor(Math.random() * entries.length)];
  state.selectedId = entry.id;
  state.view = "detail";
  render();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("复制失败");
}

async function copyQQSyncEntry(id) {
  const entry = activeEntries().find((item) => item.id === id);
  if (!entry) return;
  try {
    await copyText(formatQQSyncText(entry));
    const now = new Date().toISOString();
    entry.qqSync = {
      ...(entry.qqSync || defaultQQSyncMeta(entry, now)),
      lastCopiedAt: now,
      updatedAt: now
    };
    saveEntries("复制 QQ 同步内容");
    state.qqSyncNotice = { type: "success", text: `已复制《${entry.title}》，可粘贴到 QQ 记事本。` };
  } catch {
    state.qqSyncNotice = { type: "error", text: "复制失败，可以打开日记详情后手动复制。" };
  }
  state.view = "sync";
  render();
}

async function copyQQSyncList() {
  const entries = filteredQQSyncEntries();
  if (!entries.length) {
    state.qqSyncNotice = { type: "error", text: "当前列表没有可复制的日记。" };
    render();
    return;
  }
  const text = entries
    .map((entry, index) => `【${index + 1}】${formatQQSyncText(entry)}`)
    .join("\n\n------------------------------\n\n");
  try {
    await copyText(text);
    const now = new Date().toISOString();
    const ids = new Set(entries.map((entry) => entry.id));
    state.entries.forEach((entry) => {
      if (!ids.has(entry.id) || isDeletedEntry(entry)) return;
      entry.qqSync = {
        ...(entry.qqSync || defaultQQSyncMeta(entry, now)),
        lastCopiedAt: now,
        updatedAt: now
      };
    });
    saveEntries("复制 QQ 同步列表");
    state.qqSyncNotice = { type: "success", text: `已复制当前列表 ${entries.length} 篇日记。` };
  } catch {
    state.qqSyncNotice = { type: "error", text: "复制失败，请改为逐篇复制。" };
  }
  render();
}

function markQQSyncStatus(id, status) {
  if (!QQ_SYNC_STATUSES[status]) return;
  const entry = activeEntries().find((item) => item.id === id);
  if (!entry) return;
  const now = new Date().toISOString();
  entry.qqSync = {
    ...(entry.qqSync || defaultQQSyncMeta(entry, now)),
    status,
    updatedAt: now,
    ...(status === "synced" ? { syncedAt: now, failedAt: "" } : {}),
    ...(status === "failed" ? { failedAt: now } : {})
  };
  saveEntries("更新 QQ 同步状态");
  state.qqSyncNotice = { type: "success", text: `《${entry.title}》已标记为${QQ_SYNC_STATUSES[status].label}。` };
  state.view = "sync";
  render();
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  const { action, view, id, index } = target.dataset;

  if (view) {
    state.view = view;
    render();
    return;
  }

  if (action === "new-entry") openNewEntry();
  if (action === "back-library") {
    if (state.view === "editor") {
      clearSavedEditorDraft();
      state.editorNotice = null;
    }
    state.view = "library";
    render();
  }
  if (action === "back-insights") {
    state.view = "insights";
    state.lifeReportNotice = null;
    render();
    return;
  }
  if (action === "random-entry") randomEntry();
  if (action === "forgot-password") {
    renderPasswordResetScreen();
    return;
  }
  if (action === "back-unlock") {
    renderLockScreen("unlock");
    return;
  }
  if (action === "lock-now") {
    lockApp();
    return;
  }
  if (action === "view-entry") {
    state.selectedId = id;
    state.view = "detail";
    render();
  }
  if (action === "edit-entry") openEditor(id);
  if (action === "delete-entry") deleteEntry(id);
  if (action === "restore-entry") restoreEntry(id);
  if (action === "permanently-delete-entry") permanentlyDeleteEntry(id);
  if (action === "confirm-entry") confirmEntry(id);
  if (action === "remove-attachment") {
    collectEntryDraft();
    state.pendingAttachments.splice(Number(index), 1);
    render();
  }
  if (action === "remove-import-attachment") {
    collectImportDraft();
    state.importAttachments.splice(Number(index), 1);
    render();
  }
  if (action === "restore-qq-notepad") {
    await importQQNotepadIfAvailable({ quiet: false });
    return;
  }
  if (action === "confirm-review-visible") {
    confirmVisibleReviewEntries();
    return;
  }
  if (action === "open-life-report") {
    openLifeReport();
    return;
  }
  if (action === "save-life-report") {
    saveLifeReportFromEditor();
    return;
  }
  if (action === "regenerate-life-report") {
    regenerateLifeReport();
    return;
  }
  if (action === "export-life-report") {
    exportLifeReportText();
    return;
  }
  if (action === "ask-life-question") {
    askLifeQuestion(document.querySelector("#life-question-input")?.value || state.lifeQuestion);
    return;
  }
  if (action === "quick-life-question") {
    askLifeQuestion(target.dataset.question || "");
    return;
  }
  if (action === "copy-qq-sync-entry") {
    await copyQQSyncEntry(id);
    return;
  }
  if (action === "copy-qq-sync-list") {
    await copyQQSyncList();
    return;
  }
  if (action === "mark-qq-sync") {
    markQQSyncStatus(id, target.dataset.status);
    return;
  }
  if (action === "print-life-report") {
    window.print();
    return;
  }
  if (action === "merge-duplicate") {
    mergeDuplicateEntries(target.dataset.left, target.dataset.right);
    return;
  }
  if (action === "ignore-duplicate") {
    ignoreDuplicatePair(target.dataset.left, target.dataset.right);
    return;
  }
  if (action === "create-data-snapshot") {
    handleCreateDataSnapshot();
    return;
  }
  if (action === "clear-cloud-sync") {
    handleClearCloudSync();
    return;
  }
  if (action === "restore-data-snapshot") {
    restoreDataSnapshot(id);
    return;
  }
  if (action === "export-json") exportJson();
  if (action === "choose-import-json") document.querySelector("#backup-file")?.click();
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.target.id === "password-setup-form") {
    await handlePasswordSetup(event.target);
    return;
  }
  if (event.target.id === "password-unlock-form") {
    await handlePasswordUnlock(event.target);
    return;
  }
  if (event.target.id === "password-change-form") {
    await handlePasswordChange(event.target);
    return;
  }
  if (event.target.id === "password-reset-form") {
    await handlePasswordReset(event.target);
    return;
  }
  if (event.target.id === "password-recovered-form") {
    await handleRecoveredPasswordSetup(event.target);
    return;
  }
  if (event.target.id === "recovery-setup-form") {
    await handleRecoverySetup(event.target);
    return;
  }
  if (event.target.id === "recovery-change-form") {
    await handleRecoveryChange(event.target);
    return;
  }
  if (event.target.id === "cloud-sync-form") {
    await handleCloudSyncSettings(event.target);
    return;
  }
  if (event.target.id === "diary-form") saveEntryFromDraft();
  if (event.target.id === "import-form") saveImportFromDraft();
});

document.addEventListener("input", (event) => {
  if (event.target.id === "global-search") {
    state.query = event.target.value;
    state.view = "library";
    render();
    return;
  }

  if (event.target.dataset.filter) {
    state.filters[event.target.dataset.filter] = event.target.value;
    render();
    return;
  }

  if (event.target.dataset.reviewFilter) {
    state.reviewFilters[event.target.dataset.reviewFilter] = event.target.value;
    render();
    return;
  }

  if (event.target.dataset.qqSyncFilter) {
    state.qqSyncFilter = event.target.value;
    state.view = "sync";
    render();
    return;
  }

  if (event.target.id === "life-report-content") {
    const printContent = document.querySelector(".report-print-content");
    if (printContent) printContent.textContent = event.target.value;
    state.lifeReportNotice = null;
    return;
  }

  if (event.target.id === "life-question-input") {
    state.lifeQuestion = event.target.value;
    return;
  }

  if (event.target.closest("#diary-form")) collectEntryDraft();
  if (event.target.closest("#import-form")) collectImportDraft();
});

document.addEventListener("change", async (event) => {
  if (event.target.dataset.qqSyncFilter) {
    state.qqSyncFilter = event.target.value;
    state.view = "sync";
    render();
    return;
  }

  if (event.target.id === "entry-files") {
    collectEntryDraft();
    const files = await readFiles(event.target.files);
    state.pendingAttachments.push(...files);
    render();
  }

  if (event.target.id === "import-files") {
    collectImportDraft();
    const files = await readFiles(event.target.files);
    state.importAttachments.push(...files);
    render();
  }

  if (event.target.id === "backup-file" && event.target.files[0]) {
    try {
      await importJson(event.target.files[0]);
    } catch {
      alert("备份文件无法导入。");
    }
  }
});

["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart", "input", "change"].forEach((eventName) => {
  document.addEventListener(eventName, noteUserActivity, { passive: true, capture: true });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden || !isSessionUnlocked()) return;
  handleAutoLockTimeout();
});

async function startApp() {
  document.querySelector("#today-label").textContent = dateLabel(todayStr());
  showAppShell();
  hydrateStaticIcons();
  loadEntries();
  if (!isPublicStaticDeployment()) {
    await importQQNotepadIfAvailable({ quiet: activeEntries().length > 0, renderAfter: false });
  }
  restoreEditorDraftAfterUnlock();
  render();
  startAutoLockTimer();
}

async function repairQQNotepadBeforeAuth() {
  const previousView = state.view;
  loadEntries();
  const beforeCount = activeEntries().length;
  if (isPublicStaticDeployment() && !getCloudSyncConfig().enabled) {
    state.preAuthRepairNotice = {
      type: "success",
      text: "这是公网安全版，未携带本机日记数据。要查看真实日记，请用本地地址；公网同步需要再接私有后端。"
    };
    state.view = previousView;
    resetVisibleDiaryContent();
    return;
  }
  if (isPublicStaticDeployment()) {
    state.view = previousView;
    resetVisibleDiaryContent();
    return;
  }
  const result = await importQQNotepadIfAvailable({ quiet: true, renderAfter: false });
  if (result?.error) {
    state.preAuthRepairNotice = {
      type: "error",
      text: "QQ 记事本预恢复失败，进入系统后可在日记库重试。"
    };
  } else if (result?.total) {
    state.preAuthRepairNotice = {
      type: "success",
      text: result.added
        ? `已预恢复 QQ 记事本日记 ${result.added} 篇。`
        : `已检查 QQ 记事本日记 ${result.total} 篇，本机当前已有 ${beforeCount} 篇。`
    };
  }
  state.view = previousView;
  resetVisibleDiaryContent();
}

async function init() {
  document.querySelector("#today-label").textContent = dateLabel(todayStr());
  hydrateStaticIcons();
  setRecoveryVerified(false);
  renderLockLoadingScreen();
  const syncReady = await initializeSharedStorage();
  await repairQQNotepadBeforeAuth();
  const hasPassword = Boolean(getAuthConfig());
  if (isPublicStaticDeployment() && getCloudSyncConfig().enabled && !syncReady && !hasPassword) {
    renderLockScreen("unlock", sharedStorageLastError ? "同步失败，请刷新" : "正在准备");
    return;
  }
  if (!hasPassword) {
    renderLockScreen("setup");
    return;
  }
  if (!isSessionUnlocked()) {
    renderLockScreen("unlock");
    return;
  }
  if (!hasRecoveryConfig()) {
    renderRecoverySetupScreen("请先补充找回问题。");
    return;
  }
  await startApp();
}

init();
