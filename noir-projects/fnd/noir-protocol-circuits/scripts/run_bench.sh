#!/usr/bin/env bash
set -euo pipefail

cd $(dirname $0)/..

artifact=$1
shift
# rest of $@ args are flags

circuit_name=$(basename $artifact .json)

# The same bb the build keys the circuits with: the AVM-enabled one by default, which the public
# tx-base circuit needs because it verifies an AVM proof.
BB=${BB:-$(../../../barretenberg/cpp/scripts/find-bb)}

mkdir -p ./bench-out
$BB gates -b $artifact "$@" |
  jq --arg name $circuit_name '[
    { name: ($name + "_opcodes"), unit: "opcodes", value: .functions[0].acir_opcodes },
    { name: ($name + "_gates"), unit: "gates", value: .functions[0].circuit_size }
  ]' > bench-out/$circuit_name.bench.json
