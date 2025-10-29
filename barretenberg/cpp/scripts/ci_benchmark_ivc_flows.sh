#!/usr/bin/env bash
# Performs the chonk private transaction proving benchmarks for our 'realistic apps'.
# This is called by yarn-project/end-to-end/bootstrap.sh bench, which creates these inputs from end-to-end tests.
source $(git rev-parse --show-toplevel)/ci3/source

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
    # TODO support wasm op count time preset
    memusage scripts/wasmtime.sh $WASMTIME_ALLOWED_DIRS ./build-wasm-threads/bin/bb "$@" || {
      echo "bb wasm failed with args: $@"
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
  }
]
EOF
}

export -f verify_ivc_flow run_bb_cli_bench

chonk_flow $1 $2

# Upload benchmark breakdown (op counts and timings) to gh-pages if running in CI and it's a native build
if [[ "${CI:-}" == "1" ]] && [[ "$1" == "native" ]]; then
  echo_header "Uploading Barretenberg benchmark breakdowns to gh-pages"

  flow_name="$(basename $2)"
  benchmark_breakdown_file="bench-out/app-proving/$flow_name/native/benchmark_breakdown.json"

  if [[ -f "$benchmark_breakdown_file" ]]; then
    current_sha=$(git rev-parse HEAD)

    # CI needs to authenticate from GITHUB_TOKEN.
    gh auth setup-git &>/dev/null || true

    # Shallow clone gh-pages branch with retry logic
    rm -rf gh-pages-repo
    for clone_attempt in 1 2 3; do
      if git clone --depth 1 --branch gh-pages "$(git config --get remote.origin.url)" gh-pages-repo; then
        break
      else
        echo "Clone failed, retrying (attempt $clone_attempt/3)..."
        rm -rf gh-pages-repo
        if [[ $clone_attempt -eq 3 ]]; then
          echo "Failed to clone gh-pages after 3 attempts"
          exit 1
        fi
        sleep 2
      fi
    done

    # Create target directory for this flow
    mkdir -p "gh-pages-repo/bench/barretenberg-breakdowns/${flow_name}"

    # Copy benchmark breakdown JSON (contains op counts and timing data) with commit SHA as filename
    cp "$benchmark_breakdown_file" "gh-pages-repo/bench/barretenberg-breakdowns/${flow_name}/${current_sha}.json"

    # Commit and push with retry on race condition
    cd gh-pages-repo
    git config user.name "Aztec Bot"
    git config user.email "bot@aztec.network"
    git add bench/barretenberg-breakdowns/
    if ! git diff --staged --quiet; then
      git commit -m "Update Barretenberg benchmark breakdowns (op counts and timings) for ${current_sha}"

      # Retry push up to 3 times in case of race conditions
      for attempt in 1 2 3; do
        if git push; then
          break
        elif [[ $attempt -lt 3 ]]; then
          echo "Push failed, retrying after fetch and rebase (attempt $attempt/3)..."
          git fetch origin gh-pages
          git rebase origin/gh-pages
        else
          echo "Push failed after 3 attempts"
          exit 1
        fi
      done
    fi
    cd ..

    # Clean up the shallow clone
    rm -rf gh-pages-repo
  else
    echo "Warning: benchmark breakdown file not found at $benchmark_breakdown_file"
  fi
fi
