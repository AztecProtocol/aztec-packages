#!/bin/bash
# gpu-profile.sh — PER-KERNEL GPU COUNTER profile + labeled perfetto trace of the
# WebGPU MSM on a connected Android phone (Mali render stages + HW counters), via
# AGI/gapit's System Profiler (production driver, NO Vulkan-intercepting spy → no
# "app unresponsive" watchdog). This is the "proper profiling" path: real hardware
# counters attributed per kernel, plus a .perfetto you can open in ui.perfetto.dev.
#
# It drives the page's ?trace=1 mode: ONE page load runs `reps` single MSMs with
# 60ms idle gaps (distinct compute bursts) and posts per-pass WebGPU timestamps
# (passTimes) to the results JSONL. Two independent per-kernel attributions:
#   - join_passtimes.py: aligns passTimes to the counter tracks  -> per-kernel counters
#   - label_trace.py:    promotes native debug-utils labels       -> named .perfetto
#
# Usage:
#   gpu-profile.sh <port> "<msm-config-query>" <out-name> [logn] [reps] [profile] [for_s]
# Examples:
#   gpu-profile.sh 5210 ""                         baseline   17 20 A 70
#   gpu-profile.sh 5210 "montmul=cios_native"      native     17 20 A 70
#   gpu-profile.sh 5210 "montmul=cios_native&pk14=1" native_pk14 17 20 A 70
#
# Env: ADB_SERIAL (which phone), CTR (override the delta-fit counter name),
#      GAPIT (path to gapit). Requires the venv + trace_processor set up by the
#      one-time bootstrap below (auto-runs if missing).
set -u
PORT="${1:?port}"; CFGQ="${2-}"; OUT="${3:?out-name}"
LOGN="${4:-17}"; REPS="${5:-20}"; PROFILE="${6:-A}"; FOR="${7:-70}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WEBROOT="$(cd "$HERE/.." && pwd)"                       # dev/msm-webgpu (serves go.html)
SER="${ADB_SERIAL:-$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')}"
[ -n "$SER" ] || { echo "[gpu-profile] no adb device (set ADB_SERIAL)"; exit 2; }
SCRATCH="$HOME/localclaudebox/phonetests"
RF="$SCRATCH/fastbench_results_${PORT}.jsonl"
VENV="$SCRATCH/venv/bin/python"
TP="$SCRATCH/trace_processor"
RAW="$SCRATCH/${OUT}_raw.perfetto"; LABELED="$SCRATCH/${OUT}_labeled.perfetto"; PT="$SCRATCH/${OUT}_passtimes.json"

# --- one-time bootstrap (venv + perfetto + trace_processor); idempotent ---
if [ ! -x "$VENV" ]; then
  echo "[gpu-profile] bootstrapping python venv + perfetto (one-time)..."
  python3 -m venv "$SCRATCH/venv" && "$SCRATCH/venv/bin/pip" install -q perfetto
fi
if [ ! -x "$TP" ]; then
  echo "[gpu-profile] fetching trace_processor (one-time)..."
  curl -fsSL https://get.perfetto.dev/trace_processor -o "$TP" && chmod +x "$TP"
fi
# join_passtimes.py resolves `trace_processor` next to ITSELF (here), so symlink the
# scratch binary in (gitignored). Also put it on PATH for label_trace.
ln -sf "$TP" "$HERE/trace_processor"
export PATH="$SCRATCH:$PATH"

# --- 1) param-less redirect (am-start -d mangles '&'); page auto-runs ?trace=1 ---
URL="/dev/msm-webgpu/index.html?autorun=msm-bench&no_wasm=1&trace=1&logn=$LOGN&reps=$REPS&scalar_dist=profile&profile=$PROFILE${CFGQ:+&$CFGQ}"
printf "<!DOCTYPE html><meta charset=utf-8><script>location.replace('%s');</script>\n" "$URL" > "$WEBROOT/go.html"
echo "[gpu-profile] target: $URL"
BEFORE=$(wc -l < "$RF" 2>/dev/null || echo 0)

# --- 2) capture (gapit System Profiler: render stages + HW counters; sets the Dawn
#        flags timestamp_quantization=off + use_user_defined_labels_in_backend) ---
# gapit offers an interactive "Press enter to stop capturing"; a closed stdin EOFs
# immediately and stops the capture in ~3s (before the ~30s pipeline build even
# finishes). Hold stdin open for FOR+15s so `-for` is what bounds the window.
SER="$SER" PORT="$PORT" \
  URL="http://localhost:$PORT/dev/msm-webgpu/go.html" \
  OUT="$RAW" CFG="$HERE/gpu_profile.cfg" FOR="$FOR" \
  bash "$HERE/capture.sh" < <(sleep $((FOR + 15)))
[ -s "$RAW" ] || { echo "[gpu-profile] ERROR: empty trace ($RAW). Increase for_s; confirm the dev server + adb reverse."; exit 1; }

# --- 3) grab the app's passTimes (the new results row this run posted) ---
tail -n +"$((BEFORE+1))" "$RF" 2>/dev/null | tail -1 > "$PT"
echo "[gpu-profile] passTimes row -> $PT ($(wc -c <"$PT" 2>/dev/null || echo 0) B)"

# --- 4) labeled .perfetto (native render-stage labels -> per-kernel named slices) ---
echo "=== label_trace (per-kernel GPU time, native labels) ==="
"$VENV" "$HERE/label_trace.py" "$RAW" "$LABELED" || echo "[gpu-profile] label_trace: no native labels (Mali should have them; check the flag)"

# --- 5) per-kernel HW COUNTERS. On Mali the driver records real per-slice times on
#        the native-labeled render stages, so average each counter WITHIN those
#        labeled slices (no clock-fit needed). join_passtimes.py is the ADRENO
#        fallback (driver won't relay labels there) and must NOT be used on Mali:
#        Mali coalesces pass-begins so the passTimes windows are garbage. ---
if [ -s "$LABELED" ]; then
  echo "=== per-kernel HW counters (avg within native-labeled slices) ==="
  "$VENV" "$HERE/kernel_counters.py" "$LABELED" 2>/dev/null
  echo "[gpu-profile] sfu_util = integer-multiply peak (Mali maps int mul onto the SFU pipe);"
  echo "[gpu-profile] high sfu/util + high starv => occupancy/latency-bound (the register-pressure regime)."
elif [ "$(wc -c <"$PT" 2>/dev/null || echo 0)" -gt 5 ]; then
  # Adreno path: no native labels; join the app's passTimes to the counters.
  CTRNAME="${CTR:-$("$TP" "$RAW" -q <(printf "SELECT t.name FROM counter c JOIN track t ON c.track_id=t.id GROUP BY t.name ORDER BY count(*) DESC;") 2>/dev/null | tr -d '"' | grep -iE "util|active|busy|compute" | grep -iv "starv" | head -1)}"
  echo "=== join_passtimes (Adreno fallback; delta-fit on '${CTRNAME:-% Time Compute}') ==="
  "$VENV" "$HERE/join_passtimes.py" "$RAW" "$PT" "${CTRNAME:-% Time Compute}" || echo "[gpu-profile] join_passtimes failed"
else
  echo "[gpu-profile] no labels and no passTimes — check the capture window / flags."
fi

echo "[gpu-profile] DONE. open in https://ui.perfetto.dev :  $LABELED"
echo "[gpu-profile] available counters in this trace:"
"$TP" "$RAW" -q <(printf "SELECT t.name, count(*) n FROM counter c JOIN track t ON c.track_id=t.id GROUP BY t.name ORDER BY n DESC;") 2>/dev/null | head -12
