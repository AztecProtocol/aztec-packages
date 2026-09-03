#!/usr/bin/env bash
# Benchmarks UltraHonk proving for protocol circuits (e.g., base parity).
# This script runs bb prove with different HARDWARE_CONCURRENCY values and captures hierarchical timing breakdowns.
#
# Usage: ci_benchmark_ultrahonk_circuits.sh <circuit_name> <inputs_folder> <cpus>
# Example: ci_benchmark_ultrahonk_circuits.sh parity_base ../../labs/yarn-project/end-to-end/ultrahonk-bench-inputs 8
#
# The inputs_folder should contain:
#   - <circuit_name>.json (the circuit artifact with bytecode)
#   - witness.gz (the compressed witness)

own_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NO_CD=1 source "$(git rev-parse --show-toplevel)/ci3/source"
source "$root/ci3/source_redis"
source "$root/ci3/source_cache"

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <circuit_name> <inputs_folder> <cpus>"
  echo "Example: $0 parity_base ./bench-inputs/base-parity 8"
  exit 1
fi

cd "$own_dir/.."

circuit_name="$1"
inputs_folder="$2"
cpus="$3"

echo_header "UltraHonk benchmark: $circuit_name (CPUS=$cpus)"

export HARDWARE_CONCURRENCY="$cpus"
export native_build_dir=$(scripts/preset-build-dir)

function ultrahonk_inputs_present {
  local dir="$1"
  local expected_hash="${2:-}"
  local marker="$dir/.ultrahonk-bench-inputs.hash"
  if [[ -n "$expected_hash" ]] && [[ ! -f "$marker" || "$(<"$marker")" != "$expected_hash" ]]; then
    return 1
  fi
  [[ -f "$dir/${circuit_name}.json" && -f "$dir/witness.gz" ]]
}

function generate_ultrahonk_inputs {
  local dir="$1"
  local state_dir
  if [[ "$circuit_name" != "parity_base" ]]; then
    echo_stderr "Error: automatic UltraHonk input generation currently supports parity_base only."
    exit 1
  fi

  state_dir="$root/.cache/ultrahonk-bench-inputs/generate-$$"
  rm -rf "$state_dir"
  mkdir -p "$state_dir"
  if ! (
    cd "$root/labs/yarn-project"
    BASE_PARITY_BENCH_DIR="$state_dir" yarn workspace @aztec/ivc-integration test src/base_parity_inputs.test.ts
  ); then
    rm -rf "$state_dir"
    return 1
  fi

  rm -rf "$dir"
  mkdir -p "$(dirname "$dir")"
  mv "$state_dir" "$dir"
}

function restore_cached_ultrahonk_inputs {
  local dir="$1"
  local cache_name="$2"
  local state_dir cached_dir
  if [[ "$(basename "$dir")" != "ultrahonk-bench-inputs" ]]; then
    return 1
  fi

  state_dir="$root/.cache/ultrahonk-bench-inputs/cache-$$"
  cached_dir="$state_dir/ultrahonk-bench-inputs"
  rm -rf "$state_dir"
  mkdir -p "$state_dir"
  if cache_download "$cache_name" "$state_dir" && ultrahonk_inputs_present "$cached_dir"; then
    rm -rf "$dir"
    mkdir -p "$(dirname "$dir")"
    mv "$cached_dir" "$dir"
    rm -rf "$state_dir"
    return 0
  fi

  rm -rf "$state_dir"
  return 1
}

function ensure_ultrahonk_inputs {
  local requested="$1"
  local abs_inputs cache_hash cache_name lock_dir lock_file
  abs_inputs="$(realpath -m "$requested")"

  cache_hash="$(cd "$root/labs/yarn-project" && env -u root -u ci3 ./bootstrap.sh hash)"
  cache_name="bb-ultrahonk-bench-inputs-${cache_hash}.tar.gz"

  if ultrahonk_inputs_present "$abs_inputs" "$cache_hash"; then
    inputs_folder="$abs_inputs"
    return
  fi

  lock_dir="$root/.cache/ultrahonk-bench-inputs/locks"
  mkdir -p "$lock_dir"
  lock_file="$lock_dir/$(printf '%s' "$abs_inputs" | sha256sum | cut -c1-16).lock"

  (
    flock 9
    if ultrahonk_inputs_present "$abs_inputs" "$cache_hash"; then
      return
    fi

    restore_cached_ultrahonk_inputs "$abs_inputs" "$cache_name" || true

    if ! ultrahonk_inputs_present "$abs_inputs"; then
      echo "Generating UltraHonk benchmark inputs at $abs_inputs"
      generate_ultrahonk_inputs "$abs_inputs"
      if [[ "$abs_inputs" == "$root/labs/yarn-project/end-to-end/ultrahonk-bench-inputs" ]]; then
        (cd "$root/labs/yarn-project/end-to-end" && env -u root -u ci3 cache_upload "$cache_name" ultrahonk-bench-inputs)
      fi
    fi

    printf '%s\n' "$cache_hash" > "$abs_inputs/.ultrahonk-bench-inputs.hash"
  ) 9>"$lock_file"

  inputs_folder="$abs_inputs"
}

