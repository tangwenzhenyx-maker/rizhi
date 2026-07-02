#!/usr/bin/env python3

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
STORE_PATH = DATA_DIR / "shared-storage.json"
BACKUP_PATH = DATA_DIR / "shared-storage-backups.jsonl"
SYNC_TOKEN_PATH = APP_DIR / "cloudflare-worker" / ".sync-token"
SYNC_KEY_PATH = APP_DIR / "cloudflare-worker" / ".sync-key"
CLOUD_SYNC_API = "https://rizhi-sync.tangwenzhenyx-rili.workers.dev/api/storage"
STORAGE_KEY = "rizhi.diary.entries.v1"
STORAGE_BACKUP_KEY = "rizhi.diary.entries.backup.v1"
STORAGE_SNAPSHOT_KEY = "rizhi.diary.snapshots.v1"
DUPLICATE_IGNORE_KEY = "rizhi.duplicates.ignored.v1"
LIFE_REPORT_KEY = "rizhi.life.report.v1"
LIFE_QA_KEY = "rizhi.life.questions.v1"
IMPORTED_SOURCE_IDS_KEY = "rizhi.imported.sourceIds.v1"
AUTH_KEY = "rizhi.auth.v1"
SNAPSHOT_LIMIT = 12
CLOUD_SYNC_KEYS = {
    STORAGE_KEY,
    DUPLICATE_IGNORE_KEY,
    LIFE_REPORT_KEY,
    LIFE_QA_KEY,
    IMPORTED_SOURCE_IDS_KEY,
    AUTH_KEY,
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_store() -> dict:
    if not STORE_PATH.exists():
        return {"version": 1, "updatedAt": "", "keys": {}}
    try:
        data = json.loads(STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"version": 1, "updatedAt": "", "keys": {}}
    if not isinstance(data, dict):
        return {"version": 1, "updatedAt": "", "keys": {}}
    keys = data.get("keys")
    if not isinstance(keys, dict):
        keys = {}
    return {
        "version": 1,
        "updatedAt": str(data.get("updatedAt") or ""),
        "reason": str(data.get("reason") or ""),
        "keys": {str(key): value for key, value in keys.items() if isinstance(value, str)},
    }


def read_private_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def cloud_sync_available() -> bool:
    return bool(read_private_text(SYNC_TOKEN_PATH) and read_private_text(SYNC_KEY_PATH))


def cloud_core_keys(keys: dict) -> dict[str, str]:
    return {str(key): value for key, value in keys.items() if key in CLOUD_SYNC_KEYS and isinstance(value, str)}


def decrypt_cloud_payload(payload: dict) -> dict[str, str]:
    if not isinstance(payload, dict):
        return {}
    iv_raw = payload.get("iv")
    ciphertext_raw = payload.get("ciphertext")
    if not iv_raw or not ciphertext_raw:
        return {}
    key = base64.b64decode(read_private_text(SYNC_KEY_PATH))
    iv = base64.b64decode(str(iv_raw))
    ciphertext = base64.b64decode(str(ciphertext_raw))
    plaintext = AESGCM(key).decrypt(iv, ciphertext, None)
    data = json.loads(plaintext.decode("utf-8"))
    keys = data.get("keys") if isinstance(data, dict) else {}
    return cloud_core_keys(keys if isinstance(keys, dict) else {})


def encrypt_cloud_keys(keys: dict, reason: str) -> dict:
    key = base64.b64decode(read_private_text(SYNC_KEY_PATH))
    iv = os.urandom(12)
    plaintext = json.dumps(
        {
            "version": 1,
            "reason": reason,
            "createdAt": now_iso(),
            "keys": cloud_core_keys(keys),
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    ciphertext = AESGCM(key).encrypt(iv, plaintext, None)
    return {
        "version": 1,
        "algorithm": "AES-GCM",
        "keyFormat": "raw-256",
        "iv": base64.b64encode(iv).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
    }


def cloud_request(method: str, body: dict | None = None) -> dict:
    token = read_private_text(SYNC_TOKEN_PATH)
    if not token:
        raise RuntimeError("missing_sync_token")
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        CLOUD_SYNC_API,
        data=payload,
        method=method,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "rizhi-local-sync/1.0",
            **({"Content-Type": "application/json"} if payload is not None else {}),
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def read_cloud_store() -> dict:
    data = cloud_request("GET")
    if data.get("encrypted"):
        keys = decrypt_cloud_payload(data.get("payload") if isinstance(data.get("payload"), dict) else {})
    else:
        raw_keys = data.get("keys") if isinstance(data, dict) else {}
        keys = cloud_core_keys(raw_keys if isinstance(raw_keys, dict) else {})
    return {
        "version": 1,
        "updatedAt": str(data.get("updatedAt") or ""),
        "reason": str(data.get("reason") or ""),
        "keys": keys,
    }


def write_cloud_store(keys: dict, reason: str) -> dict:
    encrypted_payload = encrypt_cloud_keys(keys, reason)
    return cloud_request(
        "POST",
        {
            "reason": reason,
            "encrypted": True,
            "payload": encrypted_payload,
        },
    )


def write_local_cache(keys: dict, reason: str) -> dict:
    previous = read_store()
    cached_keys = dict(previous.get("keys", {}))
    cached_keys.update(keys)
    payload = {
        "version": 1,
        "updatedAt": now_iso(),
        "reason": reason,
        "keys": cached_keys,
    }
    if previous.get("keys") != cached_keys:
        append_backup(previous, reason)
        atomic_write_json(STORE_PATH, payload)
    return payload


def atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def append_backup(previous: dict, reason: str) -> None:
    keys = previous.get("keys") if isinstance(previous, dict) else {}
    if not keys:
        return
    BACKUP_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "createdAt": now_iso(),
        "reason": reason,
        "store": previous,
    }
    with BACKUP_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False))
        handle.write("\n")


