#!/usr/bin/env bash

umask 000

main_fuzzer="./build-fuzzing/bin"
post_fuzzer="./build-fuzzing-asan/bin"
cov_fuzzer="./build-fuzzing-cov/bin"

workdir="/home/fuzzer"

CRASHES="$workdir/crash-reports"
[[ -d "$CRASHES" ]] ||  mkdir "$CRASHES" 2> /dev/null
UNSORTED_CRASHES="$CRASHES/unsorted"
[[ -d "$UNSORTED_CRASHES" ]] || mkdir "$UNSORTED_CRASHES" 2> /dev/null

CORPUS="$workdir/corpus"
[[ -d "$CORPUS" ]] || mkdir "$CORPUS" 2> /dev/null

OUTPUT="$workdir/output"
[[ -d "$OUTPUT" ]] || mkdir "$OUTPUT" 2> /dev/null

COVERAGE="$workdir/coverage"
[[ -d "$COVERAGE" ]] || mkdir "$COVERAGE" 2> /dev/null

RAWCOV="$COVERAGE/raw"
[[ -d "$RAWCOV" ]] || mkdir "$RAWCOV" 2> /dev/null

fuzzer=''
verbosity='0'
timeout='2592000' # 1 month
mode='fuzzing'
jobs_='4'
workers='0'

show_fuzzers() {
    echo "The following fuzzers are available:"
    echo
    if compgen -G "$main_fuzzer/*"* &> /dev/null; then
        for f in "$main_fuzzer/"*; do
            basename "$f";
        done;
    fi
}

show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -v, --verbose               Enable fuzzer's verbose mode (default: $timeout)"
    echo "  -f, --fuzzer <fuzzer_name>  Specify the fuzzer to use"
    echo "  -t, --timeout <timeout>     Set the maximum total time for fuzzing in seconds (default: $timeout - 1 month)"
    echo "  -j, --jobs <N>              Set the amount of processes to run (default: $jobs_)"
    echo "  -w, --workers <N>           Set the amount of subprocesses per job (default: $workers)"
    echo "  -m, --mode <mode>           Set the mode of operation (fuzzing, coverage or regress-only) (default: $mode)"
    echo "  -h, --help                  Display this help and exit"
    echo "  --show-fuzzers              Display the available fuzzers"
    echo ""
    echo "This script handles fuzzing testing with specified parameters, managing crash reports,"
    echo "and coverage testing based on the mode specified."
    echo
    show_fuzzers;
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -v|--verbose)
            verbosity='1'
            shift
            ;;
        -f|--fuzzer)
            fuzzer="$2"
            shift 2
            ;;
        --show-fuzzers)
            show_fuzzers
            exit 0;
            ;;
        -t|--timeout)
            timeout="$2"
            shift 2
            ;;
        -w|--workers)
            workers="$2"
            shift 2
            ;;
        -j|--jobs)
            jobs_="$2"
            shift 2
            ;;
        -m|--mode)
            mode="$2";
            shift 2;
            ;;
        -h|--help)
            show_help;
            exit 0;
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

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

if [ -z "${fuzzer}" ]; then
    log "No fuzzer was provided";
    show_help;
    exit 1;
elif [ ! -e "$main_fuzzer/$fuzzer" ]; then
    log "$main_fuzzer/$fuzzer does not exist";
    show_help;
    exit 1;
fi

main_fuzzer="$main_fuzzer/$fuzzer"
post_fuzzer="$post_fuzzer/$fuzzer"
cov_fuzzer="$cov_fuzzer/$fuzzer"

CRASHES="$CRASHES/$fuzzer"
[[ -d "$CRASHES" ]] || mkdir "$CRASHES"

OUTPUT="$OUTPUT/$fuzzer"
[[ -d "$OUTPUT" ]] || mkdir "$OUTPUT"

CORPUS="$CORPUS/$fuzzer"
[[ -d "$CORPUS" ]] || mkdir "$CORPUS"

COVERAGE="$COVERAGE/$fuzzer"
[[ -d "$COVERAGE" ]] || mkdir "$COVERAGE"

RAWCOV="$RAWCOV/$fuzzer"
[[ -d "$RAWCOV" ]] || mkdir "$RAWCOV"

if compgen -G "$OUTPUT/*"* &> /dev/null; then
    dirs_=("$OUTPUT/"*)
    dirnum="${#dirs_[@]}"
    OUTPUT="$OUTPUT/$dirnum"
else
    OUTPUT="$OUTPUT/0"
fi
[[ -d "$OUTPUT" ]] || mkdir "$OUTPUT"
log "Output directory is: $OUTPUT";

