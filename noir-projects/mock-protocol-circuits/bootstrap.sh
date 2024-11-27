#!/usr/bin/env bash
set -eu
[ -n "${CI3_DEBUG:-}" ] && set -x # conditionally trace

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

export RAYON_NUM_THREADS=16
export HARDWARE_CONCURRENCY=16

NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
$NARGO compile --silence-warnings

export BB_HASH=${BB_HASH:-$(cd ../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo Using BB hash $BB_HASH
mkdir -p "./target/keys"

parallel --line-buffer --tag node ../scripts/generate_vk_json.js {} "./target/keys" ::: ./target/*.json