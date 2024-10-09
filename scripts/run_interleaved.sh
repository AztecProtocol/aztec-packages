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

# Define colors
colors=(
    "\e[33m" # Yellow
    "\e[34m" # Blue
    "\e[35m" # Magenta
    "\e[36m" # Cyan
    "\e[92m" # Bright Green
    "\e[93m" # Bright Yellow
    "\e[94m" # Bright Blue
    "\e[95m" # Bright Magenta
    "\e[96m" # Bright Cyan
    "\e[91m" # Bright Red
)

main_cmd="$1"
shift

# Function to run a command and prefix the output with color
function run_command() {
    local cmd="$1"
    local color="$2"
    while IFS= read -r line; do
        echo -e "${color}[$cmd]\e[0m $line"
    done < <($cmd 2>&1)
}

# Run the main command, piping output through the run_command function with green color
run_command "$main_cmd" "\e[32m" &
main_pid=$!

# Run background commands without logging output
declare -a bg_pids
i=0
for cmd in "$@"; do
    run_command "$cmd" "${colors[$((i % ${#colors[@]}))]}" &
    bg_pids+=($!)
    ((i++)) || true # annoyingly considered a failure based on result
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
