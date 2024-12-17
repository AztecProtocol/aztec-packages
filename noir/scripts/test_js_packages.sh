#!/bin/bash
set -eu

cd $(dirname "$0")/../noir-repo

./.github/scripts/wasm-bindgen-install.sh
# ./.github/scripts/playwright-install.sh

# Set build data manually.
export SOURCE_DATE_EPOCH=$(date -d "today 00:00:00" +%s)
export GIT_DIRTY=false
export GIT_COMMIT=${COMMIT_HASH:-$(git rev-parse --verify HEAD)}

# cargo build --release

yarn
yarn build

export NODE_OPTIONS=--max_old_space_size=8192
yarn workspaces foreach \
  --parallel \
  --verbose \
  --exclude @noir-lang/root \
  --exclude @noir-lang/noir_js \
  --exclude integration-tests \
  --exclude @noir-lang/noir_wasm \
  run test

# TOOD(ci3): Circular dependency on bb. Rethink or remove this. Should we run these?
# yarn workspaces foreach \
#   --parallel \
#   --verbose \
#   --include integration-tests \
#   --include @noir-lang/noir_wasm \
#   run test:node

# yarn workspaces foreach \
#   --verbose \
#   --include integration-tests \
#   --include @noir-lang/noir_wasm \
#   run test:browser