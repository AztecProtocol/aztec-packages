#!/usr/bin/env bash
set -euo pipefail

# Extract VM metrics (hiding dyadic size, ECCVM rows, Translator rows) from IVC flows
# This script runs bb prove on IVC input flows and extracts VM-related metrics.
#
# Usage:
#   ./extract_vm_metrics.sh [IVC_INPUTS_DIR] [OUTPUT_FILE]
#
# Arguments:
#   IVC_INPUTS_DIR  - Directory containing IVC input flows (default: yarn-project/end-to-end/example-app-ivc-inputs-out)
#   OUTPUT_FILE     - Output CSV file (default: barretenberg/cpp/scripts/vm_metrics.csv)
#
# Requirements:
#   - bb binary must be built (in build/bin/bb or build-no-avm/bin/bb)
#   - IVC input flows must be generated first

# Determine script and repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Default paths (relative to repo root)
DEFAULT_IVC_DIR="$REPO_ROOT/yarn-project/end-to-end/example-app-ivc-inputs-out"
DEFAULT_OUTPUT="$SCRIPT_DIR/vm_metrics.csv"

# Parse arguments
IVC_DIR="${1:-$DEFAULT_IVC_DIR}"
OUTPUT="${2:-$DEFAULT_OUTPUT}"

# Find bb binary
if [ -f "$REPO_ROOT/barretenberg/cpp/build/bin/bb" ]; then
    BB_BIN="$REPO_ROOT/barretenberg/cpp/build/bin/bb"
elif [ -f "$REPO_ROOT/barretenberg/cpp/build-no-avm/bin/bb" ]; then
    BB_BIN="$REPO_ROOT/barretenberg/cpp/build-no-avm/bin/bb"
else
    echo "Error: bb binary not found. Please build barretenberg first." >&2
    echo "Run: cd barretenberg/cpp && ./bootstrap.sh" >&2
    exit 1
fi

# Check if IVC directory exists
if [ ! -d "$IVC_DIR" ]; then
    echo "Error: IVC inputs directory not found: $IVC_DIR" >&2
    echo "Please generate IVC inputs first or specify a different directory." >&2
    exit 1
fi

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Warning: jq not found. Install jq for better error handling." >&2
fi

echo "Extracting VM metrics from IVC flows..."
echo "IVC directory: $IVC_DIR"
echo "Output file: $OUTPUT"
echo "BB binary: $BB_BIN"
echo ""

# Create output file with header
echo "Flow,Hiding Dyadic Size,ECCVM Num Rows,Translator Num Rows" > "$OUTPUT"

flow_count=0
for flow_dir in "$IVC_DIR"/*; do
    if [ -d "$flow_dir" ] && [ -f "$flow_dir/ivc-inputs.msgpack" ]; then
        flow_name=$(basename "$flow_dir")
        echo "Processing $flow_name..."

        log_file="/tmp/vm_metrics_${flow_name}.log"

        # Run bb prove and capture output
        if ! "$BB_BIN" prove --ivc_inputs_path "$flow_dir/ivc-inputs.msgpack" --scheme client_ivc -v 2>&1 | tee "$log_file" > /dev/null; then
            echo "  Warning: bb prove failed for $flow_name" >&2
            continue
        fi

        # Extract metrics from log
        # Matches: "hiding dyadic size 65536"
        hiding_size=$(grep "hiding dyadic size" "$log_file" | awk '{print $4}' || echo "N/A")
        # Matches: "ECCVM: num rows = 17891"
        eccvm_rows=$(grep "ECCVM: num rows = " "$log_file" | awk '{print $5}' || echo "N/A")
        # Matches: "Translator: num rows =  = 8191"
        ultra_ops=$(grep "Translator: num ops = " "$log_file" | awk '{print $6}' || echo "N/A")

        echo "$flow_name,$hiding_size,$eccvm_rows,$ultra_ops" >> "$OUTPUT"
        echo "  -> hiding: $hiding_size, eccvm: $eccvm_rows, translator: $ultra_ops"

        flow_count=$((flow_count + 1))
    fi
done

echo ""
if [ $flow_count -eq 0 ]; then
    echo "Warning: No IVC flows found in $IVC_DIR" >&2
    exit 1
fi

echo "Successfully processed $flow_count flows"
echo "Results saved to $OUTPUT"
echo ""
cat "$OUTPUT"
