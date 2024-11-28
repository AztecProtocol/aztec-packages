#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

echo "Postprocessing contracts..."
BB_HASH=${BB_HASH:-$(cd ../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo Using BB hash $BB_HASH
tempDir="./target/tmp"
mkdir -p $tempDir

parallel --line-buffer --tag BB_HASH=$BB_HASH node ./scripts/postprocess_contract.js {} $tempDir ::: ./target/*.json