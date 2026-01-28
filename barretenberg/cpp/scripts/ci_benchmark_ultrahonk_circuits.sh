#!/usr/bin/env bash
# Benchmarks UltraHonk proving for protocol circuits (e.g., base parity).
# This script runs bb prove with different HARDWARE_CONCURRENCY values and captures hierarchical timing breakdowns.
#
# Usage: ci_benchmark_ultrahonk_circuits.sh <circuit_name> <inputs_folder> <cpus>
# Example: ci_benchmark_ultrahonk_circuits.sh parity_base ../../yarn-project/end-to-end/ultrahonk-bench-inputs 8
#
# The inputs_folder should contain:
#   - <circuit_name>.json (the circuit artifact with bytecode)
#   - witness.gz (the compressed witness)

source $(git rev-parse --show-toplevel)/ci3/source
source $(git rev-parse --show-toplevel)/ci3/source_redis
source $(git rev-parse --show-toplevel)/ci3/source_cache

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <circuit_name> <inputs_folder> <cpus>"
  echo "Example: $0 parity_base ./bench-inputs/base-parity 8"
  exit 1
fi

cd ..

circuit_name="$1"
inputs_folder="$2"
cpus="$3"

echo_header "UltraHonk benchmark: $circuit_name (CPUS=$cpus)"

export HARDWARE_CONCURRENCY="$cpus"
export native_build_dir=$(scripts/native-preset-build-dir)

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
echo "Verifying proof..."
"./$native_build_dir/bin/bb" verify \
  --scheme ultra_honk \
  --verifier_target noir-rollup \
  -p "$output/proof" \
  -i "$output/public_inputs" \
  -k "$output/vk" || {
    echo "Proof verification failed"
    exit 1
  }
echo "Proof verified successfully"

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

  # Use Python to extract key component timings
  # The breakdown JSON format is: { "operation_name": [{"parent": "...", "time": nanoseconds, ...}], ... }
  python3 << PYTHON_SCRIPT
import json
import sys

try:
    with open("$output/benchmark_breakdown.json", "r") as f:
        data = json.load(f)

    benchmarks = []

    # Key components to track (case-insensitive matching)
    key_components = ["sumcheck", "pcs", "pippenger", "commitment", "circuit", "oink", "compute"]

    for op_name, entries in data.items():
        # Check if this is a key component we want to track
        if any(comp.lower() in op_name.lower() for comp in key_components):
            # Sum up all timings for this operation (there may be multiple entries with different parents)
            total_time_ns = sum(entry.get("time", 0) for entry in entries)
            time_ms = total_time_ns / 1_000_000

            # Create a safe benchmark name (replace special chars)
            safe_name = op_name.replace("::", "_").replace(" ", "_")

            benchmarks.append({
                "name": f"$name_path/{safe_name}_ms",
                "unit": "ms",
                "value": round(time_ms, 2),
                "extra": f"stacked:$name_path/components"
            })

    # Append to existing benchmarks file
    with open("$output/benchmarks.bench.json", "r") as f:
        existing = json.load(f)

    existing.extend(benchmarks)

    with open("$output/benchmarks.bench.json", "w") as f:
        json.dump(existing, f, indent=2)

    print(f"Extracted {len(benchmarks)} component timings")
except Exception as e:
    print(f"Warning: Could not extract component timings: {e}", file=sys.stderr)
PYTHON_SCRIPT
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

    # Upload to disk
    disk_key="ultrahonk-${circuit_name}-cpus${cpus}-${current_sha}"
    {
      cat "$tmp_breakdown_file" | gzip | cache_disk_transfer_to "bench/ultrahonk-breakdown" "$disk_key"
      rm -f "$tmp_breakdown_file"
    } &

    echo "Uploaded benchmark breakdown to disk: bench/ultrahonk-breakdown/$disk_key"
  fi
fi
