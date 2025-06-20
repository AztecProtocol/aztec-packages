#!/usr/bin/env bash

cd $(dirname $0)/..

artifact=$1
scheme=$2
rec=${3:-}

circuit_name=$(basename $artifact .json)

mkdir -p ./bench-out
../../barretenberg/cpp/build/bin/bb gates -b $artifact --scheme $scheme ${rec:+--honk_recursion $rec} |
  jq --arg name $circuit_name '[
    { name: ($name + "_opcodes"), unit: "opcodes", value: .functions[0].acir_opcodes },
    { name: ($name + "_gates"), unit: "gates", value: .functions[0].circuit_size }
  ]' > bench-out/$circuit_name.bench.json
