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

HASH=$($ci3/cache/content_hash .rebuild_patterns)
ARTIFACT=l1-contracts-$HASH.tar.gz
TEST_FLAG=l1-contracts-test-$HASH

if ! $ci3/cache/download $ARTIFACT; then
  $ci3/github/group "l1-contracts build"
  # Clean
  rm -rf broadcast cache out serve

  # Install
  forge install --no-commit

  # Ensure libraries are at the correct version
  git submodule update --init --recursive ./lib

  # Compile contracts
  forge build

  $ci3/cache/upload $ARTIFACT out
  $ci3/github/endgroup
fi

if $ci3/base/is_test && $ci3/cache/should_run $TEST_FLAG; then
  $ci3/github/group "l1-contracts test"
  forge test --no-match-contract UniswapPortalTest
  $ci3/cache/upload_flag $TEST_FLAG
  $ci3/github/endgroup
fi