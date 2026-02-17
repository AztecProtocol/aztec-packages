#!/bin/bash
# Consolidated AVM coverage script
# Usage: ./avm_coverage.sh <subcommand> [options]
#
# Subcommands:
#   collect [--all | TEST_NAME]   Collect inputs from AVM bb-prover tests
#   run                           Run coverage on collected inputs
#   merge                         Merge and generate reports
#   all [--all | TEST_NAME]       Run full pipeline (collect + run + merge)
#   clean                         Clean coverage artifacts
#   help                          Show this help message

set -e

# === Configuration ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/../../.."
BUILD_DIR="$SCRIPT_DIR/../build-coverage"
BB_AVM="$BUILD_DIR/bin/bb-avm"
COVERAGE_DIR="$SCRIPT_DIR/../src/barretenberg/avm_fuzzer/coverage"
INPUTS_DIR="$COVERAGE_DIR/bb-prover"
TRACK_COV_DIR="$SCRIPT_DIR/../src/barretenberg/vm2"
IGNORE_REGEX="(simulation/standalone|generated/|optimized/)"
YARN_PROJECT="$REPO_ROOT/yarn-project"
BB_PROVER="$YARN_PROJECT/bb-prover"

# === Helper Functions ===

# Find llvm-profdata and llvm-cov tools (tries versioned first)
find_llvm_tools() {
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
}

# Check prerequisites for running coverage
check_prerequisites() {
    local need_llvm=${1:-false}

    if [ ! -f "$BB_AVM" ]; then
        echo "Error: Coverage-enabled bb-avm not found at $BB_AVM"
        echo ""
        echo "Build it with:"
        echo "  cmake --preset clang16-coverage"
        echo "  cmake --build --preset clang16-coverage --target bb-avm"
        exit 1
    fi

    if [ "$need_llvm" = true ]; then
        find_llvm_tools
        if [ -z "$LLVM_PROFDATA" ] || [ -z "$LLVM_COV" ]; then
            echo "Error: Could not find llvm-profdata or llvm-cov"
            echo "Install LLVM tools (e.g., apt install llvm-18)"
            exit 1
        fi
    fi
}

usage() {
    cat << 'EOF'
AVM Coverage Tool

Usage: ./avm_coverage.sh <subcommand> [options]

Subcommands:
  collect [--all | TEST_NAME]   Collect inputs from AVM bb-prover tests
  run                           Run coverage on collected inputs
  merge                         Merge and generate reports
  all [--all | TEST_NAME]       Run full pipeline (collect + run + merge)
  clean                         Clean coverage artifacts
  help                          Show this help message

Examples:
  ./avm_coverage.sh collect avm_minimal_proving   # Collect from single test
  ./avm_coverage.sh collect --all                 # Collect from all tests
  ./avm_coverage.sh run                           # Run coverage on inputs
  ./avm_coverage.sh merge                         # Generate reports
  ./avm_coverage.sh all --all                     # Full pipeline

Prerequisites:
  Build coverage-enabled bb-avm:
    cmake --preset clang16-coverage
    cmake --build --preset clang16-coverage --target bb-avm

Output directories:
  Inputs:   barretenberg/cpp/src/barretenberg/avm_fuzzer/coverage/inputs/
  Coverage: barretenberg/cpp/src/barretenberg/avm_fuzzer/coverage/
EOF
    exit 0
}

# === Subcommands ===

