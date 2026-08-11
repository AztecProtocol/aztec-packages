#!/usr/bin/env bash

# Script to run AVM fuzzers with default parameters
# Usage: ./run_fuzzer.sh <command> <fuzzer_type> [options]

set -e

show_usage() {
    echo "Usage: $0 <command> <fuzzer_type> [options] [-- fuzzer_args...]"
    echo "Commands:"
    echo "  build <fuzzer_type>                        - Build the fuzzer binary"
    echo "  fuzz <fuzzer_type> [--log] [-- args...]     - Run the fuzzer (--log to tail fuzz-0.log)"
    echo "  coverage <fuzzer_type> [type]              - Generate coverage report (type: html or report, default: html)"
    echo "  analyze                                    - Analyze corpus and show opcode/call statistics"
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
    echo "  tx - Transaction fuzzer (avm_fuzzer_tx_fuzzer)"
    echo "  prover - Prover fuzzer (avm_fuzzer_prover_fuzzer)"
    echo "  alu - ALU fuzzer (harness_alu_fuzzer)"
    echo "  bitwise - Bitwise fuzzer (harness_bitwise_fuzzer)"
    echo "  ecc - ECC fuzzer (harness_ecc_fuzzer)"
    echo "  gt - Greater Than fuzzer (harness_gt_fuzzer)"
    echo "  merkle_check - Merkle Check fuzzer (harness_merkle_check_fuzzer)"
    echo "  calldata - Calldata fuzzer (harness_calldata_fuzzer)"
    echo "  emit_public_log - Emit Public Log fuzzer (harness_emit_public_log_fuzzer)"
    echo "  internal_call - Internal Call fuzzer (harness_internal_call_fuzzer)"
    echo "  external_call - External Call fuzzer (harness_external_call_fuzzer)"
    exit 0
fi

# Handle analyze command
if [ "$COMMAND" = "analyze" ]; then
    # Get the script directory and project root
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    BARRETENBERG_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
    CPP_DIR="$BARRETENBERG_ROOT/cpp"
    BUILD_DIR="$CPP_DIR/build-fuzzing-avm-tooling"
    BUILD_PRESET="fuzzing-avm-tooling"

    cd "$CPP_DIR"

    # Configure if needed
    if [ ! -f "$BUILD_DIR/CMakeCache.txt" ]; then
        echo "Configuring cmake..."
        cmake --preset "$BUILD_PRESET"
    fi

    # Build the analyzer
    echo "Building avm_tx_corpus_analyzer..."
    cmake --build "$BUILD_DIR" --target avm_tx_corpus_analyzer

    echo ""
    # Run analyzer on tx corpus
    "$BUILD_DIR/bin/avm_tx_corpus_analyzer" "$SCRIPT_DIR/corpus/tx"
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
    tx) FUZZER_TYPE="avm_fuzzer_tx_fuzzer" ;;
    prover) FUZZER_TYPE="avm_fuzzer_prover_fuzzer" ;;
    alu) FUZZER_TYPE="harness_alu_fuzzer" ;;
    bitwise) FUZZER_TYPE="harness_bitwise_fuzzer" ;;
    ecc) FUZZER_TYPE="harness_ecc_fuzzer" ;;
    gt) FUZZER_TYPE="harness_gt_fuzzer" ;;
    merkle_check) FUZZER_TYPE="harness_merkle_check_fuzzer" ;;
    calldata) FUZZER_TYPE="harness_calldata_fuzzer" ;;
    emit_public_log) FUZZER_TYPE="harness_emit_public_log_fuzzer" ;;
    internal_call) FUZZER_TYPE="harness_internal_call_fuzzer" ;;
    external_call) FUZZER_TYPE="harness_external_call_fuzzer" ;;
    *)
        echo "Error: Invalid fuzzer type '$FUZZER_ALIAS'"
        echo "Valid options: 'tx', 'prover', 'alu', 'bitwise', 'ecc', 'gt', 'merkle_check', 'calldata', 'emit_public_log', 'internal_call', or 'external_call'"
        exit 1
        ;;
esac

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BARRETENBERG_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CPP_DIR="$BARRETENBERG_ROOT/cpp"
COVERAGE_OUTPUT_DIR="$SCRIPT_DIR/coverage"

# Set build directory based on command
if [ "$COMMAND" = "coverage" ]; then
    BUILD_DIR="$CPP_DIR/build-fuzzing-avm-cov"
    BUILD_PRESET="fuzzing-avm"
    BUILD_CMAKE_FLAGS="-DCOVERAGE=ON -DCOVERAGE_AVM=ON"
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
            cmake --preset "$BUILD_PRESET" -B "$BUILD_DIR" $BUILD_CMAKE_FLAGS
        else
            cmake --preset "$BUILD_PRESET" -B "$BUILD_DIR"
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
# Read once at startup. libFuzzer writes new units into, and reloads from, only the first corpus
# directory, so this is a seed source rather than a channel workers share findings through.
SYNC_CORPUS_DIR="$SCRIPT_DIR/sync_corpus/$FUZZER_ALIAS"

