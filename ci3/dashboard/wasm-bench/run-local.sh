#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

venv_dir="${RKAPP_VENV:-/tmp/rkapp-dashboard-venv}"
if [ ! -d "$venv_dir" ]; then
  python3 -m venv "$venv_dir"
  "$venv_dir/bin/pip" install -q -r requirements.txt
fi

export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-9999}"
export REDIS_TIMEOUT="${REDIS_TIMEOUT:-0.1}"
export LOGS_DISK_PATH="${LOGS_DISK_PATH:-/tmp/rkapp-test-data}"

sample="${WASM_BENCH_SAMPLE:-/tmp/pr92-wasm-bench-artifacts/barretenberg/wasm-bench/bench-out}"
if [ -f "$sample/trace-manifest.json" ]; then
  sample_id="${WASM_BENCH_SAMPLE_ID:-}"
  if [ -z "$sample_id" ]; then
    sample_id="$(sed -n 's/.*"artifactName": "wasm-bench-artifacts-\([0-9a-f]\{40\}\).*/\1/p' "$sample/trace-manifest.json" | head -n 1)"
    sample_id="${sample_id:-sample}"
  fi
  dest="$LOGS_DISK_PATH/bench/wasm-bench/$sample_id"
  if [ ! -f "$dest/trace-manifest.json" ]; then
    mkdir -p "$dest"
    cp -R "$sample"/. "$dest"/
  fi
fi

echo "Wasm bench data: $LOGS_DISK_PATH/bench/wasm-bench"
find "$LOGS_DISK_PATH/bench/wasm-bench" -maxdepth 2 -name trace-manifest.json -print 2>/dev/null || true
echo "Wasm bench viewer: http://localhost:8080/wasm-bench"

"$venv_dir/bin/python3" rk.py
