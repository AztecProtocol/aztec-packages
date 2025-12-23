#!/usr/bin/env bash

set -uo pipefail
IFS=$'\n\t'

umask 000

fuzzer=''
verbosity='0'
timeout='2592000' # 1 month
mode='fuzzing'
jobs_='4'
workers='0'
asm='on'
show_only=0
avm='off'

set_main_fuzzer() {
	main_fuzzer=''
	if [[ "$avm" == "on" ]]; then
		main_fuzzer="./build-fuzzing-avm/bin"
		# TODO(defkit): implement cov and post-fuzzer for AVM
		post_fuzzer="./build-fuzzing-avm/bin"
		cov_fuzzer="./build-fuzzing-avm/bin"
	else
		post_fuzzer="./build-fuzzing-asan/bin"
		cov_fuzzer="./build-fuzzing-cov/bin"
		case "$asm" in
		on)
			main_fuzzer="./build-fuzzing/bin"
			;;
		off)
			main_fuzzer="./build-fuzzing-noasm/bin"
			;;
		*)
			log "Unexpected asm flag value: $asm. Expecting on/off"
			exit 1
			;;
		esac
	fi
}

show_fuzzers() {
	echo "The following fuzzers are available:"
	echo
	if compgen -G "$main_fuzzer/*"* &>/dev/null; then
		for f in "$main_fuzzer/"*; do
			basename "$f"
		done
	fi
}

show_help() {
	echo "Usage: $0 [options]"
	echo ""
	echo "Options:"
	echo "  -v, --verbosity <verbosity> Enable fuzzer's verbose mode (default: $verbosity)"
	echo "  -f, --fuzzer <fuzzer_name>  Specify the fuzzer to use"
	echo "  -t, --timeout <timeout>     Set the maximum total time for fuzzing in seconds (default: $timeout - 1 month)"
	echo "  -j, --jobs <N>              Set the amount of processes to run (default: $jobs_)"
	echo "  -w, --workers <N>           Set the amount of subprocesses per job (default: $workers)"
	echo "  -m, --mode <mode>           Set the mode of operation (fuzzing, coverage or regress-only) (default: $mode)"
	echo "  -a, --asm <mode>            Set the flag to enable/disable asm instructions (on/off) (default: $asm)"
	echo "  -A, --avm <mode>            Enable AVM fuzzing mode (uses build-fuzzing-avm) (on/off) (default: $avm)"
	echo "  -h, --help                  Display this help and exit"
	echo "  --show-fuzzers              Display the available fuzzers"
	echo ""
	echo "This script handles fuzzing testing with specified parameters, managing crash reports,"
	echo "and coverage testing based on the mode specified."
	echo
}

log() {
	echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	-v | --verbosity)
		verbosity="$2"
		shift 2
		;;

	-f | --fuzzer)
		fuzzer="$2"
		shift 2
		;;
	--show-fuzzers)
		show_only=1
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
		avm="$2"
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
		log "Error: Unsupported flag $1"
		exit 1
		;;
	*)
		break
		;;
	esac
done

set_main_fuzzer

if [[ "$show_only" -eq 1 ]]; then
	show_fuzzers
	exit 0
fi

workdir="/home/fuzzer"

CRASHES="$workdir/crash-reports"
UNSORTED_CRASHES="$CRASHES/unsorted"
CORPUS="$workdir/corpus"
OUTPUT="$workdir/output"
COVERAGE="$workdir/coverage"
RAWCOV="$COVERAGE/raw"
ARTIFACTS="$workdir/artifacts"
mkdir -p "$CRASHES" "$UNSORTED_CRASHES" "$CORPUS" "$OUTPUT" "$COVERAGE" "$RAWCOV" "$ARTIFACTS"

if [ -z "${fuzzer}" ]; then
	log "No fuzzer was provided"
	show_help
	exit 1
elif [ ! -e "$main_fuzzer/$fuzzer" ]; then
	log "$main_fuzzer/$fuzzer does not exist"
	show_help
	exit 1
fi

main_fuzzer="$main_fuzzer/$fuzzer"
post_fuzzer="$post_fuzzer/$fuzzer"
cov_fuzzer="$cov_fuzzer/$fuzzer"

if [[ "$asm" == "off" ]]; then
	fuzzer="$fuzzer"_noasm
fi

CRASHES="$CRASHES/$fuzzer"
OUTPUT="$OUTPUT/$fuzzer"
CORPUS="$CORPUS/$fuzzer"
COVERAGE="$COVERAGE/$fuzzer"
RAWCOV="$RAWCOV/$fuzzer"

if compgen -G "$OUTPUT/*"* &>/dev/null; then
	dirs_=("$OUTPUT/"*)
	dirnum="${#dirs_[@]}"
	OUTPUT="$OUTPUT/$dirnum"
else
	OUTPUT="$OUTPUT/0"
fi

mkdir -p "$CRASHES" "$CORPUS" "$OUTPUT" "$COVERAGE" "$RAWCOV"

log "Output directory is: $OUTPUT"

