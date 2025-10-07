#!/usr/bin/env bash

# Script to benchmark bb prove with different HARDWARE_CONCURRENCY values
# Usage: ./bench_hardware_concurrency.sh [concurrency_values...]
# Example: ./bench_hardware_concurrency.sh 1 2 4 8 16 32
#
# To run on a remote machine with ci.sh shell-new:
#   ./ci.sh shell-new "./ci3/cache_download bb-client-ivc-captures-ba1369853ed8670e.tar.gz ; \
#                      mv example-app-ivc-inputs-out yarn-project/end-to-end 2>/dev/null ; \
#                      DENOISE=1 DISABLE_AZTEC_VM=1 ./barretenberg/cpp/bootstrap.sh build_native ; \
#                      DENOISE=1 ./barretenberg/cpp/scripts/bench_hardware_concurrency.sh"
#
# To save the output to a file:
#   ./ci.sh shell-new "..." > cpu_scaling_report.md
#
# To run with specific CPU counts:
#   ./ci.sh shell-new "... ./barretenberg/cpp/scripts/bench_hardware_concurrency.sh 1 2 4 8"

REPO_ROOT=$(git rev-parse --show-toplevel)

# Use ci3 script base.
source $REPO_ROOT/ci3/source_bootstrap

# Use provided arguments or default values
if [ $# -eq 0 ]; then
    CONCURRENCY_VALUES=(1 2 4 8 16 32)
else
    CONCURRENCY_VALUES=("$@")
fi

# Set DENOISE to 0 by default if not already set
DENOISE=${DENOISE:-0}

# Test cases to run (0 and 1 recursions)
TEST_CASES=(
    "ecdsar1+transfer_0_recursions+private_fpc"
    "ecdsar1+transfer_1_recursions+private_fpc"
)

# Function to run benchmark for a specific test case
run_benchmark() {
    local test_case=$1
    local concurrency=$2

    local input_path="$REPO_ROOT/yarn-project/end-to-end/example-app-ivc-inputs-out/$test_case/ivc-inputs.msgpack"
    local bench_file="/tmp/bench_${test_case}_concurrency_${concurrency}.json"

    if [ ! -f "$input_path" ]; then
        echo "Warning: Input file not found: $input_path" >&2
        return 1
    fi

    # Run the command with specified concurrency
    local cmd="BB_BENCH=1 HARDWARE_CONCURRENCY=$concurrency $REPO_ROOT/barretenberg/cpp/build/bin/bb prove --scheme client_ivc --output_path /tmp --ivc_inputs_path $input_path --bench_out $bench_file"

    if [ "$DENOISE" = "1" ]; then
        DENOISE=1 denoise "$cmd" >&2
    else
        eval "$cmd" >&2
    fi

    echo "$bench_file"
}

# Run all benchmarks
echo "Running benchmarks for HARDWARE_CONCURRENCY values: ${CONCURRENCY_VALUES[@]}" >&2
echo "" >&2

for test_case in "${TEST_CASES[@]}"; do
    echo "Running benchmarks for $test_case..." >&2
    for concurrency in "${CONCURRENCY_VALUES[@]}"; do
        echo "  HARDWARE_CONCURRENCY=$concurrency" >&2
        bench_file=$(run_benchmark "$test_case" "$concurrency")
        if [ $? -ne 0 ]; then
            echo "  Failed to run benchmark" >&2
        fi
    done
    echo "" >&2
done

# Now generate the report to stdout
echo "# Barretenberg running time vs number of CPUs by component"
echo ""

# Python script to process JSON files and generate markdown report
python3 << 'EOF'
import json
import os
import re
from collections import defaultdict
from pathlib import Path

# Configuration
concurrency_values = [1, 2, 4, 8, 16, 32]
test_cases = [
    "ecdsar1+transfer_0_recursions+private_fpc",
    "ecdsar1+transfer_1_recursions+private_fpc"
]

# Function to load benchmark data
def load_benchmark_data(test_case, concurrency):
    filename = f"/tmp/bench_{test_case}_concurrency_{concurrency}.json"
    if not os.path.exists(filename):
        return None
    try:
        with open(filename, 'r') as f:
            return json.load(f)
    except:
        return None

# Function to calculate speedup and efficiency
def calc_metrics(baseline_time, current_time, num_cpus):
    if baseline_time == 0:
        return "N/A", "N/A"
    speedup = baseline_time / current_time
    efficiency = (speedup / num_cpus) * 100
    return f"{speedup:.1f}x", f"{efficiency:.0f}%"

# Function to format time
def format_time(ms):
    if ms >= 1000:
        return f"{ms/1000:.2f}s"
    else:
        return f"{ms:.2f}ms"

# Function to extract data (convert nanoseconds to milliseconds)
def extract_data(data):
    results = {}
    for key, value in data.items():
        # Value is in nanoseconds, convert to milliseconds
        results[key] = value / 1_000_000
    return results

# Function to generate table row
def generate_table_row(label, times_by_cpu, available_cpus, count=None):
    row = [f"**{label}**"]

    # Find the baseline CPU (1 if available, else minimum)
    cpus_with_data = sorted([cpu for cpu in available_cpus if cpu in times_by_cpu])
    if not cpus_with_data:
        return " | ".join(row + ["N/A"] * len(available_cpus))

    baseline_cpu = 1 if 1 in times_by_cpu else min(cpus_with_data)
    baseline = times_by_cpu.get(baseline_cpu, 0)

    for cpu in available_cpus:
        if cpu not in times_by_cpu:
            row.append("N/A")
            continue

        time_ms = times_by_cpu[cpu]
        time_str = format_time(time_ms)

        if cpu == baseline_cpu:
            if baseline_cpu == 1:
                row.append(f"{time_str}<br>(1.0x, 100%)")
            else:
                row.append(f"{time_str}<br>(baseline)")
        else:
            if baseline_cpu == 1:
                speedup, efficiency = calc_metrics(baseline, time_ms, cpu)
            else:
                # When baseline is not 1 CPU, show relative speedup
                speedup_factor = baseline / time_ms
                speedup = f"{speedup_factor:.1f}x"
                efficiency = f"{(speedup_factor / (cpu/baseline_cpu)) * 100:.0f}%"

            if count and count > 1:
                per_iter = format_time(time_ms / count)
                row.append(f"{time_str}<br>({speedup}, {efficiency})<br>{per_iter}×{count}")
            else:
                row.append(f"{time_str}<br>({speedup}, {efficiency})")

    return " | ".join(row)

# Process each test case
for test_case in test_cases:
    print(f"\n## {test_case}")
    print()

    # Load all data for this test case
    all_data = {}
    for cpu in concurrency_values:
        data = load_benchmark_data(test_case, cpu)
        if data:
            all_data[cpu] = extract_data(data)

    if not all_data:
        print(f"No data available for {test_case}")
        continue

    # Group metrics by component
    components = defaultdict(lambda: defaultdict(dict))

    for cpu, metrics in all_data.items():
        for metric_name, time_ms in metrics.items():
            # Categorize metrics based on name
            if "ClientIvc" in metric_name or "ClientIVC" in metric_name:
                components["Main"][metric_name][cpu] = time_ms
            elif "ProtogalaxyProver" in metric_name:
                components["ProtogalaxyProver"][metric_name][cpu] = time_ms
            elif "OinkProver" in metric_name:
                components["OinkProver"][metric_name][cpu] = time_ms
            elif "Decider" in metric_name:
                components["Decider"][metric_name][cpu] = time_ms
            elif "Goblin" in metric_name:
                components["Goblin"][metric_name][cpu] = time_ms
            elif "ECCVM" in metric_name:
                components["ECCVM"][metric_name][cpu] = time_ms
            elif "Translator" in metric_name:
                components["Translator"][metric_name][cpu] = time_ms
            elif "sumcheck" in metric_name.lower():
                components["Sumcheck"][metric_name][cpu] = time_ms
            elif "commit" in metric_name.lower() or "Commitment" in metric_name:
                components["Commitment"][metric_name][cpu] = time_ms
            elif any(x in metric_name for x in ["trace", "populate", "wire", "permutation", "lookup"]):
                components["Circuit Building"][metric_name][cpu] = time_ms
            else:
                components["Other"][metric_name][cpu] = time_ms

    # Determine which CPU values actually have data
    available_cpus = sorted(set(all_data.keys()))

    # Generate tables for each component
    sections = [
        ("Main Components", "Main"),
        ("ProtogalaxyProver Components", "ProtogalaxyProver"),
        ("OinkProver", "OinkProver"),
        ("Decider", "Decider"),
        ("Goblin", "Goblin"),
        ("ECCVM", "ECCVM"),
        ("Translator", "Translator"),
        ("Sumcheck", "Sumcheck"),
        ("Commitment Operations", "Commitment"),
        ("Circuit Building", "Circuit Building"),
    ]

    for section_title, component_key in sections:
        if component_key in components and components[component_key]:
            print(f"\n### {section_title}")
            print()

            # Table header - only show columns for CPUs we have data for
            header = ["Function"] + [f"{cpu} CPU{'s' if cpu > 1 else ''}" for cpu in available_cpus]
            print("| " + " | ".join(header) + " |")
            print("|" + "|".join(["-" * (len(h) + 2) for h in header]) + "|")

            # Sort metrics by baseline time (descending)
            sorted_metrics = sorted(
                components[component_key].items(),
                key=lambda x: x[1].get(1, 0),
                reverse=True
            )

            # Generate rows
            for metric_name, times in sorted_metrics[:20]:  # Limit to top 20
                # Try to detect if this is a repeated operation
                count_match = re.search(r'×(\d+)', metric_name)
                count = int(count_match.group(1)) if count_match else None

                # Clean up metric name
                clean_name = metric_name.replace('ProtogalaxyProver::', '').replace('OinkProver::', '')

                row = generate_table_row(clean_name, times, available_cpus, count)
                print("| " + row + " |")

    # Add summary statistics
    if "Main" in components and len(available_cpus) > 1:
        print(f"\n### Summary")
        print()
        min_cpu = min(available_cpus)
        max_cpu = max(available_cpus)
        print(f"| Metric | {min_cpu} CPU{'s' if min_cpu > 1 else ''} | {max_cpu} CPUs | Speedup | Efficiency |")
        print("|--------|-------|---------|---------|------------|")

        for metric_name, times in components["Main"].items():
            if min_cpu in times and max_cpu in times:
                baseline = times[min_cpu]
                final = times[max_cpu]
                speedup, efficiency = calc_metrics(baseline, final, max_cpu/min_cpu if min_cpu != 1 else max_cpu)
                print(f"| {metric_name} | {format_time(baseline)} | {format_time(final)} | {speedup} | {efficiency} |")

EOF

echo ""
echo "Report generation complete!"
