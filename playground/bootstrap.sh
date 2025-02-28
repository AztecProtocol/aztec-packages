#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(cache_content_hash \
  .rebuild_patterns \
  ../noir/.rebuild_patterns \
  ../{avm-transpiler,noir-projects,l1-contracts,yarn-project}/.rebuild_patterns \
  ../barretenberg/*/.rebuild_patterns)

function build {
  echo_header "playground build"
  denoise yarn

  if ! cache_download playground-$hash.tar.gz; then
    denoise 'yarn build'
    cache_upload playground-$hash.tar.gz $(git ls-files --others --ignored --exclude-standard | grep -v '^node_modules/')
  fi
}

function test {
  echo_header "playground test"
  test_cmds | filter_test_cmds | parallelise
}

function test_cmds {
  for browser in chromium webkit firefox; do
    echo "$hash playground/scripts/run_test.sh $browser"
  done
}

function release {
  echo_header "docs release"
  if [ ${DRY_RUN:-0} = 1 ]; then
    echo "Dry run, doing docs preview:"
    yarn netlify deploy --site aztec-playground
  else
    yarn netlify deploy --site aztec-playground --prod
  fi
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
