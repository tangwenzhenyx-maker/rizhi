const STORE_KEY = "shared-storage";
const BACKUP_PREFIX = "backup:";

function jsonResponse(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request, env),
    },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Accept",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
  };
}

function unauthorized(request, env) {
  return jsonResponse(request, env, { ok: false, error: "unauthorized" }, 401);
}

function tokenMatched(request, env) {
  const expected = String(env.SYNC_TOKEN || "");
  if (!expected) return false;
  const header = request.headers.get("Authorization") || "";
  return header === `Bearer ${expected}`;
}

function emptyStore() {
  return {
    version: 1,
    updatedAt: "",
    reason: "",
    keys: {},
  };
}

async function readStore(env) {
  const value = await env.RIZHI_STORE.get(STORE_KEY);
  if (!value) return emptyStore();
  try {
    const parsed = JSON.parse(value);
    if (parsed && parsed.encrypted && parsed.payload && typeof parsed.payload === "object") return parsed;
    return parsed && typeof parsed === "object" && parsed.keys && typeof parsed.keys === "object" ? parsed : emptyStore();
  } catch {
    return emptyStore();
  }
}

function cleanKeys(keys) {
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;
  return Object.fromEntries(Object.entries(keys).filter(([, value]) => typeof value === "string"));
}

function cleanEncryptedPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!payload.iv || !payload.ciphertext) return null;
  return {
    version: Number(payload.version || 1),
    algorithm: String(payload.algorithm || "AES-GCM"),
    keyFormat: String(payload.keyFormat || "raw-256"),
    iv: String(payload.iv),
    ciphertext: String(payload.ciphertext),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === "/") {
      return jsonResponse(request, env, { ok: true, service: "rizhi-sync" });
    }

    if (url.pathname !== "/api/storage") {
      return jsonResponse(request, env, { ok: false, error: "not_found" }, 404);
    }

    if (!tokenMatched(request, env)) return unauthorized(request, env);

    if (request.method === "GET") {
      return jsonResponse(request, env, await readStore(env));
    }

    if (request.method !== "POST") {
      return jsonResponse(request, env, { ok: false, error: "method_not_allowed" }, 405);
    }

    let incoming;
    try {
      incoming = await request.json();
    } catch {
      return jsonResponse(request, env, { ok: false, error: "invalid_json" }, 400);
    }

    const encryptedPayload = incoming.encrypted ? cleanEncryptedPayload(incoming.payload) : null;
    const keys = incoming.encrypted ? null : cleanKeys(incoming.keys);
    if (!encryptedPayload && !keys) return jsonResponse(request, env, { ok: false, error: "missing_payload" }, 400);

    const previous = await readStore(env);
    const payload = encryptedPayload
      ? {
          version: 2,
          encrypted: true,
          updatedAt: new Date().toISOString(),
          reason: String(incoming.reason || "端到端加密云同步"),
          payload: encryptedPayload,
        }
      : {
          version: 1,
          updatedAt: new Date().toISOString(),
          reason: String(incoming.reason || "云同步"),
          keys,
        };

    if (JSON.stringify(previous) !== JSON.stringify(payload)) {
      if ((previous.keys && Object.keys(previous.keys).length) || previous.encrypted) {
        await env.RIZHI_STORE.put(`${BACKUP_PREFIX}${Date.now()}`, JSON.stringify(previous));
      }
      await env.RIZHI_STORE.put(STORE_KEY, JSON.stringify(payload));
    }

    return jsonResponse(request, env, {
      ok: true,
      encrypted: Boolean(encryptedPayload),
      updatedAt: payload.updatedAt,
      keyCount: keys ? Object.keys(keys).length : 0,
    });
  },
};
