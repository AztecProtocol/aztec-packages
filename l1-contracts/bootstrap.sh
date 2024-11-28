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

# Attempt to just pull artefacts from CI and elide the build on success.
[ -n "${USE_CACHE:-}" ] && ./bootstrap_cache.sh && SKIP_BUILD=1

if [ -"${SKIP_BUILD:-}" -eq 1 ] ; then
  $ci3/github/group "l1-contracts build"
  # Clean
  rm -rf broadcast cache out serve

  # Install
  forge install --no-commit

  # Ensure libraries are at the correct version
  git submodule update --init --recursive ./lib

  # Compile contracts
  forge build

  $ci3/cache/upload l1-contracts-$HASH.tar.gz out
  $ci3/github/endgroup
fi

if $ci3/base/is_test; then
  $ci3/github/group "l1-contracts build"
  forge test --no-match-contract UniswapPortalTest
  $ci3/github/endgroup
fi