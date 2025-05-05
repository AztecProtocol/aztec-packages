#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ..

name=$1
cmd=$2

export HARDWARE_CONCURRENCY=${CPUS:-16}
export VERBOSE=1

mkdir -p ./bench-out

bash -c "$cmd" &> ./bench-out/$name.txt
