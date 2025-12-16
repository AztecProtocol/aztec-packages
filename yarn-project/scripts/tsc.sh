#!/usr/bin/env bash
# Combines tsgo (type-checking + declaration emit) with swc (JS transpilation) in parallel.
# - tsgo -b --emitDeclarationOnly: Generates .d.ts declaration files only and performs type-checking
# - swc: Generates .js files (faster transpilation than tsc, supports decorators)
#
# Usage: ../scripts/tsc.sh [--watch]
#
# The script expects to be run from a package directory (e.g., yarn-project/foundation).

set -euo pipefail

WATCH_MODE=false
if [[ "${1:-}" == "--watch" ]] || [[ "${1:-}" == "-w" ]]; then
  WATCH_MODE=true
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
YARN_PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Run tsgo for type-checking + declarations and swc for JS transpilation in parallel
if $WATCH_MODE; then
  # In watch mode, run both in parallel
  parallel --line-buffered --tag ::: \
    "tsgo -b --emitDeclarationOnly --watch" \
    "$YARN_PROJECT_DIR/node_modules/.bin/swc src -d dest --config-file=$YARN_PROJECT_DIR/.swcrc --strip-leading-paths --watch"
else
  # In non-watch mode, run both in parallel and wait for both to complete
  # If either fails, the script will exit with an error
  parallel --halt now,fail=1 ::: \
    "tsgo -b --emitDeclarationOnly" \
    "$YARN_PROJECT_DIR/node_modules/.bin/swc src -d dest --config-file=$YARN_PROJECT_DIR/.swcrc --strip-leading-paths"
fi