regress() {
	src="$1"
	log "Entering $src..."
	if compgen -G "$src/*" &>/dev/null; then
		for x in "$src"/*; do
			"$main_fuzzer" "$x" &>/dev/null
			status=$?
			if [[ "$status" -ne 0 ]]; then
				"$post_fuzzer" "$x" &>"$OUTPUT"/result.txt
				cp "$x" "$OUTPUT"
				cp "$x" "$CRASHES" 2>/dev/null
				log "Existing $x resulted in exit status $status"
				exit 1
			fi
		done
	fi
	log "Leaving $src..."
}

log "Start regression testing"
regress "$CRASHES"
regress "$UNSORTED_CRASHES"
log "End of regression"

fuzz() {
	TMPOUT="$(mktemp -d)"
	MINDIR=""
	trap 'rm -rf "$TMPOUT"' EXIT

	log "Start $fuzzer with: max_total_time: $timeout, $jobs_ jobs and $workers workers"
	"$main_fuzzer" -max_total_time="$timeout" -verbosity="$verbosity" -artifact_prefix="$TMPOUT/" -jobs="$jobs_" -workers="$workers" -entropic=1 -shrink=1 -use_value_profile=1 -print_final_stats=1 "$CORPUS" &>"$TMPOUT/session.log"
	status=$?

	log "Fuzzer stopped"

	files=("$TMPOUT"/crash-*)
	timeout_files=("$TMPOUT"/timeout-*)

	exit_code=0
	if [ ${#files[@]} -eq 0 ] || [ ! -e "${files[0]}" ]; then
		if [[ "$status" -ne 0 ]] && [ ! ${#timeout_files[@]} -eq "$workers" ]; then
			log "Something wrong with $fuzzer. Not related to fuzzing. Exit status: $status"
			exit_code=1
		else
			log "No crashes occurred"
		fi
	else
		log "Start minimization"
		for crash in "${files[@]}"; do
			crash_name=$(basename "$crash")
			log "Minimizing $crash_name: $(wc -c <$crash)B"

			MINDIR=$(mktemp -d)
			mv "$TMPOUT/$crash_name" "$MINDIR"
			"$main_fuzzer" -minimize_crash=1 -runs=10000 -artifact_prefix="$MINDIR/" "$MINDIR/$crash_name" &>>"$TMPOUT/minimize.log"

			smallest_crash=$(ls -S "$MINDIR/" | tail -n 1)
			log "Minimized  $smallest_crash: $(wc -c <$MINDIR/$smallest_crash)B"

			cp "$MINDIR/$smallest_crash" "$OUTPUT"
			"$post_fuzzer" "$MINDIR/$smallest_crash" &>"$OUTPUT/$smallest_crash"_result.txt

			mv "$MINDIR/"* "$CRASHES"
			rm -rf "$MINDIR"
		done
		exit_code=1
	fi

	log "Minimizing the corpus of size $(find "$CORPUS" -type f | wc -l)..."
	MINCORP="$TMPOUT/corpus"
	mkdir -p "$MINCORP"

	"$main_fuzzer" -merge=1 -jobs="$jobs_" -workers="$workers" "$MINCORP" "$CORPUS"
	rm -rf "$CORPUS"
	mv "$MINCORP" "$CORPUS"
	log "Minimized the corpus to size $(find "$CORPUS" -type f | wc -l)"

	cp -r fuzz-*.log "$OUTPUT" 2>/dev/null || true

	mv "$TMPOUT/"* "$OUTPUT"
	rmdir "$TMPOUT"

	ARCHIVE_NAME="${fuzzer}.tar.gz"
	if compgen -G "$CORPUS/*" >/dev/null || compgen -G "$CRASHES/*" >/dev/null; then
		log "Packing corpus & crashes into $ARTIFACTS/$ARCHIVE_NAME"

		STAGE="$(mktemp -d)"
		mkdir -p "$STAGE/corpus" "$STAGE/crashes"

		cp -a "$CORPUS/." "$STAGE/corpus/" 2>/dev/null || true
		cp -a "$CRASHES/." "$STAGE/crashes/" 2>/dev/null || true

		tar -czf "$ARTIFACTS/$ARCHIVE_NAME" -C "$STAGE" corpus crashes

		rm -rf "$STAGE"
	else
		log "Corpus & crashes are empty, skipping packing"
	fi

	exit "$exit_code"
}

cov() {
	if ! compgen -G "$CORPUS/*" >/dev/null; then
		log "Corpus is empty, nothing to collect coverage from."
		return 0
	fi

	log "Cleaning previous coverage data in $RAWCOV and $COVERAGE..."
	rm -f "$RAWCOV"/*.profraw 2>/dev/null || true
	rm -f "$COVERAGE/fuzz.profdata" 2>/dev/null || true
	rm -rf "$COVERAGE/cov-html" 2>/dev/null || true

	TMPOUT="$(mktemp -d)"
	trap 'rm -rf "$TMPOUT" 2>/dev/null' EXIT

	TS=$(date +%Y%m%dT%H%M%S)

	log "Collecting coverage data on corpus..."
	LLVM_PROFILE_FILE="$RAWCOV/${TS}-%p.profraw" \
		"$cov_fuzzer" -merge=1 "$TMPOUT" "$CORPUS/"

	log "Merging coverage data..."
	llvm-profdata-18 merge -sparse "$RAWCOV/"*.profraw \
		-o "$COVERAGE/fuzz.profdata"

	log "Assembling HTML report..."
	llvm-cov-18 show "$cov_fuzzer" \
		-instr-profile="$COVERAGE/fuzz.profdata" \
		-format=html \
		-output-dir="$COVERAGE/cov-html" \
		-show-line-counts-or-regions \
		--show-branches=percent \
		--show-directory-coverage

	log "Coverage HTML written to $COVERAGE/cov-html"
}

case "$mode" in
fuzzing)
	fuzz
	;;
coverage)
	cov
	;;
regress-only)
	log "Regression only mode finished."
	;;
esac
