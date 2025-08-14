#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ../acir_tests/$1

# Build base flags for ultra_honk_deprecated system
flags="${VERBOSE:+-v}"
bbjs_bin="../../ts/dest/node/main.js"
sys_dep=_ultra_honk

mkdir -p output-$$
trap "rm -rf output-$$" EXIT

# Generate VK
node $bbjs_bin write_vk$sys_dep $flags -b target/program.json -o output-$$/vk

# Prove
node $bbjs_bin prove$sys_dep -o output-$$/proof $flags -b target/program.json -k output-$$/vk

# Verify
node $bbjs_bin verify$sys_dep $flags \
    -k output-$$/vk \
    -p output-$$/proof
