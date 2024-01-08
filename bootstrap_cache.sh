#!/usr/bin/env bash

cd "$(dirname "$0")"

source ./build-system/scripts/setup_env '' '' mainframe_$USER > /dev/null

echo -e "\033[1mBootstrapping bb.js from remote cache...\033[0m"
extract_repo bb.js \
  /usr/src/barretenberg/ts/dest ./barretenberg/ts \
  /usr/src/barretenberg/cpp/build-wasm/bin ./barretenberg/cpp/build-wasm \
  /usr/src/barretenberg/cpp/build-wasm-threads/bin ./barretenberg/cpp/build-wasm-threads

echo -e "\033[1mBootstrapping Noir from remote cache...\033[0m"
extract_repo noir-packages /usr/src/noir/packages ./noir
extract_repo noir /usr/src/noir/target/release ./noir/target
