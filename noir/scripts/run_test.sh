#!/bin/bash
set -eu

cd $(dirname $0)/../noir-repo

export RAYON_NUM_THREADS=1

./target/release/deps/$1 --exact $2