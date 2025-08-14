#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

test_name=$1
browser_type=$2

# Launch browser server
../../ci3/dump_fail \
  "cd browser-test-app && ../node_modules/.bin/serve -n -L -p 8080 -c ../serve.json dest" > /dev/null &
while ! nc -z localhost 8080 &>/dev/null; do sleep 1; done;

cd ../acir_tests/$test_name

# Use the browser binary for the test
browser_bin="../../headless-test/bb.js.browser"

# Build base flags for ultra_honk
flags="${VERBOSE:+-v} --scheme ultra_honk --oracle_hash ${HASH:-poseidon2}"

# Add any additional arguments (skip first two - test name and browser type)
shift 2
for arg in "$@"; do
    flags+=" $arg"
done

mkdir -p output-$$
trap "rm -rf output-$$" EXIT

# Generate VK
node $browser_bin write_vk $flags -b target/program.json -o output-$$

# Prove
node $browser_bin prove $flags -b target/program.json -k output-$$/vk -o output-$$

# Verify
node $browser_bin verify $flags \
    -k output-$$/vk \
    -p output-$$/proof \
    -i output-$$/public_inputs
