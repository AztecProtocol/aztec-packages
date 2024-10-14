#!/bin/bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

# Run background commands without logging output
i=0
for cmd in "$@"; do
  ("$SCRIPT_DIR"/run_colored.sh "$cmd" "${colors[$((i % ${#colors[@]}))]}" || exit 1) &
  ((i++)) || true # annoyingly considered a failure based on result
done

# Run the main command synchronously, piping output through the run_command function with green color
"$SCRIPT_DIR"/run_colored.sh "$main_cmd" "\e[32m"