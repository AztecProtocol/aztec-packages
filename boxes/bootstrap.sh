#!/bin/bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

export TRANSPILER=$PWD/../avm-transpiler/target/release/avm-transpiler
export BB=$PWD/../barretenberg/cpp/build/bin/bb
export NARGO=$PWD/../noir/noir-repo/target/release/nargo
export AZTEC_NARGO=$PWD/../aztec-nargo/compile_then_postprocess.sh
export AZTEC_BUILDER=$PWD/../yarn-project/builder/aztec-builder-dest

denoise "yarn && yarn build"

if $ci3/base/is_test; then
  parallel --timeout 5m --verbose --halt now,fail=1 \
      BOX={} docker compose -p {} up --exit-code-from=boxes --force-recreate ::: vanilla react
fi