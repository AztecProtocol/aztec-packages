#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

export HARDWARE_CONCURRENCY=8

cd ../acir_tests/$1

# NOTE The bb.js main file is deprecated!
bbjs_bin="../../../ts/bb.js/dest/node/main.js"

output_dir=$(mktemp -d ./output-XXXXXX)
trap "rm -rf $output_dir" EXIT

# Generate VK
node $bbjs_bin write_vk_ultra_honk -v -b target/program.json -o $output_dir/vk

# Prove
node $bbjs_bin prove_ultra_honk -o $output_dir/proof -v -b target/program.json -k $output_dir/vk

# Verify
node $bbjs_bin verify_ultra_honk -v \
    -k $output_dir/vk \
    -p $output_dir/proof
