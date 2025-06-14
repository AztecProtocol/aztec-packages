#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(hash_str $(cache_content_hash .rebuild_patterns) $(../yarn-project/bootstrap.sh hash))

function build {
  echo_header "testnet-sequencer-register build"
  npm_install_deps

  if ! cache_download testnet-sequencer-register-$hash.tar.gz; then
    denoise 'yarn build'
    cache_upload testnet-sequencer-register-$hash.tar.gz $(git ls-files --others --ignored --exclude-standard | grep -vE '^"?node_modules/')
  fi
}

function test {
  echo_header "testnet-sequencer-register test"
  test_cmds | filter_test_cmds | parallelise
}

function test_cmds {
  echo "TODO: not implemented"
}

function release {
  echo_header "testnet-sequencer-register release"

  echo "TODO: not implemented"
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  test|test_cmds|release)
    $cmd
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
