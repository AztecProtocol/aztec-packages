#!/bin/bash

testname=$1
script_dir=$(dirname "$0")

for i in {1..100}
do
  echo "Run #$i"
  if ! yarn test $1 > $script_dir/deflaker.log 2>&1; then
    echo "failed"
    exit 1
  fi
done
echo "success"
