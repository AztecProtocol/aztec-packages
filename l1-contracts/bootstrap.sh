#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export hash=$(cache_content_hash .rebuild_patterns)

function build {
  github_group "l1-contracts build"
  local artifact=l1-contracts-$hash.tar.gz
  if ! cache_download $artifact; then
    # Clean
    rm -rf broadcast cache out serve

    # Install
    forge install --no-commit

    # Ensure libraries are at the correct version
    git submodule update --init --recursive ./lib

    # Compile contracts
    forge build

    cache_upload $artifact out
  fi
  github_endgroup
}

function test_cmds {
  test_should_run l1-contracts-test-$hash || return 0
  echo "cd l1-contracts && forge test --no-match-contract UniswapPortalTest"
}

function test {
  set -eu
  local test_flag=l1-contracts-test-$hash
  test_should_run $test_flag || return 0

  github_group "l1-contracts test"
  solhint --config ./.solhint.json "src/**/*.sol"
  forge fmt --check
  forge test --no-match-contract UniswapPortalTest
  cache_upload_flag $test_flag
  github_endgroup
}
export -f test

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full"|"ci")
    build
    ;;
  "test")
    test
    ;;
  "test-cmds")
    test_cmds
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac