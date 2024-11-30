#!/bin/bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

export TRANSPILER=$PWD/../avm-transpiler/target/release/avm-transpiler
export BB=$PWD/../barretenberg/cpp/build/bin/bb
export NARGO=$PWD/../noir/noir-repo/target/release/nargo
export AZTEC_NARGO=$PWD/../aztec-nargo/compile_then_postprocess.sh
export AZTEC_BUILDER=$PWD/../yarn-project/builder/aztec-builder-dest

# yarn build
if ! [ "${TEST:-0}" -eq 0 ] && ([ "${CI:-0}" -eq 1 ] || [ "${TEST:-0}" -eq 1 ]); then
  parallel --timeout 5m --verbose \
      BOX={} docker compose -p {} up --exit-code-from=boxes --force-recreate ::: vanilla react
fi