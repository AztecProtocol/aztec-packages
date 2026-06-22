#!/usr/bin/env bash
# Copies cross-compiled ipc_runtime_napi.node into the per-platform build/
# layout consumed by ipc-runtime/ts/src/native_loader.ts.
#
# Inputs come from ipc-runtime/cpp/build-<arch>/lib/, populated by
# `ipc-runtime/bootstrap.sh build_cross <arch>` (which uses
# cpp/CMakePresets.json's amd64-linux / arm64-linux / amd64-macos /
# arm64-macos presets).
set -e
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

cd $(dirname $0)/..

if [ -n "${1:-}" ]; then
  arch="$1"
  mkdir -p ./build/$arch
  cp ../cpp/build-$arch/lib/ipc_runtime_napi.node ./build/$arch/
elif semver check "${REF_NAME:-}" && [[ "$(arch)" == "amd64" ]]; then
  # Release build on amd64-linux: gather all four cross-compiled targets.
  # The native amd64-linux addon is already in place from
  # ipc-runtime/bootstrap.sh's native build step.
  for arch in arm64-linux amd64-macos arm64-macos; do
    mkdir -p ./build/$arch
    cp ../cpp/build-$arch/lib/ipc_runtime_napi.node ./build/$arch/
  done

  llvm-strip-20 ./build/*/*

  # Re-sign macOS Mach-O binaries after stripping (stripping invalidates
  # the ad-hoc code signature).
  for arch in amd64-macos arm64-macos; do
    for f in ./build/$arch/*; do
      ldid -S "$f"
    done
  done
else
  echo "copy_cross.sh: no arch arg and not a release build — nothing to do."
fi
