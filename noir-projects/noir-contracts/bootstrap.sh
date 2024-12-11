#!/usr/bin/env bash
set -eu

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
scripts/transpile.sh

echo "Postprocessing contracts..."
BB_HASH=${BB_HASH:-$(cd ../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo Using BB hash $BB_HASH
tempDir="./target/tmp"
mkdir -p $tempDir

for artifactPath in "./target"/*.json; do
    BB_HASH=$BB_HASH node ./scripts/postprocess_contract.js "$artifactPath" "$tempDir"
done
