#!/usr/bin/env bash
# Copies cross-compiled bb binary and napi module to dest.
set -e
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

cd $(dirname $0)/..

if [ -n "${1:-}" ]; then
  arch="$1"
  mkdir -p ./build/$arch
  cp ../../cpp/build-$arch/bin/bb ./build/$arch
  cp ../../cpp/build-$arch/lib/nodejs_module.node ./build/$arch
elif semver check "${REF_NAME:-}" && [[ "$(arch)" == "amd64" ]]; then
  # We're building a release.
  # Copy all cross-compiled architectures for release builds.
  # The native amd64-linux binary is already copied by copy_native.sh (bb-ts target).
  for arch in arm64-linux amd64-macos arm64-macos; do
    mkdir -p ./build/$arch
    cp ../../cpp/build-$arch/bin/bb ./build/$arch
    cp ../../cpp/build-$arch/lib/nodejs_module.node ./build/$arch
  done

  llvm-strip-20 ./build/*/*

  # Re-sign macOS Mach-O binaries after stripping (stripping invalidates the ad-hoc code signature).
  for arch in amd64-macos arm64-macos; do
    for f in ./build/$arch/*; do
      ldid -S "$f"
    done
  done
else
  echo "This task is expected to be run in an x86 release context."
  # TODO bring back. was being called by release.
  # exit 1
fi
