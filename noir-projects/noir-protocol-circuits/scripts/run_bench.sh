#!/usr/bin/env bash

cd $(dirname $0)/..

artifact=$1
scheme=$2
rec=${3:-}

circuit_name=$(basename $artifact .json)

mkdir -p ./bench-out
../../barretenberg/cpp/build/bin/bb gates -b $artifact --scheme $scheme ${rec:+--honk_recursion $rec} > bench-out/$circuit_name
