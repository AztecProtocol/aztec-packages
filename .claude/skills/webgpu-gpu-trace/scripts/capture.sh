#!/bin/bash
# Capture a perfetto GPU trace of a WebGPU page running in a debuggable Chromium host,
# using AGI's System Profiler (gapit launches+tracks the app and reads the device's
# production GPU driver — no Vulkan-intercepting spy, so no "unresponsive" watchdog).
#
# Usage (env vars):
#   SER=<adb serial>            (required; `adb devices`)
#   URL=<page url>              (required; should auto-run your algorithm on load)
#   PORT=<dev server port>      (optional; if set, runs `adb reverse tcp:PORT tcp:PORT`)
#   OUT=<out.perfetto>          (default: ./gpu_raw.perfetto)
#   CFG=<config>                (default: gpu_profile.cfg next to this script)
#   FOR=<seconds>               (default: 50; must cover app launch + pipeline build + run)
#   PKG / ACT                   (default: debuggable content_shell)
#   GAPIT=<path to gapit>       (default: /Applications/AGI.app/Contents/MacOS/gapit)
#
# IMPORTANT: URL is passed to `am start -d`. If it contains `&`, point URL at a
# param-less redirect page in your web root (see redirect_template.html) to avoid
# the shell/am mangling the query string.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
: "${SER:?set SER to your adb serial (adb devices)}"
: "${URL:?set URL to your WebGPU page (auto-running on load)}"
OUT="${OUT:-$PWD/gpu_raw.perfetto}"
CFG="${CFG:-$HERE/gpu_profile.cfg}"
FOR="${FOR:-50}"
PKG="${PKG:-org.chromium.content_shell_apk}"
ACT="${ACT:-org.chromium.content_shell_apk.ContentShellActivity}"
GAPIT="${GAPIT:-/Applications/AGI.app/Contents/MacOS/gapit}"

# The Dawn flags are what make labels appear. timestamp_quantization OFF keeps per-pass
# timestamps un-rounded; use_user_defined_labels_in_backend turns pushDebugGroup into
# Vulkan debug-utils labels that the driver records onto each GPU job.
FLAGS="--enable-unsafe-webgpu --enable-webgpu-developer-features --disable-dawn-features=timestamp_quantization --enable-dawn-features=use_user_defined_labels_in_backend"

echo "[cap] setting content-shell command-line flags"
adb -s "$SER" shell "echo '_ $FLAGS' > /data/local/tmp/content-shell-command-line"
adb -s "$SER" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1
adb -s "$SER" shell svc power stayon true >/dev/null 2>&1
[ -n "${PORT:-}" ] && adb -s "$SER" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null 2>&1
adb -s "$SER" shell am force-stop "$PKG" >/dev/null 2>&1
sleep 2

echo "[cap] gapit System Profiler: launch+track $PKG, capture ${FOR}s -> $OUT"
echo "[cap] NOTE: gapit injects its own layer; the GPU pipeline build can take ~30s,"
echo "[cap]       so FOR must be generous. A too-short window yields an empty trace."
"$GAPIT" trace -api perfetto -os android -serial "$SER" \
  -uri "$PKG/$ACT" \
  -additionalargs "-d $URL" \
  -perfetto "$CFG" -for "${FOR}s" -out "$OUT"

adb -s "$SER" shell am force-stop "$PKG" >/dev/null 2>&1
sz=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT" 2>/dev/null)
echo "[cap] captured $sz bytes -> $OUT"
echo "[cap] next: python3 $HERE/label_trace.py $OUT ${OUT%.perfetto}_labeled.perfetto"
echo "[cap] if label_trace reports 0 labeled slices, increase FOR and re-capture."
