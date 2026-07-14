#!/usr/bin/env bash

set -eu

repo_root=$(git rev-parse --show-toplevel)
codegen_dir="$repo_root/protocol/constants-codegen"
cpp_output="$repo_root/barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp"

yarn --cwd "$codegen_dir" install --immutable
yarn --cwd "$codegen_dir" build
node "$codegen_dir/dest/cli.js" \
  --input "$repo_root/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr" \
  --typescript "$repo_root/yarn-project/constants/src/constants.gen.ts" \
  --cpp "$cpp_output" \
  --pil "$repo_root/barretenberg/cpp/pil/vm2/constants_gen.pil" \
  --solidity "$repo_root/l1-contracts/src/core/libraries/ConstantsGen.sol"

clang-format-20 -i "$cpp_output"
(cd "$repo_root/l1-contracts" && forge fmt)
