"""Test that the rk.py proxy pattern correctly passes through compressed
content from a Flask-Compress backend without double-compression.

Spins up two Flask servers:
  - backend  (Flask-Compress enabled)  — simulates ci-metrics on port 8081
  - proxy    (Flask-Compress enabled)  — simulates rk.py on port 8080

Verifies that a client fetching through the proxy gets correct, readable
content regardless of Accept-Encoding.
"""
import gzip
import io
import json
import os
import socket
import sys
import threading
import time
import urllib.request

import requests as req_lib
from flask import Flask, Response, request
from flask_compress import Compress

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
RED = "\033[0;31m"
GREEN = "\033[0;32m"
NC = "\033[0m"

_pass_count = 0
_fail_count = 0


def ok(name):
    global _pass_count
    print(f"{GREEN}\u2713{NC} {name}")
    _pass_count += 1


def fail(name, detail=""):
    global _fail_count
    print(f"{RED}\u2717{NC} {name}")
    if detail:
        print(f"  {detail}")
    _fail_count += 1


def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for_port(port, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.1)
    return False


# ---------------------------------------------------------------------------
# Backend: simulates ci-metrics with Flask-Compress
# ---------------------------------------------------------------------------
BACKEND_PORT = get_free_port()

backend = Flask("backend")
Compress(backend)

LARGE_HTML = "<!DOCTYPE html><html><body>" + "<p>row</p>\n" * 500 + "</body></html>"
API_JSON = {"status": "ok", "values": list(range(100))}


@backend.route("/test-page")
def backend_page():
    return LARGE_HTML


@backend.route("/api/test")
def backend_api():
    return Response(json.dumps(API_JSON), mimetype="application/json")


# ---------------------------------------------------------------------------
# Proxy: simulates rk.py with Flask-Compress + raw-stream passthrough
# ---------------------------------------------------------------------------
PROXY_PORT = get_free_port()

proxy = Flask("proxy")
Compress(proxy)

_session = req_lib.Session()
_HOP_BY_HOP = frozenset([
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
])
_STRIP_REQUEST = frozenset(["host"])


@proxy.route("/<path:path>")
def proxy_handler(path):
    url = f"http://127.0.0.1:{BACKEND_PORT}/{path}"
    fwd = {k: v for k, v in request.headers if k.lower() not in _STRIP_REQUEST}
    resp = _session.request(
        method=request.method,
        url=url,
        params=request.args,
        headers=fwd,
        stream=True,
        timeout=10,
    )
    headers = {k: v for k, v in resp.headers.items()
               if k.lower() not in _HOP_BY_HOP}
    return Response(resp.raw.stream(8192),
                    status=resp.status_code, headers=headers)


# ---------------------------------------------------------------------------
# Start servers
# ---------------------------------------------------------------------------
def _run(app, port):
    # Silence Flask/werkzeug request logs
    import logging
    log = logging.getLogger("werkzeug")
    log.setLevel(logging.ERROR)
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)


threading.Thread(target=_run, args=(backend, BACKEND_PORT), daemon=True).start()
threading.Thread(target=_run, args=(proxy, PROXY_PORT), daemon=True).start()

assert wait_for_port(BACKEND_PORT), "Backend failed to start"
assert wait_for_port(PROXY_PORT), "Proxy failed to start"

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
print("=== Proxy Compression Tests ===")

# 1. HTML content through proxy — requests auto-decompresses
r = req_lib.get(f"http://127.0.0.1:{PROXY_PORT}/test-page",
                headers={"Accept-Encoding": "gzip, deflate"})
if r.status_code == 200:
    ok("HTML proxy returns 200")
else:
    fail("HTML proxy returns 200", f"got {r.status_code}")

if r.text == LARGE_HTML:
    ok("HTML content matches through proxy")
else:
    fail("HTML content matches through proxy",
         f"length {len(r.text)} vs expected {len(LARGE_HTML)}, "
         f"starts with: {repr(r.text[:80])}")

# 2. JSON content through proxy
r = req_lib.get(f"http://127.0.0.1:{PROXY_PORT}/api/test",
                headers={"Accept-Encoding": "gzip, deflate"})
try:
    got = r.json()
    if got == API_JSON:
        ok("JSON content matches through proxy")
    else:
        fail("JSON content matches through proxy", f"got {got}")
except Exception as e:
    fail("JSON content matches through proxy", f"parse error: {e}")

# 3. Raw wire check: content should be gzip-compressed on the wire
#    Use urllib which does NOT auto-decompress.
rq = urllib.request.Request(
    f"http://127.0.0.1:{PROXY_PORT}/test-page",
    headers={"Accept-Encoding": "gzip"},
)
with urllib.request.urlopen(rq) as resp:
    raw = resp.read()
    ce = resp.headers.get("Content-Encoding", "")

if ce == "gzip":
    ok("Content-Encoding is gzip on the wire")
else:
    fail("Content-Encoding is gzip on the wire", f"got '{ce}'")

if raw[:2] == b"\x1f\x8b":
    ok("Raw bytes are gzip-compressed")
else:
    fail("Raw bytes are gzip-compressed", f"starts with {raw[:4]!r}")

# 4. No double-compression: decompressing once yields the original content
try:
    decompressed = gzip.decompress(raw).decode("utf-8")
    if decompressed == LARGE_HTML:
        ok("Single gzip decompression yields original content (no double-compress)")
    else:
        fail("Single gzip decompression yields original content",
             f"length {len(decompressed)} vs {len(LARGE_HTML)}")
except Exception as e:
    fail("Single gzip decompression yields original content", str(e))

# 5. Identity encoding (no compression requested)
r = req_lib.get(f"http://127.0.0.1:{PROXY_PORT}/test-page",
                headers={"Accept-Encoding": "identity"})
if r.text == LARGE_HTML:
    ok("Identity encoding returns correct content")
else:
    fail("Identity encoding returns correct content",
         f"length {len(r.text)}, starts with: {repr(r.text[:80])}")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
if _fail_count == 0:
    print(f"{GREEN}All {_pass_count} proxy tests passed.{NC}")
    sys.exit(0)
else:
    print(f"{RED}{_fail_count} proxy tests failed.{NC}")
    sys.exit(1)
