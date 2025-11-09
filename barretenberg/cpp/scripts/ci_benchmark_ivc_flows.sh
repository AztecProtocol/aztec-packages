#!/usr/bin/env bash
# Performs the chonk private transaction proving benchmarks for our 'realistic apps'.
# This is called by yarn-project/end-to-end/bootstrap.sh bench, which creates these inputs from end-to-end tests.
source $(git rev-parse --show-toplevel)/ci3/source
source $(git rev-parse --show-toplevel)/ci3/source_redis
source $(git rev-parse --show-toplevel)/ci3/source_cache

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <runtime> <benchmark_folder>"
  exit 1
fi
cd ..

echo_header "bb ivc flow bench"

export HARDWARE_CONCURRENCY=${CPUS:-8}
# E.g. build, build-debug or build-coverage
export native_build_dir=$(scripts/native-preset-build-dir)

function verify_ivc_flow {
  local flow="$1"
  local proof="$2"
  # Check that this verifies with one of our verification keys and fails with the other.
  # NOTE: This is effectively a test.
  # TODO(AD): Checking which one would be good, but there isn't too much that can go wrong here.
  set +e
  echo_stderr "Private verify."
  "./$native_build_dir/bin/bb" verify --scheme chonk -p "$proof" -k ../../noir-projects/noir-protocol-circuits/target/keys/hiding_kernel_to_rollup.ivc.vk 1>&2
  local private_result=$?
  echo_stderr "Private verify: $private_result."
  "./$native_build_dir/bin/bb" verify --scheme chonk -p "$proof" -k ../../noir-projects/noir-protocol-circuits/target/keys/hiding_kernel_to_public.ivc.vk 1>&2
  local public_result=$?
  echo_stderr "Public verify: $public_result."
  if [[ $private_result -eq $public_result ]]; then
    echo_stderr "Verification failed for $flow. Both keys returned $private_result - only one should."
    exit 1
  fi
  if [[ $private_result -ne 0 ]] && [[ $public_result -ne 0 ]]; then
    echo_stderr "Verification failed for $flow. Did not verify with precalculated verification key - we may need to revisit how it is generated in noir-projects/noir-protocol-circuits."
    exit 1
  fi
}

function run_bb_cli_bench {
  local runtime="$1"
  local output="$2"
  shift 2

  if [[ "$runtime" == "native" ]]; then
    # Add --bench_out_hierarchical flag for native builds to capture hierarchical op counts and timings
    memusage "./$native_build_dir/bin/bb" "$@" "--bench_out_hierarchical" "$output/benchmark_breakdown.json" || {
      echo "bb native failed with args: $@ --bench_out_hierarchical $output/benchmark_breakdown.json"
      exit 1
    }
  else # wasm
    export WASMTIME_ALLOWED_DIRS="--dir=$flow_folder --dir=$output"
    # Add --bench_out_hierarchical flag for wasm builds to capture hierarchical op counts and timings
    memusage scripts/wasmtime.sh $WASMTIME_ALLOWED_DIRS ./build-wasm-threads/bin/bb "$@" "--bench_out_hierarchical" "$output/benchmark_breakdown.json" || {
      echo "bb wasm failed with args: $@ --bench_out_hierarchical $output/benchmark_breakdown.json"
      exit 1
    }
  fi
}

function chonk_flow {
  set -eu
  local runtime="$1"
  local flow_folder="$2"
  local flow="$(basename $flow_folder)"
  local start=$(date +%s%N)

  local name_path="app-proving/$flow/$runtime"
  local output="bench-out/$name_path"
  rm -rf "$output"
  mkdir -p "$output"
  export MEMUSAGE_OUT="$output/peak-memory-mb.txt"

  run_bb_cli_bench "$runtime" "$output" prove -o $output --ivc_inputs_path $flow_folder/ivc-inputs.msgpack --scheme chonk -v --print_bench

  local end=$(date +%s%N)
  local elapsed_ns=$(( end - start ))
  local elapsed_ms=$(( elapsed_ns / 1000000 ))
  local memory_taken_mb=$(cat "$MEMUSAGE_OUT")

  echo "$flow ($runtime) has proven in $((elapsed_ms / 1000))s and peak memory of ${memory_taken_mb}MB."
  dump_fail "verify_ivc_flow $flow $output/proof"
  echo "$flow ($runtime) has verified."
  # Get proof size after compression
  tar -czf "$output/proof.tar.gz" -C "$output" proof
  local proof_size_bytes=$(stat -c%s "$output/proof.tar.gz" 2>/dev/null || stat -f%z "$output/proof.tar.gz")
  local proof_size_kb=$(( proof_size_bytes / 1024 ))

  cat > "$output/benchmarks.bench.json" <<EOF
[
  {
    "name": "$name_path/seconds",
    "unit": "ms",
    "value": ${elapsed_ms}
  },
  {
    "name": "$name_path/memory",
    "unit": "MB",
    "value": ${memory_taken_mb}
  },
  {
    "name": "$name_path/proof-size",
    "unit": "KB",
    "value": ${proof_size_kb}
  }
]
EOF
}

