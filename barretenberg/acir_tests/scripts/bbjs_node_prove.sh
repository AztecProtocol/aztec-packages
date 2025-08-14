#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ../acir_tests/$1

# NOTE The bb.js main file is deprecated!
flags="${VERBOSE:+-v}"
bbjs_bin="../../../ts/dest/node/main.js"

mkdir -p output-$$
trap "rm -rf output-$$" EXIT

# Generate VK
node $bbjs_bin write_vk_ultra_honk $flags -b target/program.json -o output-$$/vk

# Prove
node $bbjs_bin prove_ultra_honk -o output-$$/proof $flags -b target/program.json -k output-$$/vk

# Verify
node $bbjs_bin verify_ultra_honk $flags \
    -k output-$$/vk \
    -p output-$$/proof
