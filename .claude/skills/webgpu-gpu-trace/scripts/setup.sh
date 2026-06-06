#!/bin/bash
# setup.sh — ONE-TIME turnkey setup + health check for on-device WebGPU GPU profiling.
# Run this once on a new machine/phone. Idempotent: re-run any time to re-check.
# Prints PASS/FAIL per item with how to fix, then the exact next command.
#
# Deps it provisions itself: a python venv + the `perfetto` pkg + `trace_processor`,
# under $WEBGPU_TRACE_HOME (default ~/.webgpu-gpu-trace). Deps it can only CHECK +
# guide you to install: adb, gapit (AGI), and (for the debuggable host build) the
# Android command-line tools + apktool.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${WEBGPU_TRACE_HOME:-$HOME/.webgpu-gpu-trace}"
GAPIT="${GAPIT:-/Applications/AGI.app/Contents/MacOS/gapit}"
mkdir -p "$HOME_DIR"
FAIL=0
ok()  { echo "  ✅ $*"; }
bad() { echo "  ❌ $*"; FAIL=1; }
note(){ echo "     $*"; }

echo "[setup] webgpu-gpu-trace doctor  (state dir: $HOME_DIR)"

# 1. adb + a connected device
SER=""
if command -v adb >/dev/null 2>&1; then
  SER="${ADB_SERIAL:-$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')}"
  if [ -n "$SER" ]; then
    ok "adb device: $SER ($(adb -s "$SER" shell getprop ro.product.model 2>/dev/null | tr -d '\r'))"
  else
    bad "no adb device — plug in a phone, enable USB debugging, accept the prompt; verify with 'adb devices'"
  fi
else
  bad "adb not found"; note "brew install --cask android-platform-tools"
fi

# 2. gapit (Android GPU Inspector)
GAPIT_BIN=""
if [ -x "$GAPIT" ]; then GAPIT_BIN="$GAPIT"
elif command -v gapit >/dev/null 2>&1; then GAPIT_BIN="$(command -v gapit)"; fi
if [ -n "$GAPIT_BIN" ]; then ok "gapit: $GAPIT_BIN"
else bad "gapit not found"; note "download AGI from https://github.com/google/agi/releases (macOS: /Applications/AGI.app/Contents/MacOS/gapit), or set GAPIT=/path/to/gapit"; fi

# 3. python venv + perfetto
if [ ! -x "$HOME_DIR/venv/bin/python" ]; then
  echo "  … creating python venv + installing perfetto (one-time)"
  python3 -m venv "$HOME_DIR/venv" && "$HOME_DIR/venv/bin/pip" -q install perfetto
fi
if "$HOME_DIR/venv/bin/python" -c "from perfetto.protos.perfetto.trace.perfetto_trace_pb2 import Trace" >/dev/null 2>&1; then
  ok "python venv + perfetto"
else bad "perfetto python pkg unavailable"; note "$HOME_DIR/venv/bin/pip install perfetto"; fi

# 4. trace_processor
if [ ! -x "$HOME_DIR/trace_processor" ]; then
  echo "  … fetching trace_processor (one-time)"
  curl -fsSL https://get.perfetto.dev/trace_processor -o "$HOME_DIR/trace_processor" && chmod +x "$HOME_DIR/trace_processor"
fi
[ -x "$HOME_DIR/trace_processor" ] && ok "trace_processor" || { bad "trace_processor missing"; note "curl -fsSL https://get.perfetto.dev/trace_processor -o $HOME_DIR/trace_processor"; }

# 5. a debuggable WebGPU host (content_shell). Needed so gapit can launch+track the app
#    and the driver's render-stage producer attaches. Chrome itself can't be flagged on a
#    non-rooted phone.
if [ -n "$SER" ]; then
  if adb -s "$SER" shell dumpsys package org.chromium.content_shell_apk 2>/dev/null | grep -qi DEBUGGABLE; then
    ok "debuggable content_shell installed"
  elif adb -s "$SER" shell pm path org.chromium.content_shell_apk >/dev/null 2>&1; then
    echo "  … content_shell installed but NOT debuggable — rebuilding (one-time)"
    if command -v apktool >/dev/null 2>&1; then
      if SER="$SER" WORK="$HOME_DIR/cshell_build" bash "$HERE/build_debuggable_content_shell.sh" >/dev/null 2>&1; then
        ok "debuggable content_shell built + installed"
      else bad "content_shell rebuild failed — run it directly to see why: SER=$SER bash $HERE/build_debuggable_content_shell.sh"; fi
    else
      bad "apktool missing (needed to rebuild content_shell)"; note "brew install --cask android-commandlinetools; brew install apktool"
    fi
  else
    bad "content_shell not installed on the device"
    note "get a content_shell.apk (a Chromium build / CI artifact) then: APK=/path bash $HERE/build_debuggable_content_shell.sh"
  fi
fi

# 6. validate the GPU emits render stages + counters
if [ -n "$SER" ] && [ -n "$GAPIT_BIN" ]; then
  echo "  … gapit validate_gpu_profiling (≈20s)"
  if "$GAPIT_BIN" validate_gpu_profiling -serial "$SER" 2>&1 | grep -q "Device is validated"; then
    ok "gapit validate_gpu_profiling: device validated (driver emits render stages + counters)"
  else
    bad "gapit validation did not confirm — this GPU/driver may not expose perfetto render stages"
  fi
fi

echo ""
if [ "$FAIL" = 0 ]; then
  echo "[setup] ALL GOOD ✅  Next, for any auto-running WebGPU page on localhost:<port>:"
  echo "        bash $HERE/profile.sh <port> \"http://localhost:<port>/your-page.html?run=1\" myrun"
else
  echo "[setup] Fix the ❌ items above, then re-run: bash $HERE/setup.sh"
fi
exit "$FAIL"
