#!/usr/bin/env bash

umask 000

main_fuzzer="./build-fuzzing/bin"
post_fuzzer="./build-fuzzing-asan/bin"

workdir="/home/fuzzer"

CRASHES="$workdir/crash-reports"
[[ -d "$CRASHES" ]] ||  mkdir "$CRASHES" 2> /dev/null

OUTPUT="$workdir/output"
[[ -d "$OUTPUT" ]] || mkdir "$OUTPUT" 2> /dev/null

fuzzer=''
verbosity='0'
timeout='2592000' # 1 month
mode='fuzzing'

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
    echo "  -m, --mode <mode>           Set the mode of operation (fuzzing or coverage) (default: $mode)"
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

if [ -z "${fuzzer}" ]; then
    echo "No fuzzer was provided";
    echo;
    show_help;
    exit 1;
elif [ ! -e "$main_fuzzer/$fuzzer" ]; then
    echo "$main_fuzzer/$fuzzer does not exist";
    echo;
    show_help;
    exit 1;
fi

main_fuzzer="$main_fuzzer/$fuzzer"
post_fuzzer="$post_fuzzer/$fuzzer"

CRASHES="$CRASHES/$fuzzer"
[[ -d "$CRASHES" ]] || mkdir "$CRASHES"

OUTPUT="$OUTPUT/$fuzzer"
[[ -d "$OUTPUT" ]] || mkdir "$OUTPUT"

if compgen -G "$OUTPUT/*"* &> /dev/null; then
    dirs_=("$OUTPUT/"*)
    dirnum="${#dirs_[@]}"
    OUTPUT="$OUTPUT/$dirnum"
else
    OUTPUT="$OUTPUT/0"
fi
[[ -d "$OUTPUT" ]] || mkdir "$OUTPUT"
printf "Output directory is: %s\n" "$OUTPUT";

# Test on the existing crashes
if compgen -G "$CRASHES/*" &> /dev/null; then
    for x in "$CRASHES"/*; do
        "$post_fuzzer" "$x" &> /dev/null;
        status=$?;
        if [[ "$status" -ne 0 ]]; then
            "$post_fuzzer" "$x" &> "$OUTPUT"/result.txt;
            printf "Existing %s resulted in exit status %d\n" "$x" "$status";
            exit 1;
        fi
    done;
fi

fuzz() {
    TMPOUT="$(mktemp -d)"
    [[ -d "$TMPOUT" ]] || mkdir "$TMPOUT"
    echo "Start $fuzzer with: max_total_time: $timeout, 4 workers and 4 jobs"
    "$main_fuzzer" -max_total_time="$timeout" -verbosity="$verbosity" -artifact_prefix="$TMPOUT/" -workers=4 -jobs=4 -entropic=1 -shrink=1 -use_value_profile=1 -print_final_stats=1 &> "$TMPOUT/session.log";
    echo "Fuzzer stopped"

    files=("$TMPOUT"/crash-*)
    if [ ${#files[@]} -eq 0 ] || [ ! -e "${files[0]}" ]; then
        echo "No crashes occured";
    else 
        echo "Start minimization"
        for crash in "${files[@]}"; do
            crash_name=$(basename "$crash")
            echo "Minimizing $crash_name: $(wc -c $crash | awk '{print $1}')B"

            MINDIR=$(mktemp -d)
            mv "$TMPOUT/$crash_name" "$MINDIR";
            "$main_fuzzer" -minimize_crash=1 -runs=10000 -artifact_prefix="$MINDIR/" "$MINDIR/$crash_name" &>> "$TMPOUT/minimize.log"

            smallest_crash=$(ls -S "$MINDIR/" | tail -n 1);
            echo "Minimized  $smallest_crash: $(wc -c $MINDIR/$smallest_crash | awk '{print $1}')B"

            cp "$MINDIR/$smallest_crash" "$OUTPUT"
            "$post_fuzzer" "$MINDIR/$smallest_crash" &> "$OUTPUT/$smallest_crash"_result.txt

            mv "$MINDIR/"* "$CRASHES";
            rm -rf "$MINDIR"
        done
    fi
    mv "$TMPOUT/"* "$OUTPUT";
    rmdir "$TMPOUT"
}

cov() {
    "$main_fuzzer" -print_funcs=2000 -verbosity=0 -timeout=120 &> "$OUTPUT/cov";
}

case "$mode" in
    fuzzing)
        fuzz;
        ;;
    coverage)
        cov;
        ;;
esac
