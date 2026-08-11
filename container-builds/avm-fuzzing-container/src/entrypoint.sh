#!/usr/bin/env bash

set -uo pipefail
IFS=$'\n\t'

umask 000

timeout='2592000' # 1 month
# Left empty, run_fuzzer.sh derives these. It reads the cgroup CPU quota and memory limit that
# --cpus and -m impose, which nproc inside the container cannot see.
jobs_=''
workers=''
max_len=''

show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -t, --timeout <timeout>     Set the maximum total time for fuzzing in seconds (default: $timeout - 1 month)"
    echo "  -j, --jobs <N>              Set the amount of processes to run (default: derived from the container's limits)"
    echo "  -w, --workers <N>           Set the amount of subprocesses per job (default: derived from the container's limits)"
    echo "  -m, --max-len <N>           Set the maximum input length in bytes (default: run_fuzzer.sh's own)"
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

# Only what is specific to running in a container. Per-input timeout, worker and job counts, input
# length, entropic and shrink are run_fuzzer.sh's, and passing them here would override its defaults.
# The artifact prefix has to point at the mounted volume so crashes survive the container.
FUZZER_ARGS=(
    -max_total_time="$timeout"
    -artifact_prefix="$CRASHES/"
)

# Overrides are handed to run_fuzzer.sh through the environment rather than appended as libFuzzer
# flags, so its own bounds checks still apply.
[ -n "$workers" ] && export WORKERS="$workers"
[ -n "$jobs_" ] && export JOBS="$jobs_"
[ -n "$max_len" ] && export MAX_LEN="$max_len"

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
log "  max_total_time=$timeout"
log "  jobs=${jobs_:-derived by run_fuzzer.sh}"
log "  workers=${workers:-derived by run_fuzzer.sh}"
log "  max_len=${max_len:-run_fuzzer.sh default}"
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
