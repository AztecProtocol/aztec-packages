#!/bin/bash
set -eu
# propagate errors inside while loop pipe
set -o pipefail

# Usage: run_interleaved.sh <main command> <background commands>...
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

# pattern from https://stackoverflow.com/questions/28238952/how-to-kill-a-running-bash-function-from-terminal
function cleanup() {
  kill $(jobs -p) 2>/dev/null || true
}

# Function to run a command and prefix the output with color
function run_command() {
  # pattern from https://stackoverflow.com/questions/28238952/how-to-kill-a-running-bash-function-from-terminal
  trap cleanup EXIT SIGINT SIGTERM
  local cmd="$1"
  local color="$2"
  $cmd 2>&1 | while IFS= read -r line; do
    echo -e "${color}[$cmd]\e[0m $line"
  done
}

trap cleanup EXIT SIGINT SIGTERM
# Run background commands without logging output
i=0
for cmd in "$@"; do
  run_command "$cmd" "${colors[$((i % ${#colors[@]}))]}" &
  ((i++)) || true # annoyingly considered a failure based on result
done

# Run the main command synchronously, piping output through the run_command function with green color
run_command "$main_cmd" "\e[32m"