#!/bin/bash
set +e
WT=/Users/zac/localclaudebox/wt-fp22n
TS=$WT/barretenberg/ts
PORT=5233
OUT=$WT/fp22work/DEVICE_CHECK.txt
: > "$OUT"
log(){ echo "$@" >> "$OUT"; }

log "=== fp22-native device correctness check $(date) ==="

# 1) warm profile (COW clone with SRS cached)
PROFILE=$(bash /Users/zac/localclaudebox/phonetests/warm-profile.sh /tmp/fp22n-profile 2>>"$OUT")
log "[profile] $PROFILE"

# 2) kill any stale vite on this port, start fresh
pkill -f "vite.*--port $PORT" 2>/dev/null
sleep 2
cd "$TS"
MSM_WEBGPU_RESULTS_FILE=/Users/zac/localclaudebox/phonetests/fastbench_results_${PORT}.jsonl \
  yarn dev:msm-webgpu --host 127.0.0.1 --port $PORT --strictPort > /tmp/vite_${PORT}.log 2>&1 &
VITE_PID=$!
log "[vite] pid=$VITE_PID, waiting for ready..."
# wait up to 60s for vite to serve
for i in $(seq 1 60); do
  if curl -s "http://127.0.0.1:$PORT/dev/msm-webgpu/index.html" >/dev/null 2>&1; then log "[vite] ready after ${i}s"; break; fi
  sleep 1
done

run_one(){
  local variant=$1 logn=$2
  local url="http://127.0.0.1:$PORT/dev/msm-webgpu/index.html?coi=1&autorun=msm-bench&logn=$logn&reps=3&montmul=$variant"
  log "--- variant=$variant logn=$logn ---"
  node dev/msm-webgpu/drive-persist.mjs "$url" "$PROFILE" > /tmp/drive_${variant}_${logn}.txt 2>&1
  local rc=$?
  # surface agree/disagree + DONE + any X
  grep -iE "agree|disagree|\[bench\] DONE|gpu X|gpu=|error|fail" /tmp/drive_${variant}_${logn}.txt | head -20 | sed 's/^/    /' >> "$OUT"
  log "    (driver rc=$rc)"
}

# fp22native is the variant under test; karat is the trusted reference path.
run_one fp22native 14
run_one fp22native 17
run_one karat 14

# verdict
log ""
A14=$(grep -ic "agree" /tmp/drive_fp22native_14.txt)
D14=$(grep -ic "disagree" /tmp/drive_fp22native_14.txt)
A17=$(grep -ic "agree" /tmp/drive_fp22native_17.txt)
D17=$(grep -ic "disagree" /tmp/drive_fp22native_17.txt)
log "fp22native logn14: agree_hits=$A14 disagree_hits=$D14"
log "fp22native logn17: agree_hits=$A17 disagree_hits=$D17"
if [ "$D14" = "0" ] && [ "$A14" -gt 0 ] && [ "$D17" = "0" ] && [ "$A17" -gt 0 ]; then
  log "VERDICT: PASS — fp22native GPU output agrees with WASM oracle at logn=14 AND 17"
else
  log "VERDICT: INCONCLUSIVE/FAIL — inspect /tmp/drive_fp22native_*.txt"
fi

pkill -f "vite.*--port $PORT" 2>/dev/null
log "=== DONE ==="
