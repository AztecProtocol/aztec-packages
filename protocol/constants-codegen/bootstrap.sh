#!/usr/bin/env bash

"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap


# Tests and in-repo generation (remake-constants.sh) run src/*.ts directly via node's built-in type stripping.
# tsc only exists to emit the published npm artifact: node refuses to strip types under node_modules, so the package
# must ship compiled JS. The build step validates that publish path.
# Builds unconditionally: the constants-codegen make step restores dest/ and inputs/ from the cache instead.
function build_package {
  echo_header "constants-codegen build"
  npm_install_deps
  yarn build
}

# Through make, so the build is restored from the cache when it can be.
function build {
  make -C "$root" constants-codegen
}

# Keyed by the constants-codegen-tests make step ($STEP_KEY).
function test_cmds {
  local prefix=${STEP_KEY:-disabled-cache}
  echo "$prefix cd protocol/constants-codegen && node --test src/*.test.ts"
  echo "$prefix cd protocol/constants-codegen && ./scripts/test-package.sh"
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
  *)
    default_cmd_handler "$@"
    ;;
esac
