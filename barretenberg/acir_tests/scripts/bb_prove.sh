#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

export HARDWARE_CONCURRENCY=8

test_name=$1
cd ../acir_tests/$test_name

bb=$(../../../cpp/scripts/find-bb)

shift
# Base flags + our commandline args
flags="-v --scheme ultra_honk $*"

output_dir=$(mktemp -d ./output-XXXXXX)
trap "rm -rf $output_dir" EXIT

# Tests prefixed with failing_ are expected to fail.
if [[ $test_name == failing_* ]]; then
  if $bb write_vk $flags -b target/program.json -o $output_dir && \
     $bb prove $flags -b target/program.json -k $output_dir/vk -o $output_dir && \
     $bb verify $flags \
       -k $output_dir/vk \
       -p $output_dir/proof \
       -i $output_dir/public_inputs; then
    echo "ERROR: Expected test '$test_name' to fail, but it passed!"
    exit 1
  fi
else
    # Generate VK
    $bb write_vk $flags -b target/program.json -o $output_dir

    # Prove
    $bb prove $flags -b target/program.json -k $output_dir/vk -o $output_dir

    # Verify
    $bb verify $flags \
        -k $output_dir/vk \
        -p $output_dir/proof \
        -i $output_dir/public_inputs
fi

