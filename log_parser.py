"""
log_parser.py
─────────────
Reads Nginx JSON audit logs line by line (live tail),
decodes the JWT payload, and inserts each request as a
document into MongoDB collection: lawfirm_audit.requests

Requirements:
    pip install pymongo watchdog

Run:
    python log_parser.py

Configuration — edit the constants below or set environment variables.
"""

import json
import base64
import time
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient

# ✅ FIX: Use PollingObserver instead of the default Observer.
#
# On Windows, watchdog's default Observer uses ReadDirectoryChangesW, which
# can miss rapid or buffered write events — especially with Nginx, which may
# flush multiple lines at once. PollingObserver polls the filesystem on a
# fixed interval (default 1 s) and is reliable on every OS / filesystem,
# including Windows NTFS and network shares.
from watchdog.observers.polling import PollingObserver
from watchdog.events import FileSystemEventHandler

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

LOG_FILE    = os.getenv("NGINX_LOG_FILE",  r"C:\nginx-server\logs\audit.log")
MONGO_URI   = os.getenv("MONGO_URI",       "mongodb://localhost:27017")
MONGO_DB    = os.getenv("MONGO_DB",        "lawfirm_audit")
MONGO_COL   = os.getenv("MONGO_COL",       "requests")

# Endpoints to SKIP logging (static assets, favicon, etc.)
SKIP_URIS = {"/favicon.ico", "/robots.txt"}
SKIP_PREFIXES = ("/assets/", "/.well-known/")

# How often PollingObserver checks for file changes (seconds)
POLL_INTERVAL = 1


# ─────────────────────────────────────────────────────────────────────────────
# JWT DECODER  (no signature verification — we trust Nginx already did that)
# ─────────────────────────────────────────────────────────────────────────────

def decode_jwt_payload(token: str) -> dict:
    """
    Extract the payload from a JWT without verifying the signature.
    Returns a dict with keys like: sub, roles/authorities, exp, iat
    Returns {} if the token is missing or malformed.
    """
    if not token or not token.startswith("Bearer "):
        return {}

    raw = token[len("Bearer "):]
    parts = raw.split(".")
    if len(parts) != 3:
        return {}

    # JWT uses base64url — pad to multiple of 4
    payload_b64 = parts[1]
    padding = 4 - len(payload_b64) % 4
    if padding != 4:
        payload_b64 += "=" * padding

    try:
        decoded_bytes = base64.urlsafe_b64decode(payload_b64)
        return json.loads(decoded_bytes.decode("utf-8"))
    except Exception as e:
        print(f"  ⚠ JWT decode failed: {e}")
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# LOG LINE PROCESSOR
# ─────────────────────────────────────────────────────────────────────────────

