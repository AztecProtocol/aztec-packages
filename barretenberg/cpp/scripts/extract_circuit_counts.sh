#!/usr/bin/env bash
set -euo pipefail

# Extract circuit counts and gate counts from IVC flow benchmark.json files
# This script parses benchmark metadata to show circuit composition of each flow.
#
# Usage:
#   ./extract_circuit_counts.sh [IVC_INPUTS_DIR] [OUTPUT_FILE]
#
# Arguments:
#   IVC_INPUTS_DIR  - Directory containing IVC input flows (default: yarn-project/end-to-end/example-app-ivc-inputs-out)
#   OUTPUT_FILE     - Output CSV file (default: barretenberg/cpp/scripts/circuit_counts.csv)
#
# Requirements:
#   - jq must be installed
#   - IVC input flows with benchmark.json files must be generated first

# Determine script and repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Default paths (relative to repo root)
DEFAULT_IVC_DIR="$REPO_ROOT/yarn-project/end-to-end/example-app-ivc-inputs-out"
DEFAULT_OUTPUT="$SCRIPT_DIR/circuit_counts.csv"

# Parse arguments
IVC_DIR="${1:-$DEFAULT_IVC_DIR}"
OUTPUT="${2:-$DEFAULT_OUTPUT}"

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed." >&2
    echo "Install jq: sudo apt-get install jq" >&2
    exit 1
fi

# Check if IVC directory exists
if [ ! -d "$IVC_DIR" ]; then
    echo "Error: IVC inputs directory not found: $IVC_DIR" >&2
    echo "Please generate IVC inputs first or specify a different directory." >&2
    exit 1
fi

echo "Extracting circuit counts from IVC flows..."
echo "IVC directory: $IVC_DIR"
echo "Output file: $OUTPUT"
echo ""

# Create output file with header
echo "Flow,Num Circuits,Total Gates,Circuit List" > "$OUTPUT"

flow_count=0
for flow_dir in "$IVC_DIR"/*; do
    if [ -d "$flow_dir" ] && [ -f "$flow_dir/benchmark.json" ]; then
        flow_name=$(basename "$flow_dir")

        # Extract data from benchmark.json
        num_circuits=$(jq '.steps | length' "$flow_dir/benchmark.json" 2>/dev/null || echo "N/A")
        total_gates=$(jq '.totalGateCount' "$flow_dir/benchmark.json" 2>/dev/null || echo "N/A")
        circuit_names=$(jq -r '.steps[].functionName' "$flow_dir/benchmark.json" 2>/dev/null | tr '\n' '; ' || echo "N/A")

        # Remove trailing semicolon
        circuit_names="${circuit_names%;}"

        echo "$flow_name,$num_circuits,$total_gates,$circuit_names" >> "$OUTPUT"
        echo "  $flow_name: $num_circuits circuits, $total_gates gates"

        flow_count=$((flow_count + 1))
    fi
done

echo ""
if [ $flow_count -eq 0 ]; then
    echo "Warning: No flows with benchmark.json found in $IVC_DIR" >&2
    exit 1
fi

echo "Successfully processed $flow_count flows"
echo "Results saved to $OUTPUT"
echo ""
cat "$OUTPUT"
