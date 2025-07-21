#!/usr/bin/env bash
current_dir="$(dirname "$(readlink -f "$0")")"
cd $current_dir/../
../../bb-pilcom/target/release/bb_pil pil/vm2/tx.pil \
    --name Avm2 -y -o src/barretenberg/vm2/generated \
    && ./format.sh changed
