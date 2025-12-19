#!/bin/bash

# Script to run AVM fuzzers with default parameters
# Usage: ./run_fuzzer.sh <command> <fuzzer_type> [options]

set -e

show_usage() {
    echo "Usage: $0 <command> <fuzzer_type> [options] [-- fuzzer_args...]"
    echo "Commands:"
    echo "  build <fuzzer_type>                        - Build the fuzzer binary"
    echo "  fuzz <fuzzer_type> [--log] [-- args...]     - Run the fuzzer (--log to tail fuzz-0.log)"
    echo "  coverage <fuzzer_type> [type]              - Generate coverage report (type: html or report, default: html)"
    echo "  list-targets                               - List all available fuzzing targets"
    echo ""
    echo "Additional fuzzer arguments can be passed after '--'. For example:"
    echo "  $0 fuzz tx -- -max_len=4096 -runs=1000"
}

# Check if command is provided
if [ $# -lt 1 ]; then
    show_usage
    exit 1
fi

COMMAND=$1
shift

# Handle list-targets command
if [ "$COMMAND" = "list-targets" ]; then
    echo "Available fuzzing options (<target_name>):"
    echo "  avm - AVM fuzzer (avm_fuzzer_avm_fuzzer)"
    echo "  tx - Transaction fuzzer (avm_fuzzer_tx_fuzzer)"
    echo "  alu - ALU fuzzer (harness_alu_fuzzer)"
    echo "  bitwise - Bitwise fuzzer (harness_bitwise_fuzzer)"
    echo "  ecc - ECC fuzzer (harness_ecc_fuzzer)"
    echo "  gt - Greater Than fuzzer (harness_gt_fuzzer)"
    echo "  merkle_check - Merkle Check fuzzer (harness_merkle_check_fuzzer)"
    echo "  calldata - Calldata fuzzer (harness_calldata_fuzzer)"
    echo "  emit_unencrypted_log - Emit Unencrypted Log fuzzer (harness_emit_unencrypted_log_fuzzer)"
    exit 0
fi

FUZZER_ALIAS=$1
shift

# Parse --log flag for fuzz command
FOLLOW_LOG=false
if [ "$COMMAND" = "fuzz" ] && [ $# -ge 1 ] && [ "$1" = "--log" ]; then
    FOLLOW_LOG=true
    shift
fi

# Parse coverage format option if coverage command
COVERAGE_FORMAT="html"  # default
if [ "$COMMAND" = "coverage" ] && [ $# -ge 1 ]; then
    COVERAGE_FORMAT=$1
    shift
    if [ "$COVERAGE_FORMAT" != "html" ] && [ "$COVERAGE_FORMAT" != "report" ]; then
        echo "Error: Invalid coverage format '$COVERAGE_FORMAT'"
        echo "Valid options: 'html' or 'report'"
        exit 1
    fi
fi

# Parse additional arguments after '--'
EXTRA_ARGS=()
if [ $# -ge 1 ] && [ "$1" = "--" ]; then
    shift
    EXTRA_ARGS=("$@")
fi

# Validate and map fuzzer type
case "$FUZZER_ALIAS" in
    avm) FUZZER_TYPE="avm_fuzzer_avm_fuzzer" ;;
    tx) FUZZER_TYPE="avm_fuzzer_tx_fuzzer" ;;
    alu) FUZZER_TYPE="harness_alu_fuzzer" ;;
    bitwise) FUZZER_TYPE="harness_bitwise_fuzzer" ;;
    ecc) FUZZER_TYPE="harness_ecc_fuzzer" ;;
    gt) FUZZER_TYPE="harness_gt_fuzzer" ;;
    merkle_check) FUZZER_TYPE="harness_merkle_check_fuzzer" ;;
    calldata) FUZZER_TYPE="harness_calldata_fuzzer" ;;
    emit_unencrypted_log) FUZZER_TYPE="harness_emit_unencrypted_log_fuzzer" ;;
    *)
        echo "Error: Invalid fuzzer type '$FUZZER_ALIAS'"
        echo "Valid options: 'avm', 'tx', 'alu', 'bitwise', 'ecc', 'gt', 'merkle_check', 'calldata', or 'emit_unencrypted_log'"
        exit 1
        ;;
esac

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BARRETENBERG_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
PROJECT_ROOT="$(cd "$BARRETENBERG_ROOT/.." && pwd)"
CPP_DIR="$BARRETENBERG_ROOT/cpp"

