#!/bin/bash
# Run bb-avm avm_check_circuit on all proof inputs and collect coverage data
# Coverage data will be stored in bb-prover-coverage/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/../build-coverage"
BB_AVM="$BUILD_DIR/bin/bb-avm"
INPUTS_DIR="$SCRIPT_DIR/../../../yarn-project/bb-prover/proof_inputs"
COVERAGE_DIR="$SCRIPT_DIR/../src/barretenberg/avm_fuzzer/coverage"

# Create coverage output directory
mkdir -p "$COVERAGE_DIR"

# Get list of all input files
INPUT_FILES=($(ls "$INPUTS_DIR"/*.bin 2>/dev/null))

if [ ${#INPUT_FILES[@]} -eq 0 ]; then
    echo "No input files found in $INPUTS_DIR"
    exit 1
fi

echo "Found ${#INPUT_FILES[@]} input files"
echo "Coverage data will be stored in: $COVERAGE_DIR"
echo ""

# Run bb-avm on each input file
for i in "${!INPUT_FILES[@]}"; do
    INPUT_FILE="${INPUT_FILES[$i]}"
    BASENAME=$(basename "$INPUT_FILE" .bin)
    PROFRAW_FILE="$COVERAGE_DIR/${BASENAME}.profraw"

    echo "[$((i+1))/${#INPUT_FILES[@]}] Processing: $BASENAME"

    # Set LLVM_PROFILE_FILE to output coverage to specific file
    LLVM_PROFILE_FILE="$PROFRAW_FILE" "$BB_AVM" avm_check_circuit --avm-inputs "$INPUT_FILE" 2>&1 || {
        echo "  Warning: bb-avm returned non-zero exit code for $BASENAME"
    }

    if [ -f "$PROFRAW_FILE" ]; then
        echo "  Coverage saved to: $PROFRAW_FILE"
    else
        echo "  Warning: No coverage file generated for $BASENAME"
    fi
done

echo ""
echo "Coverage collection complete!"
echo "Raw coverage files are in: $COVERAGE_DIR"
echo ""
echo "To merge coverage data, run:"
echo "  llvm-profdata merge -sparse $COVERAGE_DIR/*.profraw -o $COVERAGE_DIR/merged.profdata"
echo ""
echo "To generate HTML report, run:"
echo "  llvm-cov show $BB_AVM -instr-profile=$COVERAGE_DIR/merged.profdata -format=html -output-dir=$COVERAGE_DIR/html"
echo ""
echo "To generate summary, run:"
echo "  llvm-cov report $BB_AVM -instr-profile=$COVERAGE_DIR/merged.profdata"
