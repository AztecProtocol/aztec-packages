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

# Attempt to just pull artefacts from CI and exit on success.
[ -n "${USE_CACHE:-}" ] && ./bootstrap_cache.sh && exit

# g="\033[32m"  # Green
# b="\033[34m"  # Blue
# r="\033[0m"   # Reset

yarn

parallel --line-buffer --tag {} ::: \
  ./noir-contracts/bootstrap.sh \
  ./noir-protocol-circuits/bootstrap.sh \
  ./mock-protocol-circuits/bootstrap.sh

if [ "${CI:-0}" -eq 1 ]; then
  NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
  (cd ./noir-protocol-circuits && node ./scripts/generate_variants.js && $NARGO fmt --check && $NARGO test --silence-warnings)
  (cd ./mock-protocol-circuits && $NARGO fmt --check)
  (cd ./noir-contracts && $NARGO fmt --check)
  (cd ./aztec-nr && $NARGO fmt --check)
  # Testing aztec.nr/contracts requires TXE, so must be pushed to after the final yarn project build.
fi