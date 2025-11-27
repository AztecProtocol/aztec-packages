#!/bin/bash
# Merge all raw coverage data into a single unified report
# Run this after run_coverage.sh completes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/../build"
BB_AVM="$BUILD_DIR/bin/bb-avm"
COVERAGE_DIR="$SCRIPT_DIR/../src/barretenberg/avm_fuzzer/coverage"
TRACK_COV_DIR="$SCRIPT_DIR/../src/barretenberg/vm2"
IGNORE_REGEX="(simulation/standalone|generated/|optimized/)"

# Check for llvm-profdata and llvm-cov (try versioned first)
LLVM_PROFDATA=""
LLVM_COV=""

for version in 20 19 18 17 16 15 14 ""; do
    if [ -n "$version" ]; then
        suffix="-$version"
    else
        suffix=""
    fi

    if command -v "llvm-profdata$suffix" &> /dev/null; then
        LLVM_PROFDATA="llvm-profdata$suffix"
    fi
    if command -v "llvm-cov$suffix" &> /dev/null; then
        LLVM_COV="llvm-cov$suffix"
    fi

    if [ -n "$LLVM_PROFDATA" ] && [ -n "$LLVM_COV" ]; then
        break
    fi
done

if [ -z "$LLVM_PROFDATA" ] || [ -z "$LLVM_COV" ]; then
    echo "Error: Could not find llvm-profdata or llvm-cov"
    exit 1
fi

# Count profraw files
PROFRAW_COUNT=$(ls "$COVERAGE_DIR"/*.profraw 2>/dev/null | wc -l)

if [ "$PROFRAW_COUNT" -eq 0 ]; then
    echo "Error: No .profraw files found in $COVERAGE_DIR"
    exit 1
fi

echo "Merging $PROFRAW_COUNT .profraw files..."

# Step 1: Merge all profraw files into a single profdata file
$LLVM_PROFDATA merge -sparse "$COVERAGE_DIR"/*.profraw -o "$COVERAGE_DIR/merged.profdata"

# Step 2: Generate summary report (filtered to vm2 directory)
$LLVM_COV report "$BB_AVM" \
    -instr-profile="$COVERAGE_DIR/merged.profdata" \
    -ignore-filename-regex="$IGNORE_REGEX" \
    "$TRACK_COV_DIR" > "$COVERAGE_DIR/coverage_summary.txt"

# Step 3: Generate HTML report (filtered to vm2 directory)
$LLVM_COV show "$BB_AVM" \
    -instr-profile="$COVERAGE_DIR/merged.profdata" \
    -format=html \
    -output-dir="$COVERAGE_DIR/html" \
    -show-line-counts-or-regions \
    -show-expansions \
    -show-branches=count \
    -ignore-filename-regex="$IGNORE_REGEX" \
    "$TRACK_COV_DIR"

# Step 4: Generate LCOV format (filtered to vm2 directory)
$LLVM_COV export "$BB_AVM" \
    -instr-profile="$COVERAGE_DIR/merged.profdata" \
    -format=lcov \
    -ignore-filename-regex="$IGNORE_REGEX" \
    "$TRACK_COV_DIR" > "$COVERAGE_DIR/coverage.lcov"

echo "Done. Output in $COVERAGE_DIR/"
