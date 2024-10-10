#!/bin/bash
set -eu
# propagate errors inside while loop pipe
set -o pipefail

# Usage: run_bg_args.sh <main command> <background commands>...
# Runs the main command with output logging and background commands with logging.
# Finishes when the main command exits.

# Check if at least two commands are provided
if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <main-command> <background commands>..."
  exit 1
fi

# Define colors
colors=(
    "\e[31m" # Red
    "\e[32m" # Green
    "\e[33m" # Yellow
    "\e[34m" # Blue
    "\e[35m" # Magenta
    "\e[36m" # Cyan
    "\e[37m" # White
    "\e[91m" # Bright Red
    "\e[92m" # Bright Green
    "\e[93m" # Bright Yellow
    "\e[94m" # Bright Blue
    "\e[95m" # Bright Magenta
    "\e[96m" # Bright Cyan
)

main_cmd="$1"
shift

# Function to run a command and prefix the output with color
function run_command() {
    local cmd="$1"
    local color="$2"
    while IFS= read -r line; do
        echo -e "${color}[$cmd] $line\e[0m"
    done < <($cmd 2>&1)
}

i=0

# Run the main command with its assigned color
run_command "$main_cmd" "${colors[$((i % ${#colors[@]}))]}" &
main_pid=$!
((i++))

# Run background commands with their assigned colors
declare -a bg_pids
for cmd in "$@"; do
    run_command "$cmd" "${colors[$((i % ${#colors[@]}))]}" &
    bg_pids+=($!)
    ((i++))
done

# Run the main command synchronously, piping output through the run_command function with green color
run_command "$main_cmd" "\e[32m"