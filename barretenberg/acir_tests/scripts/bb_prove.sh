#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

export HARDWARE_CONCURRENCY=8

test_name=$1
cd ../acir_tests/$test_name

bb=$(../../../cpp/scripts/find-bb)

shift
# Base flags + our commandline args
flags="-v --scheme ultra_honk $*"

mkdir -p output-$$
trap "rm -rf output-$$" EXIT

# Tests prefixed with failing_ are expected to fail.
if [[ $test_name == failing_* ]]; then
  if $bb write_vk $flags -b target/program.json -o output-$$ && \
     $bb prove $flags -b target/program.json -k output-$$/vk -o output-$$ && \
     $bb verify $flags \
       -k output-$$/vk \
       -p output-$$/proof \
       -i output-$$/public_inputs; then
    echo "ERROR: Expected test '$test_name' to fail, but it passed!"
    exit 1
  fi
else
    # Generate VK
    $bb write_vk $flags -b target/program.json -o output-$$

    # Prove
    $bb prove $flags -b target/program.json -k output-$$/vk -o output-$$

    # Verify
    $bb verify $flags \
        -k output-$$/vk \
        -p output-$$/proof \
        -i output-$$/public_inputs
fi

