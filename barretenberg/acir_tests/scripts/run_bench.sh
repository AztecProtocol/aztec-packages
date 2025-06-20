#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ..

name=$1
cmd=$2

export HARDWARE_CONCURRENCY=${CPUS:-16}
export VERBOSE=1

mkdir -p ./bench-out

bash -c "$cmd" 2>&1 | \
  tee /dev/stderr |
  grep "mem: " |
  tail -1 |
  sed -e 's/.*mem: \([0-9.]\+\).*/\1/' |
  jq -n --arg name $name '[{name: $name, value: input, unit: "MiB"}]' > ./bench-out/$name.bench.json