def parse_json_safe(raw: str | None, fallback):
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return fallback


def normalize_text(value: object) -> str:
    text = str(value or "").casefold()
    return re.sub(r"""[\s"'“”‘’.,，。！？!?；;：:、（）()【】\[\]《》<>〈〉{}「」『』·•\-_\/\\|]+""", "", text)


def entry_time(entry: dict) -> str:
    return str(entry.get("updatedAt") or entry.get("deletedAt") or entry.get("createdAt") or entry.get("entryDate") or "")


def entry_dedupe_key(entry: dict) -> str:
    meta = entry.get("importMeta") if isinstance(entry.get("importMeta"), dict) else {}
    source = str(meta.get("source") or entry.get("sourceType") or "")
    source_id = str(meta.get("sourceId") or meta.get("id") or "")
    content_hash = str(meta.get("contentHash") or entry.get("contentHash") or "")
    if source_id:
        return f"source:{source}:{source_id}"
    if content_hash:
        return f"hash:{content_hash}"

    date = str(entry.get("entryDate") or "")
    title = normalize_text(entry.get("title"))
    content = normalize_text(entry.get("content"))
    is_qq = source == "QQ邮箱记事本" or entry.get("sourceType") == "QQ邮箱记事本"
    if is_qq and date and title:
        return f"qq:{date}:{title}:{content[:120]}"
    if date and title and len(content) >= 20:
        return f"text:{date}:{title}:{content[:140]}"
    return f"id:{entry.get('id') or ''}"


def entry_richness(entry: dict) -> int:
    attachments = entry.get("attachments") if isinstance(entry.get("attachments"), list) else []
    return (
        len(str(entry.get("content") or ""))
        + len(attachments) * 80
        + (20 if entry.get("analysis") else 0)
        + (0 if entry.get("deletedAt") else 10)
    )


def choose_entry(existing: dict | None, incoming: dict) -> dict:
    if not existing:
        return incoming
    existing_time = entry_time(existing)
    incoming_time = entry_time(incoming)
    if incoming_time != existing_time:
        return incoming if incoming_time > existing_time else existing
    return incoming if entry_richness(incoming) >= entry_richness(existing) else existing


def merge_entries(left_raw: str | None, right_raw: str | None) -> str:
    left = parse_json_safe(left_raw, [])
    right = parse_json_safe(right_raw, [])
    by_key: dict[str, dict] = {}
    for entry in [*(right if isinstance(right, list) else []), *(left if isinstance(left, list) else [])]:
        if not isinstance(entry, dict):
            continue
        key = entry_dedupe_key(entry)
        by_key[key] = choose_entry(by_key.get(key), entry)
    merged = sorted(
        by_key.values(),
        key=lambda item: (str(item.get("entryDate") or ""), str(item.get("updatedAt") or "")),
        reverse=True,
    )
    return json.dumps(merged, ensure_ascii=False) if merged else ""


