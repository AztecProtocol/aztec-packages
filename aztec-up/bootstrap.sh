#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(cache_content_hash ^aztec-up/)

function build_dind_image {
  docker build -t aztecprotocol/dind .
}

function test_cmds {
  echo "$hash aztec-up/scripts/run_test.sh basic_install"
  echo "$hash aztec-up/scripts/run_test.sh counter_contract"
}

function test {
  echo_header "aztec-up test"
  test_cmds | parallelise
}

case "$cmd" in
  ""|"full")
    build_dind_image
    ;;
  "test-cmds")
    test_cmds
    ;;
  "test")
    test
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
