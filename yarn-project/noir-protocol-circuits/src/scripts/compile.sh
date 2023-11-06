#!/bin/bash

set -euo pipefail;

# Compiles Aztec.nr contracts in parallel, bubbling any compilation errors
# uses the aztec-cli instead of nargo so that we compile with noir_wasm

export self_dir=$(dirname "$(realpath $0)")
echo "self_dir: $self_dir"
export COMPILER="$self_dir/../../../noir-compiler/dest/cli.js"

build() {
  CONTRACT_NAME=$1
  CONTRACT_FOLDER="$self_dir/../crates/${CONTRACT_NAME}"
  echo "Compiling $CONTRACT_NAME..."
  rm -rf ${CONTRACT_FOLDER}/target

  node "$COMPILER" contract "$CONTRACT_FOLDER" --compiler nargo
}

export -f build

# run 4 builds at a time
echo "$@" | xargs -n 1 -P 4 bash -c 'build "$0"'
