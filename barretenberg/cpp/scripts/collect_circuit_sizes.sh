#!/usr/bin/env bash
# Script to collect circuit sizes from all example IVC flows
# This runs the benchmark script on each example and extracts circuit size information

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Directory containing all example inputs
EXAMPLES_DIR="../../yarn-project/end-to-end/example-app-ivc-inputs-out"

# Output file for results
OUTPUT_FILE="circuit_sizes_results.txt"
rm -f "$OUTPUT_FILE"

echo "Collecting circuit sizes from all examples..."
echo "Results will be saved to: $OUTPUT_FILE"
echo ""
echo "======================================" | tee -a "$OUTPUT_FILE"
echo "Circuit Size Collection Results" | tee -a "$OUTPUT_FILE"
echo "Date: $(date)" | tee -a "$OUTPUT_FILE"
echo "======================================" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

# Find all example directories
for example_dir in "$EXAMPLES_DIR"/*/; do
    if [ -d "$example_dir" ]; then
        example_name=$(basename "$example_dir")

        # Check if ivc-inputs.msgpack exists
        if [ -f "$example_dir/ivc-inputs.msgpack" ]; then
            echo "Processing: $example_name" | tee -a "$OUTPUT_FILE"
            echo "---" | tee -a "$OUTPUT_FILE"

            # Run the benchmark and capture output
            # We use native runtime and redirect stderr to capture the info logs
            set +e
            ./scripts/ci_benchmark_ivc_flows.sh native "$example_dir" 2>&1 | \
                grep -E "(ChonkAccumulate - circuit|original gates|dyadic size)" | \
                tee -a "$OUTPUT_FILE"
            exit_code=$?
            set -e

            if [ $exit_code -ne 0 ]; then
                echo "Warning: benchmark exited with code $exit_code for $example_name" | tee -a "$OUTPUT_FILE"
            fi

            echo "" | tee -a "$OUTPUT_FILE"
        else
            echo "Skipping $example_name (no ivc-inputs.msgpack found)" | tee -a "$OUTPUT_FILE"
            echo "" | tee -a "$OUTPUT_FILE"
        fi
    fi
done

echo "======================================" | tee -a "$OUTPUT_FILE"
echo "Circuit size collection complete!" | tee -a "$OUTPUT_FILE"
echo "Results saved to: $OUTPUT_FILE" | tee -a "$OUTPUT_FILE"

# Create a summary
echo "" | tee -a "$OUTPUT_FILE"
echo "Summary of circuit sizes:" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

# Extract and format just the size information
grep -E "original gates:" "$OUTPUT_FILE" | \
    sed 's/.*circuit '\''//; s/'\''.*original gates: /: /; s/, dyadic size:/  →  dyadic:/' | \
    sort -t: -k2 -n | tee -a "$OUTPUT_FILE"
