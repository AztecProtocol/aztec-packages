#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

# Run both tasks in the background
(cd cpp && ./bootstrap_cache.sh "$@") &
pid_cpp=$!
(cd ts && ./bootstrap_cache.sh "$@") &
pid_ts=$!

# Wait for both processes and capture any non-zero exit codes
wait $pid_cpp || exit_code=$?
wait $pid_ts || exit_code=$?

# Exit with the first non-zero exit code, if any
exit ${exit_code:-0}
