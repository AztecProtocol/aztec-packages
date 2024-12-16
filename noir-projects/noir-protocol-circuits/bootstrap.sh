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

yarn
node ./scripts/generate_variants.js

NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
echo "Compiling protocol circuits with ${RAYON_NUM_THREADS:-1} threads"
# NOTE: --skip-brillig-constraints-check added temporarily for blobs build time
RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-1} $NARGO compile --silence-warnings --skip-brillig-constraints-check

BB_HASH=${BB_HASH:-$(cd ../../ && git ls-tree -r HEAD | grep 'barretenberg/cpp' | awk '{print $3}' | git hash-object --stdin)}
echo Using BB hash $BB_HASH
mkdir -p "./target/keys"

AVAILABLE_MEMORY=0

case "$(uname)" in
  Linux*)
    # Check available memory on Linux
    AVAILABLE_MEMORY=$(awk '/MemTotal/ { printf $2 }' /proc/meminfo)
    ;;
  *)
    echo "Parallel vk generation not supported on this operating system"
    ;;
esac
# This value may be too low.
# If vk generation fail with an amount of free memory greater than this value then it should be increased.
MIN_PARALLEL_VK_GENERATION_MEMORY=500000000
PARALLEL_VK=${PARALLEL_VK:-false}

if [[ AVAILABLE_MEMORY -gt MIN_PARALLEL_VK_GENERATION_MEMORY ]] && [[ $PARALLEL_VK == "true" ]]; then
  echo "Generating vks in parallel..."
  for pathname in "./target"/*.json; do
      if [[ $pathname != *"_simulated"* ]]; then
        BB_HASH=$BB_HASH node ../scripts/generate_vk_json.js "$pathname" "./target/keys" &
      fi
  done

  for job in $(jobs -p); do
    wait $job || exit 1
  done

else
  echo "Generating VKs sequentially..."

  for pathname in "./target"/*.json; do
    if [[ $pathname != *"_simulated"* ]]; then
      BB_HASH=$BB_HASH node ../scripts/generate_vk_json.js "$pathname" "./target/keys"
    fi
  done
fi
