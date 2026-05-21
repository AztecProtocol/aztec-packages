#!/usr/bin/env bash
# Runs one BrowserStack target in ci3.
# Required env: BROWSERSTACK_USERNAME, BROWSERSTACK_ACCESS_KEY.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source $(git rev-parse --show-toplevel)/ci3/source

cd "$script_dir/.."

target="${1:?target preset required}"
flow="${2:?flow required}"
runs="${3:-2}"
config_file="$root/barretenberg/wasm-bench/wasm-bench.config.json"
if ! jq -e --arg target "$target" '.targets[$target]' "$config_file" >/dev/null; then
  echo "Unknown wasm-bench target '$target'. Available targets:" >&2
  jq -r '.targets | keys[]' "$config_file" >&2
  exit 2
fi
default_benchmark="$(jq -r '.defaultBenchmark' "$config_file")"
benchmark="${WASM_BENCH_BENCHMARK:-$default_benchmark}"
if ! jq -e --arg benchmark "$benchmark" '.benchmarks[$benchmark]' "$config_file" >/dev/null; then
  echo "Unknown wasm-bench benchmark '$benchmark'. Available benchmarks:" >&2
  jq -r '.benchmarks | keys[]' "$config_file" >&2
  exit 2
fi
smoke="${WASM_BENCH_SMOKE:-0}"
run_started_ms="$(date -u +%s%3N)"

function log_event {
  local event="${1:?event required}"
  local now_ms
  now_ms="$(date -u +%s%3N)"
  echo "WASM_BENCH_RUNNER event=$event benchmark=$benchmark target=$target flow=$flow smoke=$smoke elapsed_ms=$((now_ms - run_started_ms))"
}

export BROWSERSTACK_USERNAME="${BROWSERSTACK_USERNAME:-${BROWSERSTACK_USER_NAME:-}}"
: "${BROWSERSTACK_USERNAME:?BROWSERSTACK_USERNAME or BROWSERSTACK_USER_NAME must be set}"
: "${BROWSERSTACK_ACCESS_KEY:?BROWSERSTACK_ACCESS_KEY must be set}"

safe_benchmark="${benchmark//[^A-Za-z0-9_-]/-}"
artifact_key="$target"
if [ "$benchmark" != "$default_benchmark" ]; then
  artifact_key="$target-$safe_benchmark"
fi
artifacts_dir="${WASM_BENCH_ARTIFACTS_DIR:-$root/barretenberg/wasm-bench/bench-out/$artifact_key}"
mkdir -p "$artifacts_dir"

results_file="$artifacts_dir/results.jsonl"
progress_file="$artifacts_dir/progress.jsonl"
serve_log="$artifacts_dir/serve.log"
bs_local_log="$artifacts_dir/browserstack-local.log"
runner_log="$artifacts_dir/runner.log"
rm -f "$results_file" "$progress_file"

safe_target="${target//[^A-Za-z0-9-]/-}"
safe_flow="${flow//[^A-Za-z0-9_-]/-}"
flow_id="$(printf '%s' "$flow" | cksum | awk '{print $1}')"
local_id="wasm-bench-$safe_target-$flow_id-$$"
worker_key="$safe_target-$safe_flow"
if [ "$benchmark" != "$default_benchmark" ]; then
  worker_key="$safe_target-$safe_benchmark-$safe_flow"
fi
worker_name_prefix="wasm-bench-$worker_key"
build_label="$worker_name_prefix-$(date -u +%Y-%m-%dT%H%MZ)"

# Reap leftover BrowserStack workers from earlier failed runs of this same target.
# Errors are non-fatal, and the filter deliberately leaves unrelated BrowserStack
# sessions in the account alone.
function reap_workers {
  local name_prefix="${1:?worker name prefix required}"
  local existing
  existing=$(curl -fsS -u "$BROWSERSTACK_USERNAME:$BROWSERSTACK_ACCESS_KEY" \
    https://api.browserstack.com/5/workers 2>/dev/null | \
    jq -r --arg prefix "$name_prefix" \
      '.[]? | select(((.name // "") | startswith($prefix)) or ((.build // "") | startswith($prefix))) | .id // empty' \
      2>/dev/null || true)
  for wid in $existing; do
    echo "Reaping leftover BrowserStack worker $wid for $name_prefix"
    curl -fsS -u "$BROWSERSTACK_USERNAME:$BROWSERSTACK_ACCESS_KEY" \
      -X DELETE "https://api.browserstack.com/5/worker/$wid" >/dev/null 2>&1 || true
  done
}
reap_workers "$worker_name_prefix"

# Pinned inputs by default. Local verification can point at freshly generated
# inputs without mutating the checked-in fixture directory.
log_event "inputs_check_start"
inputs_dir="${WASM_BENCH_INPUTS_DIR:-$root/yarn-project/end-to-end/example-app-ivc-inputs-out}"
if [ ! -f "$inputs_dir/$flow/ivc-inputs.msgpack" ]; then
  if [ -n "${WASM_BENCH_INPUTS_DIR:-}" ]; then
    echo "Missing IVC inputs for flow=$flow under WASM_BENCH_INPUTS_DIR=$WASM_BENCH_INPUTS_DIR" >&2
    exit 3
  fi
  echo "Downloading pinned IVC inputs for flow=$flow"
  "$root/barretenberg/cpp/scripts/chonk_inputs.sh" download
