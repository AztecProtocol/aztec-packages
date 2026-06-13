#!/bin/bash
# profile.sh — ONE COMMAND: capture a connected Android phone running YOUR WebGPU page
# and produce a per-kernel GPU profile (named passes + HW counters) + a .perfetto trace.
#
# Your page must:
#   1. wrap every compute/render pass in pass.pushDebugGroup("name") / pass.popDebugGroup()
#      (that string becomes the kernel name on the GPU timeline), and
#   2. AUTO-RUN its work on load (ideally loop a few times so per-pass times average).
# Serve it on a localhost dev server; pass that port + the auto-running URL.
#
# Usage:  profile.sh <port> "<url>" <out-name> [for_s]
#   <url>   your auto-running page, e.g. http://localhost:8080/bench.html?run=1
#   for_s   capture seconds (default 70; must cover launch + ~30s pipeline build + your run)
# Env: ADB_SERIAL (which phone), OUTDIR (where to write traces; default $PWD),
#      WEBGPU_TRACE_HOME (deps dir; default ~/.webgpu-gpu-trace), GAPIT.
#
# Output: <out>_labeled.perfetto (open at https://ui.perfetto.dev) + a printed
#         per-kernel GPU-time and HW-counter table.
set -u
PORT="${1:?usage: profile.sh <port> \"<url>\" <out-name> [for_s]}"
URL="${2:?url}"; OUT="${3:?out-name}"; FOR="${4:-70}"
HERE="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${WEBGPU_TRACE_HOME:-$HOME/.webgpu-gpu-trace}"
VENV="$HOME_DIR/venv/bin/python"; TP="$HOME_DIR/trace_processor"
OUTDIR="${OUTDIR:-$PWD}"
RAW="$OUTDIR/${OUT}_raw.perfetto"; LABELED="$OUTDIR/${OUT}_labeled.perfetto"
SER="${ADB_SERIAL:-$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device"{print $1; exit}')}"

[ -n "$SER" ] || { echo "[profile] no adb device — run: bash $HERE/setup.sh"; exit 2; }
{ [ -x "$VENV" ] && [ -x "$TP" ]; } || { echo "[profile] deps missing — run: bash $HERE/setup.sh"; exit 2; }
case "$URL" in *\&*) echo "[profile] NOTE: your URL has '&'. 'am start -d' mangles it — if the page opens"
  echo "         without auto-running, copy redirect_template.html into your web root, point it at"
  echo "         your URL, and pass that param-less page instead." ;; esac

# kernel_counters.py / join_passtimes.py resolve trace_processor next to themselves.
ln -sf "$TP" "$HERE/trace_processor"
adb -s "$SER" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null 2>&1

# Capture via AGI System Profiler (prod driver, no Vulkan spy). gapit offers an
# interactive "press enter to stop" that EOFs on a closed stdin and ends the capture
# in ~3s — before the ~30s pipeline build finishes — so hold stdin open for FOR+15s and
# let -for bound the window. capture.sh sets the Dawn flags (timestamp_quantization off
# + use_user_defined_labels_in_backend).
if [ "${REUSE_RAW:-}" = 1 ] && [ -s "$RAW" ]; then
  echo "[profile] REUSE_RAW=1 — re-analysing existing $RAW (no capture)"
else
  echo "[profile] capturing ${FOR}s while the phone runs: $URL"
  SER="$SER" PORT="$PORT" URL="$URL" OUT="$RAW" CFG="$HERE/gpu_profile.cfg" FOR="$FOR" \
    bash "$HERE/capture.sh" < <(sleep $((FOR + 15)))
fi
[ -s "$RAW" ] || { echo "[profile] empty trace — increase for_s, and confirm the dev server is up + the page auto-runs."; exit 1; }

echo "=== per-kernel GPU time (native driver labels) ==="
"$VENV" "$HERE/label_trace.py" "$RAW" "$LABELED"

if [ -s "$LABELED" ]; then
  echo "=== per-kernel HW counters (averaged within each kernel's labeled slices) ==="
  "$VENV" "$HERE/kernel_counters.py" "$LABELED"
  echo ""
  echo "[profile] DONE → open in https://ui.perfetto.dev :  $LABELED"
else
  echo "[profile] No native labels in this trace (Adreno/Qualcomm won't relay them, or no pushDebugGroup)."
  echo "          Counters + (unnamed) compute slices are still in: $RAW"
  echo "          For per-kernel counters on a label-less driver, expose your WebGPU timestamp passTimes"
  echo "          and use join_passtimes.py — see the Adreno appendix in SKILL.md."
fi
