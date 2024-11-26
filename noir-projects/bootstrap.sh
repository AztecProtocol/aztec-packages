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

# Attempt to just pull artefacts from CI and exit on success.
[ -n "${USE_CACHE:-}" ] && ./bootstrap_cache.sh && exit

# TODO: For the love of god can we stop bringing in entire node stacks for what can be done in a bash script?
GITHUB_ACTIONS="" yarn

[ -n "${GITHUB_ACTIONS:-}" ] && echo "::group::noir-projects build"
parallel --line-buffer --tag {} ::: \
  ./noir-contracts/bootstrap.sh \
  ./noir-protocol-circuits/bootstrap.sh \
  ./mock-protocol-circuits/bootstrap.sh
[ -n "${GITHUB_ACTIONS:-}" ] && echo "::endgroup::"

if [ "${CI:-0}" -eq 1 ]; then
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::group::noir-projects test"
  NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
  (cd ./noir-protocol-circuits && node ./scripts/generate_variants.js && $NARGO fmt --check && $NARGO test --silence-warnings)
  (cd ./mock-protocol-circuits && $NARGO fmt --check)
  (cd ./noir-contracts && $NARGO fmt --check)
  (cd ./aztec-nr && $NARGO fmt --check)
  # Testing aztec.nr/contracts requires TXE, so must be pushed to after the final yarn project build.
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::endgroup::"
fi