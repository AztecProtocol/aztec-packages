#!/usr/bin/env bash
set -eu
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source

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

HASH=$(cache_content_hash .rebuild_patterns)
ARTIFACT=l1-contracts-$HASH.tar.gz
TEST_FLAG=l1-contracts-test-$HASH

github_group "l1-contracts build"
if ! cache_download $ARTIFACT; then
  # Clean
  rm -rf broadcast cache out serve

  # Install
  forge install --no-commit

  # Ensure libraries are at the correct version
  git submodule update --init --recursive ./lib

  # Compile contracts
  forge build

  cache_upload $ARTIFACT out
fi
github_endgroup

if test_should_run $TEST_FLAG; then
  github_group "l1-contracts test"
  forge test --no-match-contract UniswapPortalTest
  cache_upload_flag $TEST_FLAG
  github_endgroup
fi