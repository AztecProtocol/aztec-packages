#!/usr/bin/env bash
set -eu

cd $(dirname $0)/../noir-repo

# Remove requirement for `wasm-opt` to be installed
sed -i.bak "s/^require_command wasm-opt/#require_command wasm-opt/" ./tooling/noirc_abi_wasm/build.sh
sed -i.bak "s/^require_command wasm-opt/#require_command wasm-opt/" ./acvm-repo/acvm_js/build.sh