fi
log_event "inputs_check_done"

log_event "crs_check_start"
crs_dir="${WASM_BENCH_CRS_DIR:-${BB_CRS_PATH:-$HOME/.bb-crs}}"
if { [ ! -f "$crs_dir/bn254_g1_compressed.dat" ] && [ ! -f "$crs_dir/bn254_g1.dat" ]; } ||
   [ ! -f "$crs_dir/bn254_g2.dat" ] ||
   [ ! -f "$crs_dir/grumpkin_g1.flat.dat" ]; then
  echo "Missing CRS files under $crs_dir. Run barretenberg/crs/bootstrap.sh first." >&2
  exit 3
fi
log_event "crs_check_done"

# Pick a free local port. Falls back to a random high port if python3 is missing.
port="${WASM_BENCH_PORT:-}"
if [ -z "$port" ]; then
  configured_port="$(jq -r --arg target "$target" '.targets[$target].local.port // empty' "$config_file")"
  if [ -n "$configured_port" ]; then
    port="$configured_port"
  elif command -v python3 >/dev/null 2>&1; then
    port=$(python3 - <<'PY'
import socket
s = socket.socket(); s.bind(("127.0.0.1", 0))
print(s.getsockname()[1]); s.close()
PY
)
  else
    port=$(( 20000 + RANDOM % 40000 ))
  fi
fi

scheme="$(jq -r --arg target "$target" '.targets[$target].local.scheme // "http"' "$config_file")"
runner_host="$(jq -r --arg target "$target" '.targets[$target].local.host // "localhost"' "$config_file")"
target_driver="$(jq -r --arg target "$target" '.targets[$target].driver // "worker"' "$config_file")"
serve_tls_args=()
bs_local_tls_args=()
bs_local_scope_args=()
curl_args=()
if [ "$target_driver" = "automate" ]; then
  bs_local_scope_args+=(--only-automate)
fi
if [ "$scheme" = "https" ]; then
  tls_key="$artifacts_dir/bs-local.key"
  tls_cert="$artifacts_dir/bs-local.crt"
  if [ ! -f "$tls_key" ] || [ ! -f "$tls_cert" ]; then
    if ! command -v openssl >/dev/null 2>&1; then
      echo "openssl is required to generate a local HTTPS certificate for $target" >&2
      exit 3
    fi
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$tls_key" \
      -out "$tls_cert" \
      -sha256 \
      -days 2 \
      -subj "/CN=bs-local.com" \
      -addext "subjectAltName=DNS:bs-local.com,DNS:localhost,IP:127.0.0.1" \
      >/dev/null 2>&1
  fi
  serve_tls_args+=(--https-key "$tls_key" --https-cert "$tls_cert")
  mapfile -t https_ports < <(jq -r --arg target "$target" '.targets[$target].local.httpsPorts[]? // empty' "$config_file")
  if [ ${#https_ports[@]} -eq 0 ]; then
    https_ports=("$port")
  fi
  bs_local_tls_args+=(--https-ports "$(IFS=,; echo "${https_ports[*]}")")
  curl_args+=(-k)
fi

# Launch serve-bench in its own process group so cleanup can kill the whole tree.
log_event "serve_start"
setsid node scripts/serve-bench.mjs \
  --port "$port" \
  --inputs-dir "$inputs_dir" \
  --crs-dir "$crs_dir" \
  --results-file "$results_file" \
  --progress-file "$progress_file" \
  --trace-dir "$artifacts_dir/traces" \
  "${serve_tls_args[@]}" \
  > "$serve_log" 2>&1 &
serve_pid=$!

function kill_tree {
  local pid=$1
  [ -z "${pid:-}" ] && return 0
  local pgid
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ') || true
  if [ -n "${pgid:-}" ]; then
    kill -TERM -"$pgid" 2>/dev/null || true
    sleep 0.5
    kill -KILL -"$pgid" 2>/dev/null || true
  else
    kill -TERM "$pid" 2>/dev/null || true
  fi
  wait "$pid" 2>/dev/null || true
}

function cleanup {
  set +e
  kill_tree "${bs_local_pid:-}"
  kill_tree "${serve_pid:-}"
  # Final sweep: BrowserStack workers should have been torn down by the runner,
  # but reap again so a runaway never leaks paid capacity.
  reap_workers "$worker_name_prefix"
}
trap cleanup EXIT INT TERM HUP

# Wait for serve-bench to actually accept connections before opening the tunnel.
serve_ready=0
for _ in $(seq 1 30); do
  if curl "${curl_args[@]}" -fsS -o /dev/null -m 2 "$scheme://127.0.0.1:$port/inputs/index.json" 2>/dev/null; then
    serve_ready=1
    break
  fi
  sleep 1
done
if [ "$serve_ready" -ne 1 ]; then
  echo "serve-bench never served /inputs/index.json on 127.0.0.1:$port" >&2
  cat "$serve_log" >&2 || true
  kill_tree "$serve_pid"
  exit 3
fi
log_event "serve_ready"

# BrowserStack Local tunnel, also in its own process group. BrowserStack resolves
# localhost through its own authenticated Local tunnel.
mkdir -p /tmp/bin
if [ ! -x /tmp/bin/BrowserStackLocal ]; then
  bs_zip="/tmp/bin/BrowserStackLocal-linux-x64.zip"
  curl -fsSL -o "$bs_zip" \
    https://local-downloads.browserstack.com/BrowserStackLocal-linux-x64.zip
  rm -rf /tmp/bin/browserstack-local-extract
  mkdir -p /tmp/bin/browserstack-local-extract
  python3 -m zipfile -e "$bs_zip" /tmp/bin/browserstack-local-extract
  bs_binary=$(find /tmp/bin/browserstack-local-extract -type f -name BrowserStackLocal | head -1 || true)
  if [ -z "$bs_binary" ]; then
    echo "BrowserStackLocal binary missing from downloaded archive" >&2
    exit 3
  fi
  mv "$bs_binary" /tmp/bin/BrowserStackLocal
  chmod +x /tmp/bin/BrowserStackLocal
fi
log_event "browserstack_local_start"
setsid /tmp/bin/BrowserStackLocal \
  --key "$BROWSERSTACK_ACCESS_KEY" \
  --local-identifier "$local_id" \
  --force-local \
  "${bs_local_scope_args[@]}" \
  --enable-logging-for-api \
  --enable-utc-logging \
  --log-file "$bs_local_log" \
  "${bs_local_tls_args[@]}" \
  > "$bs_local_log.stdout" 2>&1 &
bs_local_pid=$!

echo "Waiting for BrowserStack Local tunnel..."
local_ready=0
for _ in $(seq 1 90); do
  if grep -qiE "You can now access|Local Testing connection is established|connected" "$bs_local_log" "$bs_local_log.stdout" 2>/dev/null; then
    local_ready=1
    break
  fi
  if ! kill -0 "$bs_local_pid" 2>/dev/null; then
    echo "BrowserStack Local exited before readiness" >&2
    cat "$bs_local_log" "$bs_local_log.stdout" 2>/dev/null || true
    exit 4
  fi
  sleep 1
done
if [ "$local_ready" -ne 1 ]; then
  echo "BrowserStack Local did not report readiness within 90s" >&2
  cat "$bs_local_log" "$bs_local_log.stdout" 2>/dev/null || true
  exit 4
fi
echo "BrowserStack Local ready (identifier=$local_id)."
log_event "browserstack_local_ready"

trace_args=()
if [ "${WASM_BENCH_TRACE:-1}" != "0" ]; then
  trace_args+=(--trace)
fi
smoke_args=()
if [ "$smoke" = "1" ] || [ "$smoke" = "true" ]; then
  smoke_args+=(--smoke)
fi
runner_url="$scheme://$runner_host:$port"
local_identifier_args=(--local-identifier "$local_id")
deadline_ms="${WASM_BENCH_DEADLINE_MS:-$(jq -r '.timeouts.deadlineMs // 1500000' "$config_file")}"
stall_ms="${WASM_BENCH_STALL_MS:-$(jq -r '.timeouts.stallMs // 240000' "$config_file")}"

runner_exit=0
log_event "browserstack_run_start"
node scripts/run-browserstack.mjs \
  --target "$target" \
  --benchmark "$benchmark" \
  --flow "$flow" \
  --runs "$runs" \
  "${trace_args[@]}" \
  "${smoke_args[@]}" \
  --url "$runner_url" \
  "${local_identifier_args[@]}" \
  --results-file "$results_file" \
  --progress-file "$progress_file" \
  --artifacts "$artifacts_dir" \
  --name "$worker_name_prefix" \
  --build "$build_label" \
  --deadline-ms "$deadline_ms" \
  --stall-ms "$stall_ms" \
  2>&1 | tee "$runner_log" || runner_exit=$?
log_event "browserstack_run_done"

echo "==== wasm-bench asset timings ===="
grep 'WASM_BENCH_ASSET' "$serve_log" || true
echo "=================================="

# Convert the JSONL row regardless of runner outcome so partial-failure runs
# still publish something for the bencher to plot.
bench_out_name="$target-${flow//+/_}.bench.json"
bench_label="$target/${flow//+/_}"
if [ "$benchmark" != "$default_benchmark" ]; then
  bench_out_name="$safe_benchmark-$target-${flow//+/_}.bench.json"
  bench_label="wasm-bench/$benchmark/$target/${flow//+/_}"
fi
node scripts/jsonl-to-bench.mjs \
  --in "$results_file" \
  --out "$root/barretenberg/wasm-bench/bench-out/$bench_out_name" \
  --label "$bench_label" || true

exit "$runner_exit"