# Set AVM_SIMULATOR_BIN environment variable (relative to PROJECT_ROOT)
export AVM_SIMULATOR_BIN="${AVM_SIMULATOR_BIN:-$PROJECT_ROOT/yarn-project/simulator/dest/public/fuzzing/avm_simulator_bin.js}"

# Check if AVM_SIMULATOR_BIN exists (only for avm and tx fuzzers)
if [ "$COMMAND" = "fuzz" ] && { [ "$FUZZER_ALIAS" = "avm" ] || [ "$FUZZER_ALIAS" = "tx" ]; } && [ ! -f "$AVM_SIMULATOR_BIN" ]; then
    echo "Error: AVM simulator binary not found at: $AVM_SIMULATOR_BIN"
    echo ""
    echo "To build the AVM simulator fuzzer binary:"
    echo "  cd $PROJECT_ROOT/yarn-project/simulator"
    echo "  yarn build:fuzzer"
    echo ""
    exit 1
fi

# Set build directory based on command
if [ "$COMMAND" = "coverage" ]; then
    BUILD_DIR="$CPP_DIR/build-coverage"
    BUILD_PRESET="clang20-coverage"
    BUILD_CMAKE_FLAGS="-DFUZZING=ON -DFUZZING_AVM=ON"
else
    BUILD_DIR="$CPP_DIR/build-fuzzing-avm"
    BUILD_PRESET="fuzzing-avm"
    BUILD_CMAKE_FLAGS=""
fi

# Build function
build_fuzzer() {
    echo "Building fuzzer: $FUZZER_TYPE"
    echo "Build directory: $BUILD_DIR"
    echo "Preset: $BUILD_PRESET"
    if [ -n "$BUILD_CMAKE_FLAGS" ]; then
        echo "Extra CMake flags: $BUILD_CMAKE_FLAGS"
    fi
    echo ""

    cd "$CPP_DIR"

    # Configure if build dir doesn't exist or CMakeCache is missing
    if [ ! -f "$BUILD_DIR/CMakeCache.txt" ]; then
        echo "Configuring cmake..."
        if [ -n "$BUILD_CMAKE_FLAGS" ]; then
            cmake --preset "$BUILD_PRESET" $BUILD_CMAKE_FLAGS
        else
            cmake --preset "$BUILD_PRESET"
        fi
    fi

    # Build the target
    echo "Building target: $FUZZER_TYPE"
    cmake --build "$BUILD_DIR" --target "$FUZZER_TYPE"

    echo ""
    echo "Build complete: $FUZZER_BIN"
}

# Check if fuzzer build/binary exists
FUZZER_BIN="$BUILD_DIR/bin/$FUZZER_TYPE"

# Handle build command
if [ "$COMMAND" = "build" ]; then
    build_fuzzer
    exit 0
fi

# Auto-build if binary doesn't exist
if [ ! -f "$FUZZER_BIN" ]; then
    echo "Fuzzer binary not found: $FUZZER_BIN"
    echo "Auto-building..."
    echo ""
    build_fuzzer
fi

# Set corpus directory based on fuzzer type
CORPUS_DIR="$SCRIPT_DIR/corpus/$FUZZER_ALIAS"
# Sync corpus is used for parallel fuzzing - allows multiple workers to share discovered inputs
SYNC_CORPUS_DIR="$SCRIPT_DIR/sync_corpus/$FUZZER_ALIAS"
CRASHES_DIR="$CORPUS_DIR/crashes"

# Create corpus, sync_corpus, and crashes directories
mkdir -p "$CRASHES_DIR"
mkdir -p "$SYNC_CORPUS_DIR"

# Change to build directory
cd "$BUILD_DIR"

# Default fuzzer parameters
TIMEOUT=5
WORKERS=1 # EVERYTHING TUNED TO 1 BY DEFAULT UNTIL DIFFERENTIAL FUZZER WORKS IN PARALLEL
JOBS=1 # EVERYTHING TUNED TO 1 BY DEFAULT UNTIL DIFFERENTIAL FUZZER WORKS IN PARALLEL
ENTROPIC=1
SHRINK=1
ARTIFACT_PREFIX="$CRASHES_DIR/"