regress() {
    src="$1"
    log "Entering $src...";
    if compgen -G "$src/*" &> /dev/null; then
        for x in "$src"/*; do
            "$main_fuzzer" "$x" &> /dev/null;
            status=$?;
            if [[ "$status" -ne 0 ]]; then
                "$post_fuzzer" "$x" &> "$OUTPUT"/result.txt;
                cp "$x" "$OUTPUT";
                cp "$x" "$CRASHES" 2>/dev/null;
                log "Existing $x resulted in exit status $status";
                exit 1;
            fi
        done;
    log "Leaving $src..."
fi
}

log "Start regression testing"
regress "$CRASHES";
regress "$UNSORTED_CRASHES";
log "End of regression"

fuzz() {
    TMPOUT="$(mktemp -d)"
    MINDIR=""
    trap 'rm -rf "$TMPOUT" "$MINDIR" 2>/dev/null' EXIT

    [[ -d "$TMPOUT" ]] || mkdir "$TMPOUT"
    log "Start $fuzzer with: max_total_time: $timeout, $jobs_ jobs and $workers workers"
    "$main_fuzzer" -max_total_time="$timeout" -verbosity="$verbosity" -artifact_prefix="$TMPOUT/" -jobs="$jobs_" -workers="$workers"  -entropic=1 -shrink=1 -use_value_profile=1 -print_final_stats=1 "$CORPUS" &> "$TMPOUT/session.log";
    status=$?;

    log "Fuzzer stopped"

    files=("$TMPOUT"/crash-*)
    timeout_files=("$TMPOUT"/timeout-*)
    
    exit_code=0
    if [ ${#files[@]} -eq 0 ] || [ ! -e "${files[0]}" ]; then
        if [[ "$status" -ne 0 ]] && [ ! ${#timeout_files[@]} -eq "$workers" ];  then
            log "Something wrong with $fuzzer. Not related to fuzzing. Exit status: $status";
            exit_code=1;
        else
            log "No crashes occurred";
        fi
    else 
        log "Start minimization"
        for crash in "${files[@]}"; do
            crash_name=$(basename "$crash")
            log "Minimizing $crash_name: $(wc -c < $crash)B"

            MINDIR=$(mktemp -d)
            mv "$TMPOUT/$crash_name" "$MINDIR";
            "$main_fuzzer" -minimize_crash=1 -runs=10000 -artifact_prefix="$MINDIR/" "$MINDIR/$crash_name" &>> "$TMPOUT/minimize.log"

            smallest_crash=$(ls -S "$MINDIR/" | tail -n 1);
            log "Minimized  $smallest_crash: $(wc -c < $MINDIR/$smallest_crash)B"

            cp "$MINDIR/$smallest_crash" "$OUTPUT"
            "$post_fuzzer" "$MINDIR/$smallest_crash" &> "$OUTPUT/$smallest_crash"_result.txt

            mv "$MINDIR/"* "$CRASHES";
            rm -rf "$MINDIR"
        done
        exit_code=1
    fi

    log "Minimizing the corpus of size $(find "$CORPUS" -type f | wc -l)...";
    MINCORP="$TMPOUT/corpus";
    [[ -d $MINCORP ]] || mkdir "$MINCORP";

    "$main_fuzzer" -merge=1 -jobs="$jobs_" -workers="$workers" "$MINCORP" "$CORPUS" 
    rm -rf "$CORPUS"
    mv "$MINCORP" "$CORPUS"
    log "Minimized the corpus to size $(find "$CORPUS" -type f | wc -l)";

    cp -r fuzz-*.log "$OUTPUT";

    mv "$TMPOUT/"* "$OUTPUT";
    rmdir "$TMPOUT"
    exit "$exit_code"
}

cov() {
    TMPOUT="$(mktemp -d)"
    trap 'rm -rf "$TMPOUT" 2>/dev/null' EXIT

    TS=$(date +%Y%m%dT%H%M%S)
    LLVM_PROFILE_FILE="$RAWCOV/${TS}-%p.profraw" "$cov_fuzzer" -merge=1 "$TMPOUT" "$CORPUS/"

    llvm-profdata-18 merge -sparse "$RAWCOV/"*.profraw -o "$COVERAGE/fuzz.profdata"

    llvm-cov-18 show "$cov_fuzzer"                               \
        -instr-profile="$COVERAGE/fuzz.profdata" \
        -format=html                                             \
        -output-dir="$COVERAGE/cov-html"                         \
        -show-line-counts-or-regions                             \
        --show-branches=percent                                  \
        --show-directory-coverage
}

case "$mode" in
    fuzzing)
        fuzz;
        ;;
    coverage)
        cov;
        ;;
    regress-only)
        log "Regression only mode finished.";
        ;;
esac
