#!/usr/bin/env bash

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(cache_content_hash .)

# Tests and in-repo generation (remake-constants.sh) run src/*.ts directly via node's built-in type stripping.
# tsc only exists to emit the published npm artifact: node refuses to strip types under node_modules, so the package
# must ship compiled JS. The build step validates that publish path.
function build {
  echo_header "constants-codegen build"
  npm_install_deps
  yarn build
}

function test_cmds {
  echo "$hash cd protocol/constants-codegen && node --test src/*.test.ts && ./scripts/test-package.sh"
}

function test {
  echo_header "constants-codegen test"
  test_cmds | filter_test_cmds | parallelize
}

function release {
  npm_install_deps
  retry "deploy_npm ${REF_NAME#v}"
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
