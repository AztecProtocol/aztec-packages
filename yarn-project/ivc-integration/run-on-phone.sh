#!/usr/bin/env bash
# Turn-key S25+ (Adreno) ChonkApi::prove runner.
#
# Runs the pinned ECDSA-r1 transfer flow through bb.js on the phone's GPU via
# the autorun page (src/serve.ts) + standalone server (serve-phone.mjs). The
# mechanism mirrors the proven webgpu-gpu-trace adreno_only_cap.sh path:
#
#   1. start the server (binds 127.0.0.1; the phone reaches it via adb reverse)
#   2. adb reverse tcp:PORT tcp:PORT  → phone loads http://localhost:PORT, which
#      is a *secure context* so SharedArrayBuffer / threaded WASM work (a plain
#      LAN-IP origin over HTTP is NOT secure and would break threads)
#   3. launch the autorun URL in the debuggable content_shell with the WebGPU
#      flags (stock Chrome can't take these flags via adb)
#   4. wait for the page's [CHONK-RESULT] beacon, captured to a results file
#
# PREREQ: the phone's adb must be reachable (USB, or wireless debugging on —
# `adb connect <ip>:<port>` first) AND the debuggable content_shell installed
# (webgpu-gpu-trace skill's build_debuggable_content_shell.sh, a one-time step).
#
# Usage:
#   bash run-on-phone.sh [mode] [serial] [port]
#     mode   = chonk-on (default; on-only GPU smoke) | chonk-webgpu (off+on vks_match)
#     serial = adb serial (default: ADB_SERIAL env, else the single connected device)
#     port   = default 5300
#   FLOW=<flow> overrides the pinned flow.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-chonk-on}"
SER="${2:-${ADB_SERIAL:-$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')}}"
PORT="${3:-5300}"
FLOW="${FLOW:-ecdsar1+transfer_1_recursions+sponsored_fpc}"
CS="${CS:-org.chromium.content_shell_apk}"; ACT="$CS/.ContentShellActivity"
RESULTS="/tmp/chonk-phone-results-${PORT}.jsonl"
CAP="${CAP:-1200}"

if [ -z "$SER" ]; then
  echo "[phone] no adb device. Enable USB or wireless debugging on the S25+:"
  echo "        - USB: plug in, accept the debugging prompt"
  echo "        - wireless: Developer options -> Wireless debugging, then"
  echo "          adb connect <phone-ip>:<port>   (port from the phone screen)"
  exit 1
fi
echo "[phone] serial=$SER port=$PORT mode=$MODE flow=$FLOW"

: > "$RESULTS"
PORT="$PORT" HOST=127.0.0.1 RESULTS_FILE="$RESULTS" node "$HERE/serve-phone.mjs" > "/tmp/serve-phone-${PORT}.log" 2>&1 &
SRV=$!
cleanup() { kill "$SRV" 2>/dev/null || true; adb -s "$SER" reverse --remove tcp:$PORT 2>/dev/null || true; }
trap cleanup EXIT
sleep 1
curl -s -o /dev/null -w "[phone] server: HTTP %{http_code}\n" "http://127.0.0.1:${PORT}/" || true

adb -s "$SER" reverse tcp:$PORT tcp:$PORT

URL="http://localhost:${PORT}/?autorun=${MODE}&flow=${FLOW}"
adb -s "$SER" shell "echo '_ --enable-unsafe-webgpu --enable-webgpu-developer-features ${URL}' > /data/local/tmp/content-shell-command-line"
adb -s "$SER" shell am force-stop "$CS" || true
adb -s "$SER" shell am start -n "$ACT" -d "$URL" >/dev/null
echo "[phone] launched content_shell at $URL; waiting up to ${CAP}s for [CHONK-RESULT]…"

for i in $(seq 1 "$CAP"); do
  sleep 1
  if [ -s "$RESULTS" ]; then
    echo "[phone] DONE after ~${i}s:"
    cat "$RESULTS"
    title=$(node -e 'const fs=require("fs");try{console.log(JSON.parse(fs.readFileSync(process.argv[1],"utf8").trim().split("\n").pop()).title)}catch{console.log("?")}' "$RESULTS")
    [ "$title" = "CHONK-DONE-OK" ] && exit 0 || exit 2
  fi
done
echo "[phone] TIMEOUT — no result after ${CAP}s. Server log tail:"
tail -20 "/tmp/serve-phone-${PORT}.log"
exit 1
