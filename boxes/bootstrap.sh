#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export TRANSPILER=$PWD/../avm-transpiler/target/release/avm-transpiler
export BB=$PWD/../barretenberg/cpp/build/bin/bb
export NARGO=$PWD/../noir/noir-repo/target/release/nargo
export AZTEC_NARGO=$PWD/../aztec-nargo/compile_then_postprocess.sh
export AZTEC_BUILDER=$PWD/../yarn-project/builder/aztec-builder-dest

hash=$(cache_content_hash \
  .rebuild_patterns \
  ../noir/.rebuild_patterns \
  ../{avm-transpiler,noir-projects,l1-contracts,yarn-project}/.rebuild_patterns \
  ../barretenberg/*/.rebuild_patterns)

function build {
  github_group "boxes build"
  if ! cache_download boxes-$hash.tar.gz; then
    denoise 'yarn && echo "Building... " && yarn build'
    cache_upload boxes-$hash.tar.gz boxes/*/{artifacts,dist,src/contracts/target}
  else
    denoise yarn
  fi
  github_endgroup
}

function test {
  github_group "boxes test"
  test_cmds | parallelise
  github_endgroup
}

function test_cmds {
  for browser in chromium webkit; do
    for box in vanilla react; do
      echo "$hash boxes/scripts/run_test.sh $box $browser"
    done
  done
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
