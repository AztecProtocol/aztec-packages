#!/bin/bash
set -eu

cd $(dirname "$0")/..

# If this project has been subrepod into another project, set build data manually.
if [ -f ".gitrepo" ]; then
  export SOURCE_DATE_EPOCH=$(date +%s)
  export GIT_DIRTY=false
  export GIT_COMMIT=$(awk '/commit =/ {print $3}' .gitrepo)
fi

# Install wasm-bindgen-cli.
if [ "$(wasm-bindgen --version | cut -d' ' -f2)" != "0.2.86" ]; then
  echo "Building wasm-bindgen..."
  RUSTFLAGS="-Ctarget-feature=-crt-static" cargo install -f wasm-bindgen-cli --version 0.2.86
fi

# Build wasm and packages.
yarn
export cargoExtraArgs="--features noirc_frontend/aztec"
yarn workspace @noir-lang/acvm_js build
yarn workspace @noir-lang/noir_wasm build
yarn workspace @noir-lang/source-resolver build
yarn workspace @noir-lang/types build
yarn workspace @noir-lang/noirc_abi build
yarn workspace @noir-lang/backend_barretenberg build
yarn workspace @noir-lang/noir_js build