def _safe_int(value, default: int = 0) -> int:
    """Convert a value to int, returning default for '-', None, or invalid strings."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value, default: float = 0.0) -> float:
    """Convert a value to float, returning default for '-', None, or invalid strings."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def process_line(line: str, collection) -> None:
    """Parse one JSON log line and insert it into MongoDB."""
    line = line.strip()
    if not line:
        return

    try:
        log = json.loads(line)
    except json.JSONDecodeError as e:
        print(f"  ⚠ Invalid JSON line skipped: {e}")
        return

    uri = log.get("uri", "")

    # Skip static/irrelevant endpoints
    if uri in SKIP_URIS or any(uri.startswith(p) for p in SKIP_PREFIXES):
        return

    # ── Decode JWT ────────────────────────────────────────────────
    auth_header  = log.get("authorization", "")
    jwt_payload  = decode_jwt_payload(auth_header)

    user_email   = jwt_payload.get("sub", None)
    roles        = jwt_payload.get("authorities", jwt_payload.get("roles", []))
    token_exp    = jwt_payload.get("exp", None)
    token_iat    = jwt_payload.get("iat", None)

    # Determine primary role (first in list)
    primary_role = roles[0] if roles else "ANONYMOUS"

    # ── Build document ────────────────────────────────────────────
    doc = {
        # --- Request data from Nginx ---
        "time":         log.get("time"),
        "ip":           log.get("ip"),
        "app":          log.get("app", "cabinet-avocat"),   # ← tagged by Nginx map block
        "method":       log.get("method"),
        "uri":          uri,
        "status":       _safe_int(log.get("status"), 0),
        "request_time": _safe_float(log.get("request_time"), 0.0),
        "bytes_sent":   _safe_int(log.get("bytes_sent"), 0),
        "user_agent":   log.get("user_agent"),
        "referer":      log.get("referer"),

        # --- Decoded JWT data ---
        "user_email":   user_email,
        "role":         primary_role,
        "all_roles":    roles,
        "token_exp":    datetime.fromtimestamp(token_exp, tz=timezone.utc) if token_exp else None,
        "token_iat":    datetime.fromtimestamp(token_iat, tz=timezone.utc) if token_iat else None,
        "has_token":    bool(auth_header and auth_header.startswith("Bearer ")),

        # --- Raw token (store or omit based on your security policy) ---
        # "raw_token": auth_header,   # ← uncomment if you want to store it

        # --- Parser metadata ---
        "parsed_at":    datetime.now(tz=timezone.utc),
    }

    try:
        collection.insert_one(doc)
        status_icon = "✅" if doc["status"] < 400 else ("⚠️" if doc["status"] < 500 else "❌")
        user_label  = user_email or "anonymous"
        print(f"  {status_icon} [{doc['status']}] {doc['method']} {uri}  →  {user_label} ({primary_role})")
    except Exception as e:
        print(f"  ❌ MongoDB insert failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# FILE TAILER  (reads new lines as Nginx appends them)
# ─────────────────────────────────────────────────────────────────────────────

class LogTailer:
    """
    Tails a growing log file and calls process_line() for each new line.

    ✅ FIX: Re-opens the file handle on every check() call instead of keeping
    a single long-lived handle. On Windows, a persistent open handle can
    prevent Nginx from writing (file-lock contention) and also means the
    tailer never sees data that was already in the OS write buffer at the time
    the handle was first opened. Re-opening each time avoids both issues.
    """

    def __init__(self, path: str, collection):
        self.path       = path
        self.collection = collection
        self._pos       = 0

    def open(self):
        """Seek to end of current file so we only process new lines."""
        with open(self.path, "r", encoding="utf-8", errors="replace") as f:
            f.seek(0, 2)                # seek to EOF
            self._pos = f.tell()
        print(f"  📂 Watching: {self.path}  (starting at byte {self._pos})")

    def check(self):
        """Read any new lines written since the last check."""
        try:
            # ✅ Open fresh each time — avoids stale handles and lock issues
            with open(self.path, "r", encoding="utf-8", errors="replace") as f:
                # ✅ Guard against log rotation: if the file shrank (Nginx
                # rotated / truncated it), reset to the beginning so we do
                # not miss lines written to the new file.
                f.seek(0, 2)
                file_size = f.tell()
                if file_size < self._pos:
                    print("  🔄 Log rotation detected — resetting position to 0")
                    self._pos = 0

                f.seek(self._pos)
                for line in f:
                    process_line(line, self.collection)
                self._pos = f.tell()

        except FileNotFoundError:
            # Log file was deleted / not yet created — wait quietly
            pass
        except Exception as e:
            print(f"  ⚠ Error reading log file: {e}")


class LogFileHandler(FileSystemEventHandler):
    def __init__(self, tailer: LogTailer):
        self._tailer = tailer

    def on_modified(self, event):
        if os.path.abspath(event.src_path) == os.path.abspath(self._tailer.path):
            self._tailer.check()

    # ✅ FIX: also handle on_created so that if the log file is rotated
    # (deleted then recreated) the tailer picks up the new file immediately.
    def on_created(self, event):
        if os.path.abspath(event.src_path) == os.path.abspath(self._tailer.path):
            print("  🆕 Log file (re)created — opening from start")
            self._tailer._pos = 0
            self._tailer.check()


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Nginx Log Parser → MongoDB")
    print("=" * 60)
    print(f"  Log file : {LOG_FILE}")
    print(f"  MongoDB  : {MONGO_URI}  /  {MONGO_DB}.{MONGO_COL}")
    print()

    # Wait for log file to exist
    log_path = Path(LOG_FILE)
    if not log_path.exists():
        print(f"  ⏳ Waiting for log file to appear: {LOG_FILE}")
        while not log_path.exists():
            time.sleep(2)

    # Connect to MongoDB
    try:
        client     = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.server_info()          # raises if unreachable
        db         = client[MONGO_DB]
        collection = db[MONGO_COL]

        # Useful indexes
        collection.create_index("time")
        collection.create_index("app")
        collection.create_index("user_email")
        collection.create_index("uri")
        collection.create_index("status")
        collection.create_index("ip")

        print(f"  ✅ Connected to MongoDB")
    except Exception as e:
        print(f"  ❌ Cannot connect to MongoDB: {e}")
        sys.exit(1)

    # Start tailing
    tailer  = LogTailer(LOG_FILE, collection)
    tailer.open()

    handler  = LogFileHandler(tailer)

    # ✅ PollingObserver: reliable on Windows (no missed events from
    # ReadDirectoryChangesW) and works on all filesystems / network drives.
    observer = PollingObserver(timeout=POLL_INTERVAL)
    observer.schedule(handler, path=str(log_path.parent), recursive=False)
    observer.start()

    print(f"  🚀 Listening for new log entries every {POLL_INTERVAL}s  (Ctrl+C to stop)\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n  🛑 Stopping...")
        observer.stop()

    observer.join()
    print("  Done.")


if __name__ == "__main__":
    main()