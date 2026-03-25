#!/usr/bin/env bash
current_dir="$(dirname "$(readlink -f "$0")")"
cd $current_dir/../
BATCH_SIZE=${AVM_BATCH_SIZE:-1}
../../bb-pilcom/target/release/bb_pil pil/vm2/tx.pil \
    --name Avm2 -y -o src/barretenberg/vm2/generated \
    --batch-size "$BATCH_SIZE" \
    && ./format.sh changed
