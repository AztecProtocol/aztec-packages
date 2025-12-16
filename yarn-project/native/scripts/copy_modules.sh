#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ..

bb_root=$root/barretenberg/cpp

# Copy native module for host architecture.
target=$(arch)-$(os)
mkdir -p "build/$target"
cp -v "$bb_root/build/lib/nodejs_module.node" "build/$target/"
