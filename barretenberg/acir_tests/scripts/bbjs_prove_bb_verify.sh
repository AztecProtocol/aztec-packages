#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

export HARDWARE_CONCURRENCY=8

cd ../acir_tests/$1

mkdir -p output-$$
trap "rm -rf output-$$" EXIT

# Writes the proof, public inputs ./target; this also writes the VK
node ../../bbjs-test prove \
  -b target/program.json \
  -w target/witness.gz \
  -o output-$$

proof_bytes=$(cat output-$$/proof | xxd -p)
public_inputs=$(cat output-$$/public_inputs_fields.json | jq -r '.[]')

public_inputs_bytes=""
for input in $public_inputs; do
  public_inputs_bytes+=$input
done

# Combine proof header and the proof to a single file
echo -n $proof_bytes | xxd -r -p > output-$$/proof
echo -n $public_inputs_bytes | xxd -r -p > output-$$/public_inputs

bb=$(../../../cpp/scripts/find-bb)
# Verify the proof with bb cli
$bb verify \
  --scheme ultra_honk \
  -k output-$$/vk \
  -p output-$$/proof \
  -i output-$$/public_inputs
