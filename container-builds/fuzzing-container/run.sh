#!/usr/bin/env bash
# Local runner for the ContFuzzer v2 fuzzing container.
# Builds the image and runs a target using the v2 env-var interface.

set -euo pipefail
IFS=$'\n\t'

target=''
mode='fuzz'
timeout='3600'
cpus='8'
mem='16G'
jobs_="$cpus"
rss_limit='2048'

show_help() {
	echo "Usage: $0 [options]"
	echo ""
	echo "Options:"
	echo "  -t, --target <name>     Target name (from /targets/), e.g. bigfield_fuzzer"
	echo "  -m, --mode <mode>       fuzz | coverage | minimize | reproduce (default: $mode)"
	echo "  --timeout <secs>        Fuzzing timeout in seconds (default: $timeout)"
	echo "  -c, --cpus <n>          CPU allocation (default: $cpus)"
	echo "  --mem <size>            Memory limit (default: $mem)"
	echo "  -j, --jobs <n>          Parallelism (default: $jobs_)"
	echo "  -r, --rss-limit <MB>    RSS limit in MB (default: $rss_limit)"
	echo "  --list-targets          List available targets and exit"
	echo "  -h, --help              Show this help"
}

list_targets=0

while [[ $# -gt 0 ]]; do
	case "$1" in
	-t | --target)  target="$2";    shift 2 ;;
	-m | --mode)    mode="$2";      shift 2 ;;
	--timeout)      timeout="$2";   shift 2 ;;
	-c | --cpus)    cpus="$2"; jobs_="$cpus"; shift 2 ;;
	--mem)          mem="$2";       shift 2 ;;
	-j | --jobs)    jobs_="$2";     shift 2 ;;
	-r | --rss-limit) rss_limit="$2"; shift 2 ;;
	--list-targets) list_targets=1; shift ;;
	-h | --help)    show_help; exit 0 ;;
	*)              echo "Unknown flag: $1" >&2; exit 1 ;;
	esac
done

image_name=barretenberg-fuzzer

docker build src/ -t "$image_name":latest

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

docker run -it --rm \
	--user root \
	--cpus="$cpus" \
	-m "$mem" \
	-e "FUZZ_TARGET=$target" \
	-e "FUZZ_MODE=$mode" \
	-e "FUZZ_TIMEOUT=$timeout" \
	-e "FUZZ_JOBS=$jobs_" \
	-e "FUZZ_RSS_LIMIT=$rss_limit" \
	-v "$(pwd)/corpus:/corpus:rw" \
	-v "$(pwd)/crashes:/crashes:rw" \
	-v "$(pwd)/output:/output:rw" \
	"$image_name"
