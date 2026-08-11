#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

timeout='2592000' # 1 month
cpus="$(nproc)"
# The fuzzer allows each worker -rss_limit_mb before calling an input an OOM, so the container needs
# room for every worker to reach it. Below that the cgroup kills the process first, and a kernel kill
# leaves no artifact to reproduce from. Raise this alongside --workers.
mem="16G"
# Left empty, run_fuzzer.sh derives the worker and job counts from the cgroup limits --cpus and -m
# impose, and applies its own input length default.
jobs_=''
workers=''
max_len=''

show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -t, --timeout <timeout>     Set the maximum total time for fuzzing in seconds (default: $timeout - 1 month)"
    echo "  -c, --cpus <cpus>           Set the amount of CPUs for container to use (default: all)"
    echo "  --mem <memory>              Set the amount of memory for container to use (default: $mem)"
    echo "  -j, --jobs <N>              Set the amount of processes to run (default: derived from --cpus and --mem)"
    echo "  -w, --workers <N>           Set the amount of subprocesses per job (default: derived from --cpus and --mem)"
    echo "  -m, --max-len <N>           Set the maximum input length in bytes (default: run_fuzzer.sh's own)"
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

echo "Building container image: $image_name"
docker build -t "$image_name":latest "$SCRIPT_DIR/src"

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
)

# Forwarded only when asked for, so the container's limits remain the single source of truth
if [ -n "$workers" ]; then
    entrypoint_args+=(--workers "$workers")
fi
if [ -n "$jobs_" ]; then
    entrypoint_args+=(--jobs "$jobs_")
fi
if [ -n "$max_len" ]; then
    entrypoint_args+=(--max-len "$max_len")
fi

# Add extra arguments after --
if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
    entrypoint_args+=(-- "${EXTRA_ARGS[@]}")
fi

echo "Starting AVM TX fuzzer container..."
docker run "${docker_args[@]}" "${entrypoint_args[@]}"
