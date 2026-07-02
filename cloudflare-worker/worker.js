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
    return parsed && typeof parsed === "object" && parsed.keys && typeof parsed.keys === "object" ? parsed : emptyStore();
  } catch {
    return emptyStore();
  }
}

function cleanKeys(keys) {
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;
  return Object.fromEntries(Object.entries(keys).filter(([, value]) => typeof value === "string"));
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

    const keys = cleanKeys(incoming.keys);
    if (!keys) return jsonResponse(request, env, { ok: false, error: "missing_keys" }, 400);

    const previous = await readStore(env);
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      reason: String(incoming.reason || "云同步"),
      keys,
    };

    if (JSON.stringify(previous.keys || {}) !== JSON.stringify(keys)) {
      if (previous.keys && Object.keys(previous.keys).length) {
        await env.RIZHI_STORE.put(`${BACKUP_PREFIX}${Date.now()}`, JSON.stringify(previous));
      }
      await env.RIZHI_STORE.put(STORE_KEY, JSON.stringify(payload));
    }

    return jsonResponse(request, env, { ok: true, updatedAt: payload.updatedAt, keyCount: Object.keys(keys).length });
  },
};