echo "=========================================="
echo "Running $FUZZER_TYPE"
echo "=========================================="
echo "Build directory: $BUILD_DIR"
echo "Corpus directory: $CORPUS_DIR"
echo "Sync corpus directory: $SYNC_CORPUS_DIR"
echo "Crashes directory: $CRASHES_DIR"
if [ "$COMMAND" = "fuzz" ]; then
    echo "Parameters:"
    echo "  -timeout=$TIMEOUT"
    echo "  -workers=$WORKERS"
    echo "  -jobs=$JOBS"
    echo "  -entropic=$ENTROPIC"
    echo "  -shrink=$SHRINK"
    echo "  -artifact_prefix=$ARTIFACT_PREFIX"
    if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
        echo "Extra arguments: ${EXTRA_ARGS[*]}"
    fi
fi
echo "=========================================="
echo ""

# Set coverage environment variable if coverage command
if [ "$COMMAND" = "coverage" ]; then
    export LLVM_PROFILE_FILE="${LLVM_PROFILE_FILE:-coverage.profraw}"
    echo "Coverage profiling enabled: LLVM_PROFILE_FILE=$LLVM_PROFILE_FILE"
    echo ""
fi

# Build fuzzer command arguments
FUZZER_CMD=(./bin/$FUZZER_TYPE)

if [ "$COMMAND" = "coverage" ]; then
    # When running with coverage, run all corpus entries once (runs=0 means corpus only)
    FUZZER_CMD+=("$CORPUS_DIR" "$SYNC_CORPUS_DIR" -runs=0)
else
    # Normal fuzzing with full parameters
    FUZZER_CMD+=(
        -timeout=$TIMEOUT
        -workers=$WORKERS
        -jobs=$JOBS
        -entropic=$ENTROPIC
        -shrink=$SHRINK
        -artifact_prefix=$ARTIFACT_PREFIX
        "$CORPUS_DIR"
        "$SYNC_CORPUS_DIR"
    )
fi

# Add any extra arguments passed after '--'
if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
    FUZZER_CMD+=("${EXTRA_ARGS[@]}")
fi

# Run the fuzzer
if [ "$COMMAND" = "fuzz" ] && [ "$FOLLOW_LOG" = true ]; then
    # Run fuzzer in background and tail the log
    "${FUZZER_CMD[@]}" &
    FUZZER_PID=$!
    echo "Fuzzer started with PID: $FUZZER_PID"
    echo "Following fuzz-0.log (Ctrl+C to stop tailing, fuzzer will continue running)"
    echo ""
    sleep 1
    tail -f fuzz-0.log
else
    "${FUZZER_CMD[@]}"
fi

# Process coverage data if coverage command was used
if [ "$COMMAND" = "coverage" ] && [ -f "$LLVM_PROFILE_FILE" ]; then
    echo ""
    echo "=========================================="
    echo "Processing coverage data..."
    echo "=========================================="

    COVERAGE_DATA="coverage.profdata"
    llvm-profdata-20 merge -sparse "$LLVM_PROFILE_FILE" -o "$COVERAGE_DATA"

    if [ $? -ne 0 ]; then
        echo "Error: Failed to merge coverage data"
        exit 1
    fi

    echo "Coverage data merged successfully: $COVERAGE_DATA"
    echo ""
    echo "Generating coverage report (format: $COVERAGE_FORMAT)..."
    echo "Filtering for: src/barretenberg/vm2"
    echo ""

    # Set path filter for vm2 directory
    VM2_PATH_FILTER="$CPP_DIR/src/barretenberg/vm2"

    if [ "$COVERAGE_FORMAT" = "html" ]; then
        REPORT_DIR="out/report"
        mkdir -p "$REPORT_DIR"
        llvm-cov-20 show -output-dir="$REPORT_DIR" -format=html ./bin/$FUZZER_TYPE -instr-profile="$COVERAGE_DATA" "$VM2_PATH_FILTER"

        if [ $? -eq 0 ]; then
            REPORT_DIR_ABS="$(cd "$REPORT_DIR" && pwd)"
            echo "HTML coverage report generated: $REPORT_DIR_ABS"
            echo ""
            echo "To view the report, start a local HTTP server:"
            echo "  python3 -m http.server --directory $REPORT_DIR_ABS"
            echo ""
            echo "If running on a remote machine, use SSH port forwarding:"
            echo "  Example: ssh -L 8000:localhost:8000 user@remote-host"
            echo ""
            echo "Then open http://localhost:8000 in your browser"
        else
            echo "Error: Failed to generate HTML coverage report"
            exit 1
        fi
    else
        # report format
        llvm-cov-20 report ./bin/$FUZZER_TYPE -instr-profile="$COVERAGE_DATA" "$VM2_PATH_FILTER"

        if [ $? -ne 0 ]; then
            echo "Error: Failed to generate coverage report"
            exit 1
        fi
    fi
fi