# Prover fuzzer shares corpus with tx fuzzer
if [ "$FUZZER_ALIAS" = "prover" ]; then
    CORPUS_DIR="$SCRIPT_DIR/corpus/tx"
    SYNC_CORPUS_DIR="$SCRIPT_DIR/sync_corpus/tx"
fi

# Artifacts must live outside the corpus. libFuzzer reads corpus directories recursively, so a
# crash or slow-unit artifact stored under one is reloaded as a seed and the next run dies on it
# during the initial corpus pass.
CRASHES_DIR="$SCRIPT_DIR/crashes/$FUZZER_ALIAS"

# Create corpus, sync_corpus, and crashes directories
mkdir -p "$CORPUS_DIR"
mkdir -p "$CRASHES_DIR"
mkdir -p "$SYNC_CORPUS_DIR"

# Change to build directory
cd "$BUILD_DIR"

# Default fuzzer parameters.
# The prover fuzzer runs check_circuit per input, so it needs a larger per-input budget and more
# memory than the tx fuzzer. Neither timeout may be 0: an input that never terminates would park a
# worker for the rest of the campaign, and one that runs unbounded despite its gas limit is itself
# a finding.
# RSS_LIMIT_MB is the threshold at which an input is declared an OOM; WORKER_MEM_MB is what a worker
# is expected to actually need, and is what workers are sized against. The tx fuzzer runs at about
# 40MB, so its expectation is far below its limit. The prover fuzzer's peak has not been measured, so
# it is assumed to approach its own limit.
if [ "$FUZZER_ALIAS" = "prover" ]; then
    TIMEOUT=${TIMEOUT:-300}
    RSS_LIMIT_MB=${RSS_LIMIT_MB:-8192}
    WORKER_MEM_MB=${WORKER_MEM_MB:-8192}
else
    TIMEOUT=${TIMEOUT:-30}
    RSS_LIMIT_MB=${RSS_LIMIT_MB:-4096}
    WORKER_MEM_MB=${WORKER_MEM_MB:-512}
fi
# Nothing in the generator caps the number of programs or instructions, so this is the only bound on
# how large an input can grow. Left unset, libFuzzer would use 4096 on a fresh corpus and the
# largest corpus file on a warm one, which silently changes the bound between runs.
MAX_LEN=${MAX_LEN:-65536}

# CPU allowance: a cgroup quota if one applies, otherwise the core count. nproc reflects the
# affinity mask but not the quota, so on a shared or containerised host it can report the whole
# machine while the process is confined to a fraction of it.
cpu_allowance() {
    local quota period
    if [ -r /sys/fs/cgroup/cpu.max ]; then
        read -r quota period < /sys/fs/cgroup/cpu.max
    elif [ -r /sys/fs/cgroup/cpu/cpu.cfs_quota_us ] && [ -r /sys/fs/cgroup/cpu/cpu.cfs_period_us ]; then
        quota=$(cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us)
        period=$(cat /sys/fs/cgroup/cpu/cpu.cfs_period_us)
    fi
    case "${quota:-}" in
    '' | *[!0-9]*) quota= ;;
    esac
    case "${period:-}" in
    '' | *[!0-9]* | 0) period= ;;
    esac
    if [ -n "$quota" ] && [ -n "$period" ]; then
        echo $((quota / period))
    else
        nproc
    fi
}

# Memory the fuzzer may assume, in MB: whatever a cgroup limit allows, bounded by what is actually
# free on the host.
available_mb() {
    local avail_kb limit limit_kb
    avail_kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
    for f in /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory/memory.limit_in_bytes; do
        if [ -r "$f" ]; then
            limit=$(cat "$f")
            case "$limit" in
            '' | *[!0-9]*) continue ;;
            esac
            limit_kb=$((limit / 1024))
            if [ "$limit_kb" -lt "$avail_kb" ]; then
                avail_kb=$limit_kb
            fi
        fi
    done
    echo $((avail_kb / 1024))
}

# Each process gets its own world state, so workers are bounded by memory as well as by CPU.
# Oversubscribing memory is the worse failure: the kernel kills the process before libFuzzer can
# report the OOM and write a reproducer.
CPU_WORKERS=$(cpu_allowance)
if [ "$CPU_WORKERS" -lt 1 ]; then
    CPU_WORKERS=1
fi
AVAILABLE_MB=$(available_mb)
MEM_WORKERS=$((AVAILABLE_MB * 8 / 10 / WORKER_MEM_MB))
if [ "$MEM_WORKERS" -lt 1 ]; then
    MEM_WORKERS=1
fi
# Default to a small share of the machine so a run on shared compute is not disruptive, lowered
# further if the CPU or memory allowance cannot support even that. Raise it with WORKERS on a host
# the campaign has to itself.
DEFAULT_WORKERS=3
if [ "$CPU_WORKERS" -lt "$DEFAULT_WORKERS" ]; then
    DEFAULT_WORKERS=$CPU_WORKERS
fi
if [ "$MEM_WORKERS" -lt "$DEFAULT_WORKERS" ]; then
    DEFAULT_WORKERS=$MEM_WORKERS
