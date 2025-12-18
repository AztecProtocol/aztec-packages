#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

timeout='2592000' # 1 month
cpus='4'
mem="8G"
jobs_="$cpus"
workers='1'
max_len='8192'

show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -t, --timeout <timeout>     Set the maximum total time for fuzzing in seconds (default: $timeout - 1 month)"
    echo "  -c, --cpus <cpus>           Set the amount of CPUs for container to use (default: $cpus)"
    echo "  --mem <memory>              Set the amount of memory for container to use (default: $mem)"
    echo "  -j, --jobs <N>              Set the amount of processes to run (default: $jobs_)"
    echo "  -w, --workers <N>           Set the amount of subprocesses per job (default: $workers)"
    echo "  -m, --max-len <N>           Set the maximum input length in bytes (default: $max_len)"
    echo "  -h, --help                  Display this help and exit"
    echo "  --                          Pass additional arguments to the fuzzer"
    echo ""
    echo "This script builds and runs the AVM TX fuzzer container."
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
    -c | --cpus)
        cpus="$2"
        shift 2
        ;;
    --mem)
        mem="$2"
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
        echo "Error: Unsupported flag $1" >&2
        exit 1
        ;;
    *)
        break
        ;;
    esac
done

image_name=avm-tx-fuzzer

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get aztec-packages root (two levels up from container-builds/avm-fuzzing-container)
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Building container image: $image_name"
echo "Build context: $REPO_ROOT"
docker build -t "$image_name":latest -f "$SCRIPT_DIR/src/Dockerfile" "$REPO_ROOT"

mkdir -p crash-reports output corpus artifacts

docker_args=(
    --rm
    --user root
    -v "$(pwd)/crash-reports:/home/fuzzer/crash-reports:rw"
    -v "$(pwd)/output:/home/fuzzer/output:rw"
    -v "$(pwd)/corpus:/home/fuzzer/corpus:rw"
    -v "$(pwd)/artifacts:/home/fuzzer/artifacts:rw"
    --cpus="$cpus"
    -m "$mem"
)

# Add -it only if we're in an interactive terminal
if [ -t 0 ] && [ -t 1 ]; then
    docker_args=(-it "${docker_args[@]}")
fi

docker_args+=("$image_name")

entrypoint_args=(
    --timeout "$timeout"
    --workers "$workers"
    --jobs "$jobs_"
    --max-len "$max_len"
)

# Add extra arguments after --
if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
    entrypoint_args+=(-- "${EXTRA_ARGS[@]}")
fi

echo "Starting AVM TX fuzzer container..."
docker run "${docker_args[@]}" "${entrypoint_args[@]}"
