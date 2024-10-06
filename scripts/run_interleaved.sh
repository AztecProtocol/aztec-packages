#!/bin/bash
set -eu

# Usage: run_bg_args.sh <main command> <background commands>...
# Runs interleaved commands, with the prefix being the command string passed for each line of input
# *Finishes when the main command exits.*

# Check if at least two commands are provided (otherwise what is the point)
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <main-command> <background commands>..."
    exit 1
fi

# Function to run a command and prefix the output
function run_command() {
    local cmd="$1"
    while IFS= read -r line; do
        echo "[$cmd] $line"
    done < <($cmd)
}

# Run each command in the background, piping output through the run_command function
for cmd in "$@"; do
    run_command "$cmd" &
done

# Wait for the first command to finish and capture its exit code
wait ${pids[0]}
first_exit_code=$?

# Kill any remaining background jobs if first command succeeded
for pid in "${pids[@]:1}"; do
    kill "$pid" 2>/dev/null || true
done

# Exit with the same code as the first command
exit $first_exit_code
