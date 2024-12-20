#!/bin/bash
set -eu
# propagate errors inside while loop pipe
set -o pipefail

# Usage: run_interleaved.sh <main command> <background commands>...
# Runs commands in parallel, with interleaved output. See ci3/tmux_split for another approach.
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

FINISHED=false
main_cmd="$1"
shift

function cleanup() {
  # kill everything in our process group except our process
  trap - SIGTERM && kill $(pgrep -g $$ | grep -v $$) $(jobs -p) &>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

# Function to run a command and prefix the output with color
function run_command() {
  local cmd="$1"
  # Take first 3 parts of command to display inline
  local cmd_prefix=$(echo "$cmd" | awk '{print $1" "$2" "$3}')
  local color="$2"
  $cmd 2>&1 | while IFS= read -r line; do
    echo -e "${color}[$cmd_prefix]\e[0m $line"
  done
}

# Run background commands without logging output
i=0
for cmd in "$@"; do
  (run_command "$cmd" "${colors[$((i % ${#colors[@]}))]}" || [ $FINISHED = true ] || (echo "$cmd causing terminate" && kill 0) ) &
  ((i++)) || true # annoyingly considered a failure based on result
done

# Run the main command synchronously, piping output through the run_command function with green color
run_command "$main_cmd" "\e[32m" || (echo "$main_cmd causing terminate" && kill 0)
FINISHED=true