def merge_array_set(left_raw: str | None, right_raw: str | None, limit: int = 500) -> str:
    left = parse_json_safe(left_raw, [])
    right = parse_json_safe(right_raw, [])
    values = [*(right if isinstance(right, list) else []), *(left if isinstance(left, list) else [])]
    result = []
    seen = set()
    for value in values:
        marker = json.dumps(value, ensure_ascii=False, sort_keys=True)
        if marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return json.dumps(result[-limit:], ensure_ascii=False) if result else ""


def object_time(raw: str | None) -> str:
    value = parse_json_safe(raw, {})
    if not isinstance(value, dict):
        return ""
    return str(value.get("updatedAt") or value.get("savedAt") or value.get("createdAt") or "")


def merge_object_by_time(left_raw: str | None, right_raw: str | None) -> str:
    if not left_raw:
        return right_raw or ""
    if not right_raw:
        return left_raw or ""
    return left_raw if object_time(left_raw) >= object_time(right_raw) else right_raw


def valid_auth(raw: str | None) -> bool:
    value = parse_json_safe(raw, {})
    return isinstance(value, dict) and bool(value.get("salt") and value.get("passwordHash"))


def verify_password_with_store(password: str) -> bool:
    store = read_unified_store()
    auth_raw = store.get("keys", {}).get(AUTH_KEY)
    auth = parse_json_safe(auth_raw, {})
    if not isinstance(auth, dict):
        return False

    salt = auth.get("salt")
    expected = auth.get("passwordHash")
    iterations = int(auth.get("iterations") or 180000)
    if not salt or not expected:
        return False

    try:
      salt_bytes = base64.b64decode(str(salt))
      derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, iterations, dklen=32)
      actual = base64.b64encode(derived).decode("ascii")
      return hmac.compare_digest(actual, str(expected))
    except Exception:
      return False


def merge_auth(left_raw: str | None, right_raw: str | None) -> str:
    left_valid = valid_auth(left_raw)
    right_valid = valid_auth(right_raw)
    if right_valid and not left_valid:
        return right_raw or ""
    if left_valid and not right_valid:
        return left_raw or ""
    if not left_valid and not right_valid:
        return ""
    return merge_object_by_time(left_raw, right_raw)


def merge_snapshots(left_raw: str | None, right_raw: str | None) -> str:
    left = parse_json_safe(left_raw, [])
    right = parse_json_safe(right_raw, [])
    by_key = {}
    for snapshot in [*(left if isinstance(left, list) else []), *(right if isinstance(right, list) else [])]:
        if not isinstance(snapshot, dict):
            continue
        key = str(snapshot.get("fingerprint") or snapshot.get("id") or "")
        if not key:
            continue
        current = by_key.get(key)
        if not current or str(snapshot.get("createdAt") or "") >= str(current.get("createdAt") or ""):
            by_key[key] = snapshot
    merged = sorted(by_key.values(), key=lambda item: str(item.get("createdAt") or ""), reverse=True)[:SNAPSHOT_LIMIT]
    return json.dumps(merged, ensure_ascii=False) if merged else ""


def merge_questions(left_raw: str | None, right_raw: str | None) -> str:
    left = parse_json_safe(left_raw, [])
    right = parse_json_safe(right_raw, [])
    by_key = {}
    for item in [*(left if isinstance(left, list) else []), *(right if isinstance(right, list) else [])]:
        if not isinstance(item, dict):
            continue
        key = str(item.get("id") or f"{item.get('question') or ''}::{item.get('createdAt') or item.get('updatedAt') or ''}")
        if key and key not in by_key:
            by_key[key] = item
    merged = sorted(by_key.values(), key=lambda item: str(item.get("createdAt") or item.get("updatedAt") or ""), reverse=True)[:12]
    return json.dumps(merged, ensure_ascii=False) if merged else ""


