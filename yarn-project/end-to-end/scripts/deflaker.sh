#!/bin/bash

exe="FRESH_INSTALL=true INSTALL_METRICS=false ~/aztec-clones/alpha/spartan/scripts/test_kind.sh src/spartan/smoke.test.ts 1-validators.yaml smoke"
script_dir=$(dirname "$0")


for i in {1..100}
do
  echo "Run #$i"
  if ! (eval $exe) > $script_dir/deflaker.log 2>&1; then
    echo "failed"
    exit 1
  fi
done
echo "success"
