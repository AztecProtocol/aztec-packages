#!/usr/bin/env bash

set -uo pipefail
IFS=$'\n\t'

umask 000

timeout='2592000' # 1 month
jobs_="$(nproc)"
workers="$(nproc)"
max_len='8192'

show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -t, --timeout <timeout>     Set the maximum total time for fuzzing in seconds (default: $timeout - 1 month)"
    echo "  -j, --jobs <N>              Set the amount of processes to run (default: $jobs_)"
    echo "  -w, --workers <N>           Set the amount of subprocesses per job (default: $workers)"
    echo "  -m, --max-len <N>           Set the maximum input length in bytes (default: $max_len)"
    echo "  -h, --help                  Display this help and exit"
    echo "  --                          Pass additional arguments to the fuzzer"
    echo ""
    echo "This container runs the AVM TX fuzzer for differential testing."
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
    -t | --timeout)
        timeout="$2"
        shift 2
        ;;
    -w | --workers)
        workers="$2"
        shift 2
        ;;
    -j | --jobs)
        jobs_="$2"
        shift 2
        ;;
    -m | --max-len)
        max_len="$2"
        shift 2
        ;;
    -h | --help)
        show_help
        exit 0
        ;;
    --)
        shift
        EXTRA_ARGS=("$@")
        break
        ;;
    -*)
        log "Error: Unsupported flag $1"
        exit 1
        ;;
    *)
        break
        ;;
    esac
done

workdir="/home/fuzzer"
CORPUS="$workdir/corpus/tx"
OUTPUT="$workdir/output"
CRASHES="$workdir/crash-reports"
ARTIFACTS="$workdir/artifacts"

mkdir -p "$CORPUS" "$OUTPUT" "$CRASHES" "$ARTIFACTS"

# Link the corpus directory to where run_fuzzer.sh expects it
FUZZER_CORPUS="$workdir/aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer/corpus/tx"
if [ ! -L "$FUZZER_CORPUS" ] && [ -d "$FUZZER_CORPUS" ]; then
    rm -rf "$FUZZER_CORPUS"
fi
mkdir -p "$(dirname "$FUZZER_CORPUS")"
ln -sf "$CORPUS" "$FUZZER_CORPUS" 2>/dev/null || true

# Build fuzzer arguments
FUZZER_ARGS=(
    -timeout=1200
    -workers="$workers"
    -jobs="$jobs_"
    -entropic=1
    -shrink=1
    -max_len="$max_len"
    -max_total_time="$timeout"
    -artifact_prefix="$CRASHES/"
)

# Add extra arguments
if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
    FUZZER_ARGS+=("${EXTRA_ARGS[@]}")
fi

log "=========================================="
log "AVM TX Fuzzer"
log "=========================================="
log "Corpus directory: $CORPUS"
log "Output directory: $OUTPUT"
log "Crashes directory: $CRASHES"
log "Parameters:"
log "  timeout=$timeout"
log "  jobs=$jobs_"
log "  workers=$workers"
log "  max_len=$max_len"
if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
    log "Extra arguments: ${EXTRA_ARGS[*]}"
fi
log "=========================================="
log ""

cd "$workdir/aztec-packages/barretenberg/cpp/src/barretenberg/avm_fuzzer"

# Run the fuzzer
log "Starting AVM TX fuzzer..."
./run_fuzzer.sh fuzz tx -- "${FUZZER_ARGS[@]}" 2>&1 | tee "$OUTPUT/session.log"

exit_code=${PIPESTATUS[0]}

log "Fuzzer exited with code: $exit_code"

# Package artifacts if any crashes found
if compgen -G "$CRASHES/*" >/dev/null; then
    log "Crashes found, packaging artifacts..."
    tar -czf "$ARTIFACTS/tx-fuzzer-results.tar.gz" \
        -C "$CRASHES" . \
        -C "$CORPUS" . 2>/dev/null || true
fi

exit "$exit_code"
