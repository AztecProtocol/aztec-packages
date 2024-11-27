#!/usr/bin/env bash
set -eu
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

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

$ci3/github/group "l1-contracts build"
# Clean
rm -rf broadcast cache out serve

# Install
forge install --no-commit

# Ensure libraries are at the correct version
git submodule update --init --recursive ./lib

# Compile contracts
forge build
$ci3/github/endgroup

if [ "${CI:-0}" -eq 1 ]; then
  $ci3/github/group "l1-contracts build"
  forge test --no-match-contract UniswapPortalTest
  $ci3/github/endgroup
fi