def merge_storage_keys(existing: dict, incoming: dict) -> dict:
    merged: dict[str, str] = {}
    entries = merge_entries(
        incoming.get(STORAGE_KEY) or incoming.get(STORAGE_BACKUP_KEY),
        existing.get(STORAGE_KEY) or existing.get(STORAGE_BACKUP_KEY),
    )
    if entries:
        merged[STORAGE_KEY] = entries
        merged[STORAGE_BACKUP_KEY] = entries

    snapshots = merge_snapshots(incoming.get(STORAGE_SNAPSHOT_KEY), existing.get(STORAGE_SNAPSHOT_KEY))
    if snapshots:
        merged[STORAGE_SNAPSHOT_KEY] = snapshots

    ignored = merge_array_set(incoming.get(DUPLICATE_IGNORE_KEY), existing.get(DUPLICATE_IGNORE_KEY))
    if ignored:
        merged[DUPLICATE_IGNORE_KEY] = ignored

    imported = merge_array_set(incoming.get(IMPORTED_SOURCE_IDS_KEY), existing.get(IMPORTED_SOURCE_IDS_KEY), 5000)
    if imported:
        merged[IMPORTED_SOURCE_IDS_KEY] = imported

    report = merge_object_by_time(incoming.get(LIFE_REPORT_KEY), existing.get(LIFE_REPORT_KEY))
    if report:
        merged[LIFE_REPORT_KEY] = report

    questions = merge_questions(incoming.get(LIFE_QA_KEY), existing.get(LIFE_QA_KEY))
    if questions:
        merged[LIFE_QA_KEY] = questions

    auth = merge_auth(incoming.get(AUTH_KEY), existing.get(AUTH_KEY))
    if auth:
        merged[AUTH_KEY] = auth

    return merged


def read_unified_store() -> dict:
    local = read_store()
    if not cloud_sync_available():
        return local

    try:
        cloud = read_cloud_store()
        merged_keys = merge_storage_keys(cloud.get("keys", {}), cloud_core_keys(local.get("keys", {})))
        if merged_keys != cloud.get("keys", {}):
            write_cloud_store(merged_keys, "PC 本地缓存合并到云端")
        write_local_cache(merged_keys, "从云端同步到本机缓存")
        return {
            "version": 1,
            "updatedAt": str(cloud.get("updatedAt") or now_iso()),
            "reason": str(cloud.get("reason") or "云同步"),
            "keys": merged_keys,
            "source": "cloud",
        }
    except Exception as error:
        return {
            **local,
            "source": "local-cache",
            "warning": f"cloud_unavailable:{error.__class__.__name__}",
        }


def write_unified_store(incoming_keys: dict, reason: str) -> dict:
    cleaned = {str(key): value for key, value in incoming_keys.items() if isinstance(value, str)}

    if cloud_sync_available():
        try:
            cloud = read_cloud_store()
            merged_keys = merge_storage_keys(cloud.get("keys", {}), cloud_core_keys(cleaned))
            write_cloud_store(merged_keys, reason)
            cached = write_local_cache(merged_keys, reason)
            return {
                "ok": True,
                "source": "cloud",
                "updatedAt": cached["updatedAt"],
                "keyCount": len(merged_keys),
            }
        except Exception as error:
            previous = read_store()
            merged_keys = merge_storage_keys(previous.get("keys", {}), cleaned)
            cached = write_local_cache(merged_keys, f"{reason}（云端暂不可用，本机缓存）")
            return {
                "ok": True,
                "source": "local-cache",
                "warning": f"cloud_unavailable:{error.__class__.__name__}",
                "updatedAt": cached["updatedAt"],
                "keyCount": len(merged_keys),
            }

    previous = read_store()
    merged_keys = merge_storage_keys(previous.get("keys", {}), cleaned)
    cached = write_local_cache(merged_keys, reason)
    return {
        "ok": True,
        "source": "local",
        "updatedAt": cached["updatedAt"],
        "keyCount": len(merged_keys),
    }


class DiaryHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
        super().end_headers()

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/api/storage":
            self.send_json(200, read_unified_store())
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/api/auth/verify":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(length).decode("utf-8")
                incoming = json.loads(body or "{}")
            except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
                self.send_json(400, {"ok": False, "error": "invalid_json"})
                return

            password = str(incoming.get("password") or "")
            if not password:
                self.send_json(200, {"ok": True, "matched": False})
                return

            self.send_json(200, {"ok": True, "matched": verify_password_with_store(password)})
            return

        if path != "/api/storage":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            incoming = json.loads(body or "{}")
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"ok": False, "error": "invalid_json"})
            return

        keys = incoming.get("keys")
        if not isinstance(keys, dict):
            self.send_json(400, {"ok": False, "error": "missing_keys"})
            return

        reason = str(incoming.get("reason") or "数据同步")
        self.send_json(200, write_unified_store(keys, reason))


def main() -> None:
    parser = argparse.ArgumentParser(description="Diary local sync server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8782)
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), DiaryHandler)
    print(f"Diary server running on http://{args.host}:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
