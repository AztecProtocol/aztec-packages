#!/usr/bin/env bash

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(cache_content_hash .)

function build {
  echo_header "constants-codegen build"
  npm_install_deps
  yarn build
}

function test_cmds {
  echo "$hash cd protocol/constants-codegen && node --test dest/*.test.js"
}

function test {
  echo_header "constants-codegen test"
  test_cmds | filter_test_cmds | parallelize
}

case "$cmd" in
  "")
    build
    ;;
  hash)
    echo "$hash"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
