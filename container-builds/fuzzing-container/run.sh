#!/usr/bin/env bash

fuzzer=''
verbosity='0'
timeout='2592000' # 1 month
mode='fuzzing'
cpus='8'
mem="16G"
jobs_="$cpus"
workers='0'


show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -v, --verbose               Enable fuzzer's verbose mode (default: $verbosity)"
    echo "  -f, --fuzzer <fuzzer_name>  Specify the fuzzer to use (current: $fuzzer)"
    echo "  -t, --timeout <timeout>     Set the maximum total time for fuzzing in seconds (default: $timeout - 1 month)"
    echo "  -c, --cpus <cpus>           Set the amount of CPUs for container to use (default: $cpus)"
    echo "  --mem <memory>              Set the amount of memory for container to use (default: $mem)"
    echo "  -m, --mode <mode>           Set the mode of operation (fuzzing or coverage) (default: $mode)"
    echo "  -j, --jobs <N>              Set the amount of processes to run (default: $jobs_)"
    echo "  -w, --workers <N>           Set the amount of subprocesses per job (default: $workers)"
    echo "  -m, --mode <mode>           Set the mode of operation (fuzzing, coverage or regress-only) (default: $mode)"
    echo "  -h, --help                  Display this help and exit"
    echo "  --show-fuzzers              Display the available fuzzers"
    echo ""
    echo "This script handles fuzzing testing with specified parameters, managing crash reports,"
    echo "and coverage testing based on the mode specified."
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
            mode="show-fuzzers"
            shift
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
        -c|--cpus)
            cpus="$2";
            shift 2;
            ;;
        --mem)
            mem="$2"
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

image_name=barretenberg-fuzzer

docker build src/ -t "$image_name":latest
if [[ $? -ne 0 ]]; then
    exit 1;
fi

if [[ "$mode" == "show-fuzzers" ]]; then
    docker run -it --rm                                      \
        --entrypoint "./entrypoint.sh"                       \
        "$image_name"                                        \
        --show-fuzzers                                        
    exit 0;
fi

if [ -z "${fuzzer}" ]; then
    echo "err: No fuzzer was provided";
    echo
    show_help
    exit 1;
fi

[[ -d crash-reports ]] || mkdir crash-reports;
[[ -d crash-reports/unsorted ]] || mkdir crash-reports/unsorted;
[[ -d output ]] || mkdir output;
[[ -d corpus ]] || mkdir corpus;
[[ -d coverage ]] || mkdir coverage;

if [[ $verbosity == '1' ]]; then
    docker run -it --rm                                         \
        --user root                                             \
        -v "$(pwd)/crash-reports:/home/fuzzer/crash-reports:rw" \
        -v "$(pwd)/output:/home/fuzzer/output:rw"               \
        -v "$(pwd)/corpus:/home/fuzzer/corpus:rw"               \
        --cpus="$cpus"                                          \
        -m "$mem"                                               \
        --entrypoint "./entrypoint.sh"                          \
        "$image_name"                                           \
        --verbose                                               \
        --fuzzer "$fuzzer"                                      \
        --mode "$mode"                                          \
        --timeout "$timeout"                                    \
        --workers "$workers"                                    \
        --jobs "$jobs_"
else
    docker run -it --rm                                         \
        --user root                                             \
        -v "$(pwd)/crash-reports:/home/fuzzer/crash-reports"    \
        -v "$(pwd)/output:/home/fuzzer/output"                  \
        -v "$(pwd)/corpus:/home/fuzzer/corpus:rw"               \
        --cpus="$cpus"                                          \
        -m "$mem"                                               \
        --entrypoint "./entrypoint.sh"                          \
        "$image_name"                                           \
        --fuzzer "$fuzzer"                                      \
        --mode "$mode"                                          \
        --timeout "$timeout"                                    \
        --workers "$workers"                                    \
        --jobs "$jobs_"
fi
