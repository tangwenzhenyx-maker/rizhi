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
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
STORE_PATH = DATA_DIR / "shared-storage.json"
BACKUP_PATH = DATA_DIR / "shared-storage-backups.jsonl"
STORAGE_KEY = "rizhi.diary.entries.v1"
STORAGE_BACKUP_KEY = "rizhi.diary.entries.backup.v1"
STORAGE_SNAPSHOT_KEY = "rizhi.diary.snapshots.v1"
DUPLICATE_IGNORE_KEY = "rizhi.duplicates.ignored.v1"
LIFE_REPORT_KEY = "rizhi.life.report.v1"
LIFE_QA_KEY = "rizhi.life.questions.v1"
IMPORTED_SOURCE_IDS_KEY = "rizhi.imported.sourceIds.v1"
AUTH_KEY = "rizhi.auth.v1"
SNAPSHOT_LIMIT = 12


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
    store = read_store()
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
            self.send_json(200, read_store())
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

        cleaned = {str(key): value for key, value in keys.items() if isinstance(value, str)}
        previous = read_store()
        reason = str(incoming.get("reason") or "数据同步")
        merged_keys = merge_storage_keys(previous.get("keys", {}), cleaned)
        payload = {
            "version": 1,
            "updatedAt": now_iso(),
            "reason": reason,
            "keys": merged_keys,
        }

        if previous.get("keys") != merged_keys:
            append_backup(previous, reason)
            atomic_write_json(STORE_PATH, payload)

        self.send_json(200, {"ok": True, "updatedAt": payload["updatedAt"], "keyCount": len(merged_keys)})


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
