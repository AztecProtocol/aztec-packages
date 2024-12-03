#!/bin/bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

export TRANSPILER=$PWD/../avm-transpiler/target/release/avm-transpiler
export BB=$PWD/../barretenberg/cpp/build/bin/bb
export NARGO=$PWD/../noir/noir-repo/target/release/nargo
export AZTEC_NARGO=$PWD/../aztec-nargo/compile_then_postprocess.sh
export AZTEC_BUILDER=$PWD/../yarn-project/builder/aztec-builder-dest

HASH=$($ci3/cache/content_hash ../noir/.rebuild_patterns* \
  ../noir-projects/.rebuild_patterns \
  ../{avm-transpiler,l1-contracts,yarn-project}/.rebuild_patterns \
  ../barretenberg/*/.rebuild_patterns)

denoise "yarn && yarn build"
if $ci3/cache/should_run "boxes-test-$HASH"; then
  parallel --timeout 5m --verbose --halt now,fail=1 \
      BOX={} docker compose -p {} up --exit-code-from=boxes --force-recreate ::: vanilla react
fi