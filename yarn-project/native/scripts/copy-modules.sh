#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ..

bb_root=$root/barretenberg/cpp

# Copy native module for host architecture.
target=$(arch)-$(os)
mkdir -p "build/$target"
cp -v "$bb_root/build/lib/nodejs_module.node" "build/$target/"

# If releasing, attempt to copy native modules for cross-compiled architectures.
if semver check "${REF_NAME:-}" && [[ "$(arch)" == "amd64" ]]; then
  for variant in arm64-linux amd64-macos arm64-macos; do
    mkdir -p "build/$variant"
    cp -v "$bb_root/build-zig-$variant/lib/nodejs_module.node" "build/$variant/"
  done
fi
