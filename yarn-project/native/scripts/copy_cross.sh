#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ..

bb_root=$root/barretenberg/cpp

for variant in arm64-linux amd64-macos arm64-macos; do
  mkdir -p "build/$variant"
  cp -v "$bb_root/build-zig-$variant/lib/nodejs_module.node" "build/$variant/"
done