export -f verify_ivc_flow run_bb_cli_bench

chonk_flow $1 $2

# Upload benchmark breakdown (op counts and timings) to disk if running in CI
if [[ "${CI:-}" == "1" ]] && [[ "${CI_ENABLE_DISK_LOGS:-0}" == "1" ]]; then
  echo_header "Uploading Barretenberg benchmark breakdowns"

  runtime="$1"
  flow_name="$(basename $2)"
  benchmark_breakdown_file="bench-out/app-proving/$flow_name/$runtime/benchmark_breakdown.json"

  if [[ -f "$benchmark_breakdown_file" ]]; then
    # TODO(AD): make this robust. not erroring if this breaks is not great.
    set +e
    current_sha=$(git rev-parse HEAD)

    # Copy to /tmp with unique name to avoid race conditions with concurrent flows
    # Other flows might delete bench-out before we finish uploading
    tmp_breakdown_file="/tmp/benchmark_breakdown_${runtime}_${flow_name}_$$.json"
    cp "$benchmark_breakdown_file" "$tmp_breakdown_file"

    # Create cache key: bench-bb-breakdown-<runtime>-<flow_name>-<sha>
    # This will be accessible at: http://ci.aztec-labs.com/bench-bb-breakdown-<runtime>-<flow_name>-<sha>
    cache_key="bench-bb-breakdown-${runtime}-${flow_name}-${current_sha}"

    # Upload to Redis (30 day retention) and disk (bench/bb-breakdown subfolder) in background
    {
      # Write to Redis for ci.aztec-labs.com access
      cat "$tmp_breakdown_file" | gzip | redis_cli -x SETEX "$cache_key" 2592000 &>/dev/null

      # Write to disk in explicit subfolder (only if disk logging enabled)
      if [[ "${CI_ENABLE_DISK_LOGS:-0}" == "1" ]]; then
        # Strip the prefix from key when writing to disk subfolder
        disk_key="${cache_key#bench-bb-breakdown-}"
        cat "$tmp_breakdown_file" | gzip | cache_disk_transfer_to "bench/bb-breakdown" "$disk_key"
      fi
    } &

    # Also commit to gh-pages for public access via GitHub raw URLs
    # Run in foreground to catch any errors
    gh auth setup-git &>/dev/null || true

    # Clone gh-pages once (shallow clone for speed)
    rm -rf "/tmp/gh-pages-$$" 2>/dev/null || true
    if ! git clone --depth 1 --branch gh-pages "$(git config --get remote.origin.url)" /tmp/gh-pages-$$; then
      echo "Failed to clone gh-pages, skipping upload"
    else
      cd "/tmp/gh-pages-$$"
      git config user.name "Aztec Bot"
      git config user.email "bot@aztec.network"

      # Create directory structure: bench/barretenberg-breakdowns/<flow>/<runtime>-<sha>.json
      mkdir -p "bench/barretenberg-breakdowns/${flow_name}"
      cp "$tmp_breakdown_file" "bench/barretenberg-breakdowns/${flow_name}/${runtime}-${current_sha:0:7}.json"

      git add "bench/barretenberg-breakdowns/"

      if ! git diff --staged --quiet; then
        git commit -m "Add ${runtime} benchmark breakdown for ${flow_name} at ${current_sha:0:7}"

        # Retry push up to 5 times with pull-rebase to handle concurrent pushes
        for push_attempt in {1..5}; do
          if git push 2>&1; then
            echo "Successfully pushed breakdown to gh-pages"
            break
          else
            echo "Push failed (attempt $push_attempt/5), pulling with rebase and retrying..."
            # Pull with rebase to get latest changes and replay our commit on top
            if git pull --rebase origin gh-pages; then
              sleep $((push_attempt * 2))
            else
              echo "Rebase failed, this might happen if file already exists with same content"
              break
            fi
          fi
        done
      else
        echo "No changes to commit (file already exists)"
      fi

      cd - > /dev/null
      rm -rf "/tmp/gh-pages-$$"
    fi

    # Clean up tmp file
    rm -f "$tmp_breakdown_file"

    echo "Uploaded benchmark breakdown: http://ci.aztec-labs.com/$cache_key"
  else
    echo "Warning: benchmark breakdown file not found at $benchmark_breakdown_file"
  fi
fi
