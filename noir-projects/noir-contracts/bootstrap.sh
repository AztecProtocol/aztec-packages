#!/usr/bin/env bash
set -eu
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x
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

echo "Compiling contracts..."
NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
$NARGO compile --silence-warnings --inliner-aggressiveness 0

echo "Transpiling contracts..."
TRANSPILER=${TRANSPILER:-../../avm-transpiler/target/release/avm-transpiler}
ls target/*.json | parallel "$TRANSPILER {} {}"

echo "Postprocessing contracts..."
BB_HASH=${BB_HASH:-$(cd ../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo Using BB hash $BB_HASH
tempDir="./target/tmp"
mkdir -p $tempDir

parallel --line-buffer --tag BB_HASH=$BB_HASH node ./scripts/postprocess_contract.js {} $tempDir ::: ./target/*.json
