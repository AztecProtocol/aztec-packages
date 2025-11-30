#!/usr/bin/env bash

# Default Configuration Variables
FUZZER=''
VERBOSITY='0'
TIMEOUT='2592000' # Default: 1 month (in seconds)
MODE='fuzzing'
ASM_ENABLED='on'
CPUS='8'
MEM="16G"
# Set default jobs equal to CPUs. Note the underscore to avoid conflict with the 'jobs' builtin.
JOBS_="$CPUS"
WORKERS='0'
IMAGE_NAME='barretenberg-fuzzer'

# --- Functions ---

# Function to display usage information.
show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -v, --verbose               Enable fuzzer's verbose output (default: $VERBOSITY)"
    echo "  -f, --fuzzer <fuzzer_name>  Specify the fuzzer to use (current: $FUZZER)"
    echo "  -t, --timeout <timeout>     Set the maximum total time for fuzzing in seconds (default: $TIMEOUT - 1 month)"
    echo "  -c, --cpus <cpus>           Set the amount of CPUs for the container to use (default: $CPUS)"
    echo "  --mem <memory>              Set the amount of memory for the container to use (default: $MEM)"
    echo "  -m, --mode <mode>           Set the mode of operation (fuzzing, coverage, or regress-only) (default: $MODE)"
    echo "  -j, --jobs <N>              Set the amount of parallel fuzzing processes to run (default: $JOBS_)"
    echo "  -w, --workers <N>           Set the amount of subprocesses per job (default: $WORKERS)"
    echo "  -a, --asm <mode>            Set the flag to enable/disable ASM instructions (on/off) (default: $ASM_ENABLED)"
    echo "  -h, --help                  Display this help and exit"
    echo "  --show-fuzzers              Display the available fuzzers"
    echo ""
    echo "This script manages fuzzing, crash reports, and coverage testing using a Docker container."
}

# Function to execute the fuzzer inside the Docker container.
run_fuzzer_container() {
    local verbose_flag=""
    if [[ "$VERBOSITY" == '1' ]]; then
        verbose_flag="--verbose"
    fi

    # Using 'root' user is required here to ensure write permissions to mounted volumes 
    # are universally granted inside the container, but generally using a less privileged 
    # user is preferred for security if permissions can be managed.
    docker run -it --rm \
        --user root \
        -v "$(pwd)/crash-reports:/home/fuzzer/crash-reports:rw" \
        -v "$(pwd)/output:/home/fuzzer/output:rw" \
        -v "$(pwd)/corpus:/home/fuzzer/corpus:rw" \
        -v "$(pwd)/coverage:/home/fuzzer/coverage:rw" \
        --cpus="$CPUS" \
        -m "$MEM" \
        --entrypoint "./entrypoint.sh" \
        "$IMAGE_NAME" \
        "$verbose_flag" \
        --fuzzer "$FUZZER" \
        --mode "$MODE" \
        --asm "$ASM_ENABLED" \
        --timeout "$TIMEOUT" \
        --workers "$WORKERS" \
        --jobs "$JOBS_"
}


# --- Argument Parsing ---

while [[ $# -gt 0 ]]; do
    case "$1" in
        -v|--verbose)
            VERBOSITY='1'
            shift
            ;;
        -f|--fuzzer)
            FUZZER="$2"
            shift 2
            ;;
        --show-fuzzers)
            MODE="show-fuzzers"
            shift
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -w|--workers)
            WORKERS="$2"
            shift 2
            ;;
        -j|--jobs)
            JOBS_="$2"
            shift 2
            ;;
        -m|--mode)
            MODE="$2"
            shift 2
            ;;
        -a|--asm)
            ASM_ENABLED="$2"
            shift 2
            ;;
        -c|--cpus)
            CPUS="$2"
            # Update JOBS_ default if CPUS is specified before JOBS_
            if [[ "$JOBS_" == "$CPUS" ]]; then
                JOBS_="$CPUS"
            fi
            shift 2
            ;;
        --mem)
            MEM="$2"
            shift 2
            ;;
        -h|--help)
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

# --- Main Execution ---

# 1. Build the Docker image.
docker build src/ -t "$IMAGE_NAME":latest
if [[ $? -ne 0 ]]; then
    echo "Error: Docker image build failed." >&2
    exit 1
fi

# 2. Handle 'show-fuzzers' mode separately (it doesn't need persistent volumes).
if [[ "$MODE" == "show-fuzzers" ]]; then
    docker run -it --rm \
        --entrypoint "./entrypoint.sh" \
        "$IMAGE_NAME" \
        --show-fuzzers
    exit 0
fi

# 3. Check for required arguments.
if [ -z "${FUZZER}" ]; then
    echo "Error: No fuzzer was provided." >&2
    echo
    show_help
    exit 1
fi

# 4. Create necessary local directories for output/state.
# The 'coverage' directory creation was missing in the original logic.
mkdir -p crash-reports/unsorted output corpus coverage

# 5. Execute the main fuzzer container function.
run_fuzzer_container