fi
WORKERS=${WORKERS:-$DEFAULT_WORKERS}
# -jobs is how many jobs run in total, -workers how many at once. A job lost to a crash, an OOM or
# a timeout is only replaced while jobs remain, so a campaign set to jobs == workers degrades
# towards a single process without saying so.
JOBS=${JOBS:-$((WORKERS * 100))}
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
    echo "  -rss_limit_mb=$RSS_LIMIT_MB"
    echo "  -max_len=$MAX_LEN"
    echo "  -workers=$WORKERS (cpu allowance $CPU_WORKERS, ${AVAILABLE_MB}MB free allows $MEM_WORKERS at ${WORKER_MEM_MB}MB each)"
    echo "                    defaults to 3 regardless, so raise WORKERS on a dedicated host"
    echo "  -jobs=$JOBS"
    echo "  -entropic=$ENTROPIC"
    echo "  -shrink=$SHRINK"
    echo "  -artifact_prefix=$ARTIFACT_PREFIX"
    echo ""
    echo "Override with WORKERS, JOBS, TIMEOUT, RSS_LIMIT_MB, WORKER_MEM_MB or MAX_LEN in the"
    echo "environment."
    if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
        echo "Extra arguments: ${EXTRA_ARGS[*]}"
    fi
fi
echo "=========================================="
echo ""

# Set coverage environment variable if coverage command
if [ "$COMMAND" = "coverage" ]; then
    mkdir -p "$COVERAGE_OUTPUT_DIR"
    export LLVM_PROFILE_FILE="$COVERAGE_OUTPUT_DIR/fuzzer-%p.profraw"
    echo "Coverage profiling enabled: LLVM_PROFILE_FILE=$LLVM_PROFILE_FILE"
    echo "COVERAGE_AVM: check_circuit is skipped in coverage builds"
    echo ""
fi

# Build fuzzer command arguments
FUZZER_CMD=(./bin/$FUZZER_TYPE)

if [ "$COMMAND" = "coverage" ]; then
    # When running with coverage, run all corpus entries once (runs=0 means corpus only).
    # No -workers: it only takes effect alongside -jobs, and a forked run would have every child
    # writing the same profraw path.
    FUZZER_CMD+=("$CORPUS_DIR" "$SYNC_CORPUS_DIR"
        -timeout=$TIMEOUT
        -rss_limit_mb=$RSS_LIMIT_MB
        -max_len=$MAX_LEN
        -runs=0)
else
    # Normal fuzzing with full parameters
    FUZZER_CMD+=(
        -timeout=$TIMEOUT
        -rss_limit_mb=$RSS_LIMIT_MB
        -max_len=$MAX_LEN
        -workers=$WORKERS
        -jobs=$JOBS
        -entropic=$ENTROPIC
        -shrink=$SHRINK
        -print_final_stats=1
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
if [ "$COMMAND" = "coverage" ] && compgen -G "$COVERAGE_OUTPUT_DIR/*.profraw" >/dev/null; then
    echo ""
    echo "=========================================="
    echo "Processing coverage data..."
    echo "=========================================="

    COVERAGE_DATA="$COVERAGE_OUTPUT_DIR/bb_avm.profdata"
    # Merge all profraw and profdata files in coverage directory (skip globs that match nothing)
    COVERAGE_FILES=()
    for f in "$COVERAGE_OUTPUT_DIR"/*.profraw "$COVERAGE_OUTPUT_DIR"/*.profdata; do
        [ -f "$f" ] && COVERAGE_FILES+=("$f")
    done
    echo "Merging coverage files:"
    for f in "${COVERAGE_FILES[@]}"; do
        echo "  $f"
    done
    echo ""
    llvm-profdata-20 merge -sparse "${COVERAGE_FILES[@]}" -o "$COVERAGE_DATA"

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

    # Ignore patterns for:
    #  - Generated, constraining, testing, tooling, optimized directories
    #  - opcodes.cpp:                  Debug utility, not called in normal execution
    #  - interfaces/*.hpp:             Interface pattern, virtual destructors aren't called directly
    #  - test_interaction_builder.hpp: Test-only code
    IGNORE_REGEX="(vm2/generated|vm2/constraining|vm2/testing|vm2/tooling|vm2/optimized|vm2/common/opcodes.cpp|vm2/simulation/interfaces|tracegen/lib/test_interaction_builder.hpp)"

    if [ "$COVERAGE_FORMAT" = "html" ]; then
        REPORT_DIR="$COVERAGE_OUTPUT_DIR/html"
        mkdir -p "$REPORT_DIR"
        llvm-cov-20 show -output-dir="$REPORT_DIR" -format=html \
            -ignore-filename-regex="$IGNORE_REGEX" \
            ./bin/$FUZZER_TYPE -instr-profile="$COVERAGE_DATA" "$VM2_PATH_FILTER"

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
        llvm-cov-20 report \
            -ignore-filename-regex="$IGNORE_REGEX" \
            ./bin/$FUZZER_TYPE -instr-profile="$COVERAGE_DATA" "$VM2_PATH_FILTER"

        if [ $? -ne 0 ]; then
            echo "Error: Failed to generate coverage report"
            exit 1
        fi
    fi
fi
