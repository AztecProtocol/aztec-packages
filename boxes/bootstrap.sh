#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export TRANSPILER=$PWD/../avm-transpiler/target/release/avm-transpiler
export BB=$PWD/../barretenberg/cpp/build/bin/bb
export NARGO=$PWD/../noir/noir-repo/target/release/nargo
export AZTEC_NARGO=$PWD/../aztec-nargo/compile_then_postprocess.sh
export AZTEC_BUILDER=$PWD/../yarn-project/builder/aztec-builder-dest

function build {
  # Moved to test for now as there was no cache here.
  return
}

function test {
  function test_box {
    BOX=$1 BROWSER=$2 denoise docker compose -p $1-$2 up --exit-code-from=boxes --force-recreate
  }
  export -f test_box

  hash=$(cache_content_hash ../noir/.rebuild_patterns* \
    ../{avm-transpiler,noir-projects,l1-contracts,yarn-project}/.rebuild_patterns \
    ../barretenberg/*/.rebuild_patterns)

  if test_should_run "boxes-test-$hash"; then
    # TODO: Move back to build and use cache.
    denoise 'yarn && echo "Building... " && yarn build'
    parallel --tag --line-buffered --timeout 5m --halt now,fail=1 test_box {1} {2} ::: vanilla react ::: chromium webkit
    cache_upload_flag boxes-test-$hash
  fi
}

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
    test
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac