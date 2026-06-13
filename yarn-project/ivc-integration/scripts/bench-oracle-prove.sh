#!/usr/bin/env bash
#
# End-to-end ChonkApi::prove benchmark on the pinned ECDSA-r1 transfer flow,
# three ways, as clean single-value prove walls:
#
#   off    - all-CPU multi-threaded Pippenger (WebGPU MSM off)
#   on     - production routing (size predicate: delegate MSMs with n >= 512)
#   oracle - dispatch ONLY the per-MSM-oracle-selected set (the MSMs that are
#            faster on the GPU) and keep the rest on CPU
#
# The oracle set is computed from a per-MSM CPU-vs-GPU CSV using WARM gpu times
# (the cold first-touch only hits the very first MSM now that there is one MSM
# program), and routed by the hook's seq-mask (bb_webgpu_route_* exports).
#
# Usage (from anywhere):
#   bash bench-oracle-prove.sh              # uses the committed seq set, runs the bench
#   REFRESH=1 bash bench-oracle-prove.sh    # re-derive the oracle set from a fresh CSV first
#   REBUILD=1 bash bench-oracle-prove.sh    # rebuild wasm + bundle first (after C++/kernel edits)
#
# Requires the hook-WASM build dir barretenberg/cpp/build-wasm-h4 (configured with
# -DBBERG_WEBGPU_MSM_HOOK=ON). REBUILD=1 stages it into the ivc-integration bundle.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"   # repo worktree root
BT="$ROOT/barretenberg/ts"
CPP="$ROOT/barretenberg/cpp"
IVC="$ROOT/yarn-project/ivc-integration"
SEQS="${SEQS:-$IVC/scripts/oracle_route_seqs.json}"
CSV="${CSV:-/tmp/msm-oracle.csv}"
JEST=(node --experimental-vm-modules "$ROOT/yarn-project/node_modules/.bin/jest")
JENV=(RAYON_NUM_THREADS=4 NODE_NO_WARNINGS=1 LOG_LEVEL=info)
TEST=src/chonk_browser_webgpu_bench.test.ts

# ---------------------------------------------------------------------------
if [ "${REBUILD:-0}" = "1" ]; then
  echo "[bench] REBUILD: wasm -> bundle"
  ninja -C "$CPP/build-wasm-h4" barretenberg.wasm
  gzip -9 -c "$CPP/build-wasm-h4/bin/barretenberg.wasm" > "$CPP/build-wasm-h4/bin/barretenberg.wasm.gz"
  ( cd "$BT" && yarn build:esm >/dev/null && npx tsgo -b tsconfig.browser.json >/dev/null )
  cp "$CPP/build-wasm-h4/bin/barretenberg.wasm.gz" "$BT/dest/browser/barretenberg_wasm/barretenberg.wasm.gz"
  cp "$CPP/build-wasm-h4/bin/barretenberg.wasm.gz" "$BT/dest/browser/barretenberg_wasm/barretenberg-threads.wasm.gz"
  ( cd "$BT" && ./scripts/browser_postprocess.sh >/dev/null )
  ( cd "$IVC" && npx webpack >/dev/null )
  echo "[bench] bundle rebuilt"
fi

# ---------------------------------------------------------------------------
if [ "${REFRESH:-0}" = "1" ] || [ ! -s "$SEQS" ]; then
  echo "[bench] deriving oracle set: per-MSM CPU-vs-GPU CSV (2 proves)..."
  ( cd "$IVC" && env "${JENV[@]}" MSM_CSV_OUT="$CSV" "${JEST[@]}" -t 'captures per-MSM' "$TEST" ) \
    > /tmp/bench_csv.log 2>&1 || { echo "CSV run failed (see /tmp/bench_csv.log)"; exit 1; }
  python3 - "$CSV" "$SEQS" <<'PY'
import csv, json, sys
from collections import defaultdict
rows = list(csv.DictReader(open(sys.argv[1])))
def f(x):
    try: return float(x)
    except: return None
# warm gpu per size = the warmest (min) gpu among same-n MSMs (drops the cold first-touch)
gpu_by_n = defaultdict(list)
for r in rows:
    g = f(r['gpu_ms']); n = int(r['n'])
    if g and g > 0: gpu_by_n[n].append(g)
warm = {n: min(gs) for n, gs in gpu_by_n.items()}
seqs, allcpu, allgpu, oracle = [], 0.0, 0.0, 0.0
for r in rows:
    c = f(r['cpu_ms']); n = int(r['n']); seq = int(r['seq'])
    if c is None: continue
    allcpu += c
    g = f(r['gpu_ms'])
    if g and g > 0: allgpu += g
    wg = warm.get(n)
    if wg is not None and wg < c:
        oracle += wg; seqs.append(seq)
    else:
        oracle += c
json.dump(sorted(seqs), open(sys.argv[2], 'w'))
print(f"[bench] oracle MSM economics: all-CPU {allcpu:.0f}ms | all-GPU {allgpu:.0f}ms | "
      f"oracle {oracle:.0f}ms (-{100*(allcpu-oracle)/allcpu:.0f}%), routing {len(seqs)} MSMs")
PY
fi

NROUTED=$(python3 -c "import json;print(len(json.load(open('$SEQS'))))")

# ---------------------------------------------------------------------------
echo "[bench] running off / on / oracle prove (3 proves, 1 session, $NROUTED MSMs routed)..."
( cd "$IVC" && env "${JENV[@]}" MSM_ORACLE_SEQS="$SEQS" "${JEST[@]}" -t 'oracle prove' "$TEST" ) \
  > /tmp/bench_oracle.log 2>&1 || { echo "oracle run failed (see /tmp/bench_oracle.log)"; tail -20 /tmp/bench_oracle.log; exit 1; }

echo
echo "================ ChonkApi::prove — end-to-end (M-series, pinned ECDSA-r1 transfer) ================"
grep -oE '\[oracle-result\][^"]*' /tmp/bench_oracle.log | sed 's/\[oracle-result\] /  /'
echo "=================================================================================================="
