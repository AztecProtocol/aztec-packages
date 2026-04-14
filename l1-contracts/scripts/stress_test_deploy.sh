#!/usr/bin/env bash
set -euo pipefail

# Stress test for forge_broadcast.js: runs N deploy cycles across parallel workers,
# each with its own anvil instance in automine mode (the mode vulnerable to the
# stranded-transaction race condition).
#
# Usage: ./scripts/stress_test_deploy.sh [TOTAL_RUNS] [WORKERS]
#   TOTAL_RUNS  Total deploy cycles to run (default: 50000)
#   WORKERS     Number of parallel workers (default: 20)

cd "$(dirname "$0")/.."

TOTAL_RUNS="${1:-50000}"
WORKERS="${2:-20}"
RESULTS_DIR="/tmp/stress_test_deploy_$$"
mkdir -p "$RESULTS_DIR"

echo "=== Stress test: $TOTAL_RUNS runs across $WORKERS workers ==="
echo "=== Results dir: $RESULTS_DIR ==="

source ./scripts/load_network_defaults.sh devnet

PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Pre-compile so workers skip compilation.
echo "=== Pre-compiling contracts ==="
forge build 2>&1 | tail -1

worker() {
  # Disable strict error handling in worker subshells — we handle errors ourselves.
  set +euo pipefail

  local worker_id="$1"
  local runs="$2"
  local pass=0
  local fail=0
  local retries_needed=0
  local results_file="$RESULTS_DIR/worker_${worker_id}.log"

  local port=$((10000 + worker_id * 100 + $$ % 50000))
  local rpc_url="http://127.0.0.1:$port"
  local broadcast_dir="/tmp/stress_broadcast_${worker_id}_$$"

  # Override foundry broadcast directory so workers don't collide.
  export FOUNDRY_BROADCAST="$broadcast_dir"
  # Allow timeout override via environment (default: auto-detected by forge_broadcast.js).
  export FORGE_BROADCAST_TIMEOUT="${FORGE_BROADCAST_TIMEOUT:-}"

  anvil --port "$port" --silent &
  local anvil_pid=$!
  sleep 1

  if ! kill -0 "$anvil_pid" 2>/dev/null; then
    echo "[worker $worker_id] ERROR: anvil failed to start on port $port"
    echo "0 $runs 0" > "$RESULTS_DIR/summary_${worker_id}.txt"
    return 1
  fi

  for ((i = 1; i <= runs; i++)); do
    rm -rf "$broadcast_dir"

    # Reset anvil between runs.
    curl -s -X POST "$rpc_url" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"anvil_reset","params":[]}' > /dev/null 2>&1 || true

    local stderr_log="/tmp/stress_stderr_${worker_id}_$$.log"
    if ./scripts/forge_broadcast.js \
      script/deploy/DeployAztecL1Contracts.s.sol:DeployAztecL1Contracts \
      --rpc-url "$rpc_url" \
      --private-key "$PRIVATE_KEY" \
      --json 2>"$stderr_log" > /dev/null; then
      pass=$((pass + 1))
      if grep -q "\-\-resume" "$stderr_log" 2>/dev/null; then
        retries_needed=$((retries_needed + 1))
        echo "[worker $worker_id] run $i/$runs: PASS (with retry)" >> "$results_file"
      else
        echo "[worker $worker_id] run $i/$runs: PASS" >> "$results_file"
      fi
    else
      fail=$((fail + 1))
      echo "[worker $worker_id] run $i/$runs: FAIL" >> "$results_file"
      cp "$stderr_log" "$RESULTS_DIR/fail_worker${worker_id}_run${i}.log" 2>/dev/null || true
    fi

    if (( i % 100 == 0 )); then
      echo "[worker $worker_id] $i/$runs done (pass=$pass fail=$fail retries=$retries_needed)"
    fi
  done

  kill "$anvil_pid" 2>/dev/null || true
  wait "$anvil_pid" 2>/dev/null || true
  rm -rf "$broadcast_dir"

  echo "$pass $fail $retries_needed" > "$RESULTS_DIR/summary_${worker_id}.txt"
  echo "[worker $worker_id] finished: pass=$pass fail=$fail retries_needed=$retries_needed"
}

runs_per_worker=$((TOTAL_RUNS / WORKERS))
remainder=$((TOTAL_RUNS % WORKERS))

pids=()
for ((w = 0; w < WORKERS; w++)); do
  extra=0
  if (( w < remainder )); then extra=1; fi
  worker "$w" "$((runs_per_worker + extra))" &
  pids+=($!)
done

echo "=== Launched $WORKERS workers, waiting for completion ==="

for pid in "${pids[@]}"; do
  wait "$pid" || true
done

all_pass=0 all_fail=0 all_retries=0
for ((w = 0; w < WORKERS; w++)); do
  if [[ -f "$RESULTS_DIR/summary_${w}.txt" ]]; then
    read -r p f r < "$RESULTS_DIR/summary_${w}.txt"
    all_pass=$((all_pass + p))
    all_fail=$((all_fail + f))
    all_retries=$((all_retries + r))
  fi
done

total=$((all_pass + all_fail))
echo ""
echo "=== STRESS TEST RESULTS ==="
echo "Total runs:      $total"
echo "Pass:            $all_pass"
echo "Fail:            $all_fail"
echo "Retries needed:  $all_retries"
echo "Failed run logs: $RESULTS_DIR/fail_*.log"
echo "==========================="
