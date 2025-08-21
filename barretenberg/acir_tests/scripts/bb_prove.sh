#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

export HARDWARE_CONCURRENCY=8

cd ../acir_tests/$1

bb=$(../../../cpp/scripts/find-bb)

shift
# Base flags + our commandline args
flags="-v --scheme ultra_honk $*"

mkdir -p output-$$
trap "rm -rf output-$$" EXIT

# Generate VK
$bb write_vk $flags -b target/program.json -o output-$$

# Prove
$bb prove $flags -b target/program.json -k output-$$/vk -o output-$$

# Verify
$bb verify $flags \
    -k output-$$/vk \
    -p output-$$/proof \
    -i output-$$/public_inputs
