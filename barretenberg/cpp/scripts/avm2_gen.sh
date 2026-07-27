#!/usr/bin/env bash
current_dir="$(dirname "$(readlink -f "$0")")"
cd $current_dir/../

repo_root=$(git rev-parse --show-toplevel)
node "$repo_root/protocol/constants-codegen/src/cli.ts" --pil pil/vm2/constants_gen.pil

../../bb-pilcom/target/release/bb_pil pil/vm2/tx.pil \
    --name Avm2 -y -o src/barretenberg/vm2/generated \
    && ./format.sh changed
