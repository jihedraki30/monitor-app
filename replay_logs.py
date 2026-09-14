"""
replay_logs.py
──────────────
One-shot script: reads the ENTIRE existing audit.log from the beginning
and inserts all entries into MongoDB.

Use this to backfill history, or to test the pipeline before going live.

Run:
    python replay_logs.py
"""

import json
import base64
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from pymongo import MongoClient

LOG_FILE  = os.getenv("NGINX_LOG_FILE", r"C:\nginx-server\logs\audit.log")
MONGO_URI = os.getenv("MONGO_URI",      "mongodb://localhost:27017")
MONGO_DB  = os.getenv("MONGO_DB",       "lawfirm_audit")
MONGO_COL = os.getenv("MONGO_COL",      "requests")

SKIP_URIS     = {"/favicon.ico", "/robots.txt"}
SKIP_PREFIXES = ("/assets/", "/.well-known/")


def decode_jwt_payload(token: str) -> dict:
    if not token or not token.startswith("Bearer "):
        return {}
    raw    = token[len("Bearer "):]
    parts  = raw.split(".")
    if len(parts) != 3:
        return {}
    b64 = parts[1]
    b64 += "=" * (4 - len(b64) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(b64).decode("utf-8"))
    except Exception:
        return {}


def main():
    print("=" * 60)
    print("  Nginx Log Replayer → MongoDB  (full history)")
    print("=" * 60)

    if not Path(LOG_FILE).exists():
        print(f"  ❌ Log file not found: {LOG_FILE}")
        sys.exit(1)

    try:
        client     = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.server_info()
        collection = client[MONGO_DB][MONGO_COL]
        print(f"  ✅ Connected to MongoDB\n")
    except Exception as e:
        print(f"  ❌ MongoDB connection failed: {e}")
        sys.exit(1)

    inserted = 0
    skipped  = 0
    errors   = 0

    with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                log = json.loads(line)
            except json.JSONDecodeError:
                errors += 1
                continue

            uri = log.get("uri", "")
            if uri in SKIP_URIS or any(uri.startswith(p) for p in SKIP_PREFIXES):
                skipped += 1
                continue

            auth_header = log.get("authorization", "")
            jwt_payload = decode_jwt_payload(auth_header)
            user_email  = jwt_payload.get("sub")
            roles       = jwt_payload.get("authorities", jwt_payload.get("roles", []))
            token_exp   = jwt_payload.get("exp")
            token_iat   = jwt_payload.get("iat")
            primary_role = roles[0] if roles else "ANONYMOUS"

            doc = {
                "time":         log.get("time"),
                "ip":           log.get("ip"),
                "method":       log.get("method"),
                "uri":          uri,
                "status":       int(log.get("status", 0)),
                "request_time": float(log.get("request_time", 0)),
                "bytes_sent":   int(log.get("bytes_sent", 0)),
                "user_agent":   log.get("user_agent"),
                "referer":      log.get("referer"),
                "user_email":   user_email,
                "role":         primary_role,
                "all_roles":    roles,
                "has_token":    bool(auth_header and auth_header.startswith("Bearer ")),
                "token_exp":    datetime.fromtimestamp(token_exp, tz=timezone.utc) if token_exp else None,
                "token_iat":    datetime.fromtimestamp(token_iat, tz=timezone.utc) if token_iat else None,
                "parsed_at":    datetime.now(tz=timezone.utc),
            }

            collection.insert_one(doc)
            inserted += 1

    print(f"  ✅ Done — inserted: {inserted}  |  skipped: {skipped}  |  errors: {errors}")


if __name__ == "__main__":
    main()