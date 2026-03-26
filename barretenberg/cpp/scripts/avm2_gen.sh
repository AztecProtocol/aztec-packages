#!/usr/bin/env bash
set -eu
current_dir="$(dirname "$(readlink -f "$0")")"
cd $current_dir/../
BATCH_SIZE=${AVM_BATCH_SIZE:-1}

# Step 1: PIL codegen (generates columns.hpp with interleaving constants)
../../bb-pilcom/target/release/bb_pil pil/vm2/tx.pil \
    --name Avm2 -y -o src/barretenberg/vm2/generated \
    --batch-size "$BATCH_SIZE"

# Step 2: Build and run VK generator (computes precomputed commitments + group commitments)
VK_OUTPUT="src/barretenberg/vm2/constraining/avm_fixed_vk.hpp"
echo "Building avm_vk_gen..."
cmake --build --preset clang20-assert --target avm_vk_gen
echo "Generating $VK_OUTPUT..."
./build/bin/avm_vk_gen "$VK_OUTPUT"

# Step 3: Format
./format.sh changed