ensure_ultrahonk_inputs "$inputs_folder"

# Verify inputs exist
bytecode_path="$inputs_folder/${circuit_name}.json"
witness_path="$inputs_folder/witness.gz"

if [[ ! -f "$bytecode_path" ]]; then
  echo "Error: Bytecode not found at $bytecode_path"
  exit 1
fi

if [[ ! -f "$witness_path" ]]; then
  echo "Error: Witness not found at $witness_path"
  exit 1
fi

# Set up output directory
name_path="ultrahonk-bench/$circuit_name/cpus-$cpus"
output="bench-out/$name_path"
rm -rf "$output"
mkdir -p "$output"

export MEMUSAGE_OUT="$output/peak-memory-mb.txt"

# Run bb prove with hierarchical benchmark output
# Use --write_vk to compute and write the correct VK for this proving run
echo "Running bb prove --scheme ultra_honk --verifier_target noir-rollup with HARDWARE_CONCURRENCY=$cpus..."
start=$(date +%s%N)

memusage "./$native_build_dir/bin/bb" prove \
  --scheme ultra_honk \
  --verifier_target noir-rollup \
  -b "$bytecode_path" \
  -w "$witness_path" \
  -o "$output" \
  --write_vk \
  --bench_out_hierarchical "$output/benchmark_breakdown.json" \
  -v || {
    echo "bb prove failed"
    exit 1
  }

end=$(date +%s%N)
elapsed_ns=$(( end - start ))
elapsed_ms=$(( elapsed_ns / 1000000 ))
memory_taken_mb=$(cat "$MEMUSAGE_OUT")

echo "$circuit_name (cpus=$cpus) proved in $((elapsed_ms / 1000))s with peak memory ${memory_taken_mb}MB"

# Verify the proof (use the VK from the output directory since we computed it with --write_vk)
echo "Verifying proof with HARDWARE_CONCURRENCY=$cpus..."
verify_start=$(date +%s%N)

"./$native_build_dir/bin/bb" verify \
  --scheme ultra_honk \
  --verifier_target noir-rollup \
  -p "$output/proof" \
  -i "$output/public_inputs" \
  -k "$output/vk" || {
    echo "Proof verification failed"
    exit 1
  }

verify_end=$(date +%s%N)
verify_elapsed_ns=$(( verify_end - verify_start ))
verify_elapsed_ms=$(( verify_elapsed_ns / 1000000 ))
echo "Proof verified successfully in ${verify_elapsed_ms}ms"

# Get proof size
proof_size_bytes=$(stat -c%s "$output/proof" 2>/dev/null || stat -f%z "$output/proof")
proof_size_kb=$(( proof_size_bytes / 1024 ))

# Generate benchmark JSON output
cat > "$output/benchmarks.bench.json" <<EOF
[
  {
    "name": "$name_path/total_ms",
    "unit": "ms",
    "value": ${elapsed_ms}
  },
  {
    "name": "$name_path/verify_ms",
    "unit": "ms",
    "value": ${verify_elapsed_ms}
  },
  {
    "name": "$name_path/memory_mb",
    "unit": "MB",
    "value": ${memory_taken_mb}
  },
  {
    "name": "$name_path/proof_size_kb",
    "unit": "KB",
    "value": ${proof_size_kb}
  }
]
EOF

# Extract component timings from hierarchical breakdown if available
if [[ -f "$output/benchmark_breakdown.json" ]]; then
  echo "Extracting component timings from hierarchical breakdown..."
  python3 scripts/extract_component_benchmarks.py "$output" "$name_path"
fi

echo "Benchmark complete. Results in $output/"
echo "  - benchmarks.bench.json (benchmark results)"
echo "  - benchmark_breakdown.json (hierarchical timing breakdown)"
echo "  - proof (the generated proof)"

# Upload benchmark breakdown to disk if running in CI
if [[ "${CI:-}" == "1" ]] && [[ "${CI_USE_BUILD_INSTANCE_KEY:-0}" == "1" ]]; then
  echo_header "Uploading UltraHonk benchmark breakdown for $circuit_name (cpus=$cpus)"

  if [[ -f "$output/benchmark_breakdown.json" ]]; then
    set +e
    current_sha=$(git rev-parse HEAD)

    # Copy to /tmp with unique name
    tmp_breakdown_file="/tmp/benchmark_breakdown_ultrahonk_${circuit_name}_cpus${cpus}_$$.json"
    cp "$output/benchmark_breakdown.json" "$tmp_breakdown_file"

    # Upload to S3
    disk_key="ultrahonk-${circuit_name}-cpus${cpus}-${current_sha}"
    {
      cat "$tmp_breakdown_file" | gzip | cache_s3_transfer_to "bench/ultrahonk-breakdown" "$disk_key"
      rm -f "$tmp_breakdown_file"
    } &

    echo "Uploaded benchmark breakdown to S3: bench/ultrahonk-breakdown/$disk_key"
  fi
fi
