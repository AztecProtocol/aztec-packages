#!/usr/bin/env bash
set -eu
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace

cd "$(dirname "$0")"

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

$ci3/github/group "noir-contracts build"
echo "Compiling contracts..."
NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
$NARGO compile --silence-warnings --inliner-aggressiveness 0

echo "Transpiling contracts..."
scripts/transpile.sh
$ci3/github/endgroup