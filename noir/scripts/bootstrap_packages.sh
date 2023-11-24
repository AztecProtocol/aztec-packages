#!/bin/bash
set -eu

cd $(dirname "$0")

./bootstrap_package.sh @noir-lang/acvm_js
./bootstrap_package.sh @noir-lang/noir_wasm
./bootstrap_package.sh @noir-lang/types
./bootstrap_package.sh @noir-lang/noirc_abi
./bootstrap_package.sh @noir-lang/source-resolver
./bootstrap_package.sh @noir-lang/backend_barretenberg
./bootstrap_package.sh @noir-lang/noir_js