#!/bin/bash
set -eu

# Usage: run_bg_args.sh <main command> <background commands>...
# Runs the main command with output logging and background commands without logging.
# Finishes when the main command exits.

# Check if at least two commands are provided (otherwise what is the point)
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <main-command> <background commands>..."
    exit 1
fi

main_cmd="$1"
shift

# Function to run a command and prefix the output
function run_command() {
    local cmd="$1"
    while IFS= read -r line; do
        echo "[$cmd] $line"
    done < <($cmd 2>&1)
}

# Run the main command, piping output through the run_command function
run_command "$main_cmd" &
main_pid=$!

# Run background commands without logging output
declare -a bg_pids
for cmd in "$@"; do
    run_command "$cmd" &
    bg_pids+=($!)
done

# Wait for the main command to finish and capture its exit code
wait $main_pid
main_exit_code=$?

# Kill any remaining background jobs
for pid in "${bg_pids[@]}"; do
    kill "$pid" 2>/dev/null || true
done

# Exit with the same code as the main command
exit $main_exit_code
