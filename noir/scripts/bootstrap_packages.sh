#!/bin/bash
set -eu

cd $(dirname "$0")/..

./scripts/install_wasm-bindgen.sh

# If this project has been subrepod into another project, set build data manually.
if [ -f ".gitrepo" ]; then
  export SOURCE_DATE_EPOCH=$(date +%s)
  export GIT_DIRTY=false
  export GIT_COMMIT=$(awk '/commit =/ {print $3}' .gitrepo)
fi

export cargoExtraArgs="--features noirc_frontend/aztec"

yarn
yarn build