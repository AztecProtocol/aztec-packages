#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

fuzzer=''
verbosity='0'
timeout='2592000' # 1 month
mode='fuzzing'
asm='on'
cpus='8'
mem="16G"
jobs_="$cpus"
workers='0'
avm='off'
rss_limit='2048	'

show_help() {
	echo "Usage: $0 [options]"
	echo ""
	echo "Options:"
	echo "  -v, --verbose               Enable fuzzer's verbose mode (default: disabled)"
	echo "  -f, --fuzzer <fuzzer_name>  Specify the fuzzer to use (current: $fuzzer)"
	echo "  -t, --timeout <timeout>     Set the maximum total time for fuzzing in seconds (default: $timeout - 1 month)"
	echo "  -c, --cpus <cpus>           Set the amount of CPUs for container to use (default: $cpus)"
	echo "  --mem <memory>              Set the amount of memory for container to use (default: $mem)"
	echo "  -j, --jobs <N>              Set the amount of processes to run (default: $jobs_)"
	echo "  -w, --workers <N>           Set the amount of subprocesses per job (default: $workers)"
	echo "  -m, --mode <mode>           Set the mode of operation (fuzzing, coverage or regress-only) (default: $mode)"
	echo "  -a, --asm <mode>            Set the flag to enable/disable asm instructions (on/off) (default: $asm)"
	echo "  -A, --avm                   Enable AVM fuzzing mode (uses build-fuzzing-avm) (default: $avm)"
	echo "  -r, --rss-limit <MB>        Set RSS limit in megabytes (default: 2048 MB)"
	echo "  -h, --help                  Display this help and exit"
	echo "  --show-fuzzers              Display the available fuzzers"
	echo ""
	echo "This script handles fuzzing testing with specified parameters, managing crash reports,"
	echo "and coverage testing based on the mode specified."
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	-v | --verbose)
		verbosity="1"
		shift
		;;
	-f | --fuzzer)
		fuzzer="$2"
		shift 2
		;;
	--show-fuzzers)
		mode="show-fuzzers"
		shift
		;;
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
	-m | --mode)
		mode="$2"
		shift 2
		;;
	-a | --asm)
		asm="$2"
		shift 2
		;;
	-A | --avm)
		avm='on'
		shift
		;;
	-r | --rss-limit)
		rss_limit="$2"
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
	-h | --help)
		show_help
		exit 0
		;;
	--)
		shift
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

image_name=barretenberg-fuzzer

docker build src/ -t "$image_name":latest

if [[ "$mode" == "show-fuzzers" ]]; then
	entrypoint_args=(--show-fuzzers)
	entrypoint_args+=(--asm "$asm")
	entrypoint_args+=(--avm "$avm")

	docker run -it --rm \
		--entrypoint "./entrypoint.sh" \
		"$image_name" \
		"${entrypoint_args[@]}"
	exit 0
fi

if [ -z "${fuzzer}" ]; then
	echo "err: No fuzzer was provided"
	echo
	show_help
	exit 1
fi

mkdir -p crash-reports/unsorted output corpus coverage artifacts

docker_args=(
	-it --rm
	--user root
	-v "$(pwd)/crash-reports:/home/fuzzer/crash-reports:rw"
	-v "$(pwd)/output:/home/fuzzer/output:rw"
	-v "$(pwd)/corpus:/home/fuzzer/corpus:rw"
	-v "$(pwd)/coverage:/home/fuzzer/coverage:rw"
	-v "$(pwd)/artifacts:/home/fuzzer/artifacts:rw"
	--cpus="$cpus"
	-m "$mem"
	--entrypoint "./entrypoint.sh"
	"$image_name"
)

entrypoint_args=(
	--fuzzer "$fuzzer"
	--mode "$mode"
	--asm "$asm"
	--avm "$avm"
	--timeout "$timeout"
	--workers "$workers"
	--jobs "$jobs_"
	--verbosity "$verbosity"
	--rss-limit "$rss_limit"
)

docker run "${docker_args[@]}" "${entrypoint_args[@]}"
