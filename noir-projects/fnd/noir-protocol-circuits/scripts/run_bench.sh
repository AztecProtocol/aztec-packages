#!/usr/bin/env bash

cd $(dirname $0)/..

artifact=$1
shift
# rest of $@ args are flags

circuit_name=$(basename $artifact .json)

mkdir -p ./bench-out
../../barretenberg/cpp/build/bin/bb gates -b $artifact "$@" |
  jq --arg name $circuit_name '[
    { name: ($name + "_opcodes"), unit: "opcodes", value: .functions[0].acir_opcodes },
    { name: ($name + "_gates"), unit: "gates", value: .functions[0].circuit_size }
  ]' > bench-out/$circuit_name.bench.json
