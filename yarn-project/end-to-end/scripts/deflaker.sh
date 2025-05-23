#!/usr/bin/env bash

if [ $# -eq 0 ]; then
  echo "Usage: $0 <command to run repeatedly>"
  exit 1
fi

exe="$@"
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
