#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"
source ../../build-system/scripts/setup_env '' '' mainframe_$USER > /dev/null

echo -e "\033[1mRetrieving bb.wasm from remote cache...\033[0m"
extract_repo barretenberg-wasm-linux-clang \
  /usr/src/barretenberg/cpp/build-wasm/bin ./cpp/build-wasm \
  /usr/src/barretenberg/cpp/build-wasm-threads/bin ./cpp/build-wasm-threads

remove_old_images barretenberg-wasm-linux-clang
