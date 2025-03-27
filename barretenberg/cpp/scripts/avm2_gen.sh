#!/usr/bin/env bash
current_dir="$(dirname "$(readlink -f "$0")")"
$current_dir/../../../bb-pilcom/target/release/bb_pil \
    $current_dir/../pil/vm2/execution.pil --name Avm2 \
    -y -o $current_dir/../src/barretenberg/vm2/generated \
    && $current_dir/../format.sh changed \