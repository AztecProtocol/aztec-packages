#!/usr/bin/env bash
set -eu
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
# Use ci3 script base.
cd $(dirname $0)

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

$ci3/github/group "noir-protocol-circuits build"
yarn
node ./scripts/generate_variants.js

export RAYON_NUM_THREADS=16
export HARDWARE_CONCURRENCY=16

echo "Compiling noir-protocol-circuits with $RAYON_NUM_THREADS threads..."
NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
$NARGO compile --silence-warnings
$ci3/github/endgroup