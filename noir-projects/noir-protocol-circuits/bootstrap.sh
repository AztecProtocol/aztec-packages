#!/usr/bin/env bash
set -eu
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x
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

yarn
node ./scripts/generate_variants.js

export RAYON_NUM_THREADS=32
export HARDWARE_CONCURRENCY=16

echo "Compiling noir-protocol-circuits with $RAYON_NUM_THREADS threads..."
NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
$NARGO compile --silence-warnings

export BB_HASH=${BB_HASH:-$(cd ../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo Using BB hash $BB_HASH
mkdir -p "./target/keys"

JOBS=$(($(nproc) / HARDWARE_CONCURRENCY))

find target -maxdepth 1 -name "*.json" ! -name "*_simulated_*" | \
  parallel -j$JOBS --line-buffer --tag --memfree 500M node ../scripts/generate_vk_json.js {} ./target/keys