# Collect inputs from AVM tests
cmd_collect() {
    mkdir -p "$INPUTS_DIR"

    local run_all=false
    local test_name=""

    # Parse arguments
    case "${1:-}" in
        --all)
            run_all=true
            ;;
        --help|-h)
            echo "Usage: $0 collect [--all | TEST_NAME]"
            echo ""
            echo "Options:"
            echo "  --all      Run all tests in avm_proving_tests/"
            echo "  TEST_NAME  Name of the test (without .test.ts extension)"
            echo ""
            echo "Examples:"
            echo "  $0 collect avm_minimal_proving    # Run single test"
            echo "  $0 collect --all                  # Run all tests"
            echo ""
            echo "Available tests:"
            ls "$BB_PROVER/src/avm_proving_tests"/*.test.ts 2>/dev/null | xargs -n1 basename | sed 's/.test.ts$//' || echo "  (none found)"
            exit 0
            ;;
        "")
            echo "Error: Must specify --all or a test name"
            echo "Run '$0 collect --help' for usage"
            exit 1
            ;;
        *)
            test_name="$1"
            ;;
    esac

    # Change to bb-prover directory for running tests
    cd "$BB_PROVER"

    run_test() {
        local test_file="$1"
        local name=$(basename "$test_file" .test.ts)

        echo "=== Running test: $name ==="

        # Record existing bb-* dirs before test
        ls -d /tmp/bb-* 2>/dev/null | sort > /tmp/before_test.txt || true

        # Run the test
        BB_SKIP_CLEANUP=1 yarn test "$test_file" || true

        # Record bb-* dirs after test
        ls -d /tmp/bb-* 2>/dev/null | sort > /tmp/after_test.txt || true

        # Find new dirs and copy avm_inputs.bin
        local count=0
        for dir in $(comm -13 /tmp/before_test.txt /tmp/after_test.txt); do
            if [ -f "$dir/avm_inputs.bin" ]; then
                cp "$dir/avm_inputs.bin" "$INPUTS_DIR/${name}_${count}_avm_inputs.bin"
                echo "Copied: $dir/avm_inputs.bin -> $INPUTS_DIR/${name}_${count}_avm_inputs.bin"
                count=$((count + 1))
            else
                echo "No avm_inputs.bin found in $dir"
                ls -la "$dir"
            fi
        done

        rm -f /tmp/before_test.txt /tmp/after_test.txt
    }

    if [ "$run_all" = true ]; then
        echo "Running all AVM proving tests..."
        for test_file in src/avm_proving_tests/*.test.ts; do
            run_test "$test_file"
        done
    else
        test_file="src/avm_proving_tests/$test_name.test.ts"
        if [ ! -f "$test_file" ]; then
            echo "Error: Test file not found: $test_file"
            echo ""
            echo "Available tests:"
            ls src/avm_proving_tests/*.test.ts 2>/dev/null | xargs -n1 basename | sed 's/.test.ts$//'
            exit 1
        fi
        run_test "$test_file"
    fi

    echo ""
    echo "=== Files in inputs directory: ==="
    ls -la "$INPUTS_DIR/"
}

# Run bb-avm on collected inputs to generate .profraw files
cmd_run() {
    check_prerequisites false

    mkdir -p "$COVERAGE_DIR"

    # Get list of all input files
    INPUT_FILES=($(ls "$INPUTS_DIR"/*.bin 2>/dev/null || true))

    if [ ${#INPUT_FILES[@]} -eq 0 ]; then
        echo "No input files found in $INPUTS_DIR"
        echo ""
        echo "Run '$0 collect' first to collect inputs from tests"
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
    echo "Run '$0 merge' to generate reports"
}

# Merge profraw files and generate reports
cmd_merge() {
    check_prerequisites true

    # Count profraw files
    PROFRAW_COUNT=$(ls "$COVERAGE_DIR"/*.profraw 2>/dev/null | wc -l || echo 0)

    if [ "$PROFRAW_COUNT" -eq 0 ]; then
        echo "Error: No .profraw files found in $COVERAGE_DIR"
        echo ""
        echo "Run '$0 run' first to generate coverage data"
        exit 1
    fi

    echo "Merging $PROFRAW_COUNT .profraw files..."
    echo "Using: $LLVM_PROFDATA, $LLVM_COV"
    echo ""

    # Step 1: Merge all profraw files into a single profdata file
    $LLVM_PROFDATA merge -sparse "$COVERAGE_DIR"/*.profraw -o "$COVERAGE_DIR/merged.profdata"
    echo "Created: $COVERAGE_DIR/merged.profdata"

    # Step 2: Generate HTML report (filtered to vm2 directory)
    $LLVM_COV show "$BB_AVM" \
        -instr-profile="$COVERAGE_DIR/merged.profdata" \
        -format=html \
        -output-dir="$COVERAGE_DIR/html" \
        -show-line-counts-or-regions \
        -show-expansions \
        -show-branches=count \
        -ignore-filename-regex="$IGNORE_REGEX" \
        "$TRACK_COV_DIR"
    echo "Created: $COVERAGE_DIR/html/"

    # Step 3: Generate LCOV format (filtered to vm2 directory)
    $LLVM_COV export "$BB_AVM" \
        -instr-profile="$COVERAGE_DIR/merged.profdata" \
        -format=lcov \
        -ignore-filename-regex="$IGNORE_REGEX" \
        "$TRACK_COV_DIR" > "$COVERAGE_DIR/coverage.lcov"
    echo "Created: $COVERAGE_DIR/coverage.lcov"

    echo ""
    echo "=== Coverage Summary ==="
    cat "$COVERAGE_DIR/coverage_summary.txt"
    echo ""
    echo "Reports generated in: $COVERAGE_DIR/"
    echo "  - coverage_summary.txt  Text summary"
    echo "  - coverage.lcov         LCOV format"
    echo "  - html/                 HTML report"
}

# Run full pipeline: collect + run + merge
cmd_all() {
    echo "=== AVM Coverage: Full Pipeline ==="
    echo ""

    echo ">>> Step 1: Collect inputs"
    cmd_collect "$@"
    echo ""

    echo ">>> Step 2: Run coverage"
    cmd_run
    echo ""

    echo ">>> Step 3: Merge and generate reports"
    cmd_merge
    echo ""

    echo "=== Pipeline Complete ==="
}

# Clean coverage artifacts
cmd_clean() {
    echo "Cleaning coverage artifacts..."

    if [ -d "$COVERAGE_DIR" ]; then
        rm -rf "$COVERAGE_DIR"
        echo "Removed: $COVERAGE_DIR"
    else
        echo "Nothing to clean"
    fi

    echo "Done"
}

# === Main ===
case "${1:-}" in
    collect)
        cmd_collect "${@:2}"
        ;;
    run)
        cmd_run
        ;;
    merge)
        cmd_merge
        ;;
    all)
        cmd_all "${@:2}"
        ;;
    clean)
        cmd_clean
        ;;
    help|--help|-h)
        usage
        ;;
    "")
        usage
        ;;
    *)
        echo "Unknown subcommand: $1"
        echo ""
        usage
        ;;
esac
