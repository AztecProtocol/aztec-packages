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

function test {
  local test_flag=l1-contracts-test-$hash
  if test_should_run $test_flag; then
    github_group "l1-contracts test"
    forge test --no-match-contract UniswapPortalTest
    cache_upload_flag $test_flag
    github_endgroup
  fi
}
export -f test

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full")
    build
    ;;
  "test")
    test
    ;;
  "ci")
    build
    denoise test
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac