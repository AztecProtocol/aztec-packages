#!/bin/bash
set -eu

cd $(dirname $0)

export TRANSPILER=$PWD/../avm-transpiler/target/release/avm-transpiler
export BB=$PWD/../barretenberg/cpp/build/bin/bb
export NARGO=$PWD/../noir/noir-repo/target/release/nargo
export AZTEC_NARGO=$PWD/../aztec-nargo/compile_then_postprocess.sh
export AZTEC_BUILDER=$PWD/../yarn-project/builder/aztec-builder-dest

# yarn build

if [ "${CI:-0}" -eq 1 ]; then
  parallel --timeout 5m --verbose \
      BOX={} docker compose -p {} up --exit-code-from=boxes --force-recreate ::: vanilla react
fi