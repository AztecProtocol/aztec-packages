#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

echo "Postprocessing contracts..."
BB_HASH=${BB_HASH:-$(cd ../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo Using BB hash $BB_HASH

function process() {
  tempDir=$(mktemp -d)
  node ./scripts/postprocess_contract.js $1 $tempDir
}
export BB_HASH
export -f process

parallel -v --line-buffer --tag --halt now,fail=1 process {} ::: ./target/*.json