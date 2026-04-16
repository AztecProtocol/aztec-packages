#!/usr/bin/env bash
# Local runner for the AVM fuzzing container.
# Builds the image and runs a target using the ContFuzzer v2 env-var interface.

set -euo pipefail
IFS=$'\n\t'

target=''
mode='fuzz'
timeout='2592000'
cpus='1'
mem='8G'
jobs_="$cpus"
workers='1'
rss_limit='2048'
max_len='8192'

show_help() {
	echo "Usage: $0 [options]"
	echo ""
	echo "Options:"
	echo "  -t, --target <name>     Target name (from /targets/), e.g. harness_alu_fuzzer_avm"
	echo "  --mode <mode>           fuzz | coverage | minimize | reproduce | regress (default: $mode)"
	echo "  --timeout <secs>        Fuzzing timeout in seconds (default: $timeout)"
	echo "  -c, --cpus <n>          CPU allocation (default: $cpus)"
	echo "  --mem <size>            Memory limit (default: $mem)"
	echo "  -j, --jobs <n>          Parallelism (default: $jobs_)"
	echo "  -w, --workers <n>       Subprocesses per job (default: $workers)"
	echo "  -r, --rss-limit <MB>    RSS limit in MB (default: $rss_limit)"
	echo "  --max-len <N>           Max input length in bytes (default: $max_len)"
	echo "  --list-targets          List available targets and exit"
	echo "  -h, --help              Show this help"
	echo ""
	echo "AVM fuzzers default to --cpus 1 --mem 8G due to LMDB single-writer constraint."
}

list_targets=0

while [[ $# -gt 0 ]]; do
	case "$1" in
	-t | --target)  target="$2";    shift 2 ;;
	--mode)         mode="$2";      shift 2 ;;
	--timeout)      timeout="$2";   shift 2 ;;
	-c | --cpus)    cpus="$2"; jobs_="$cpus"; shift 2 ;;
	--mem)          mem="$2";       shift 2 ;;
	-j | --jobs)    jobs_="$2";     shift 2 ;;
	-w | --workers) workers="$2";   shift 2 ;;
	-r | --rss-limit) rss_limit="$2"; shift 2 ;;
	--max-len) max_len="$2"; shift 2 ;;
	--list-targets) list_targets=1; shift ;;
	-h | --help)    show_help; exit 0 ;;
	*)              echo "Unknown flag: $1" >&2; exit 1 ;;
	esac
done

image_name=avm-fuzzing

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Building container image: $image_name"
docker build "$SCRIPT_DIR/src" -t "$image_name":latest

if [[ "$list_targets" -eq 1 ]]; then
	docker run --rm --entrypoint ls "$image_name" /targets/
	exit 0
fi

if [ -z "$target" ]; then
	echo "err: No target specified. Use --target <name> or --list-targets" >&2
	show_help
	exit 1
fi

mkdir -p corpus crashes output

docker_args=(
	--rm
	--user root
	--cpus="$cpus"
	-m "$mem"
	-e "FUZZ_TARGET=$target"
	-e "FUZZ_MODE=$mode"
	-e "FUZZ_TIMEOUT=$timeout"
	-e "FUZZ_JOBS=$jobs_"
	-e "FUZZ_WORKERS=$workers"
	-e "FUZZ_RSS_LIMIT=$rss_limit"
	-e "FUZZ_MAX_LEN=$max_len"
	-v "$(pwd)/corpus:/corpus:rw"
	-v "$(pwd)/crashes:/crashes:rw"
	-v "$(pwd)/output:/output:rw"
)

# Add -it only if we're in an interactive terminal
if [ -t 0 ] && [ -t 1 ]; then
	docker_args=(-it "${docker_args[@]}")
fi

echo "Starting AVM fuzzer: $target (mode=$mode)"
docker run "${docker_args[@]}" "$image_name"
