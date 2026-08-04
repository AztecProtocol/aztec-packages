#!/usr/bin/env bash
set -euo pipefail

cd $(dirname $0)/..

# Resolved rather than hardcoded to node_modules/: the linker may hoist the package to the workspace
# root instead of installing it here. Kept above the loader export because the loader crashes node on
# exit, which under errexit would fail this command substitution despite the path being printed.
artifacts_pkg=$(node -p "require('path').dirname(require.resolve('@aztec/protocol-circuits-artifacts/package.json'))")

export SWCRC=true
export NODE_OPTIONS="--no-warnings --loader @swc-node/register/esm"

rm -rf ./artifacts
mkdir -p ./artifacts

cp -r $artifacts_pkg/artifacts/* ./artifacts
# generate_vk_hashes rewrites ./artifacts/*.json in place; generate_ts_from_abi reads those same
# files. They must not run concurrently or the reader can observe a partially-written artifact
# ("Unterminated string in JSON"). Writers run first, readers second.
parallel --tag -v node src/scripts/{} ::: \
  generate_declaration_files.ts \
  generate_vk_hashes.ts
parallel --tag -v node src/scripts/{} ::: \
  generate_ts_from_abi.ts \
  generate_private_kernel_reset_data.ts

node src/scripts/generate_vk_tree.ts
node src/scripts/generate_client_artifacts_helper.ts

if [ "${DEBUG:-0}" -eq 0 ]; then
  node src/scripts/cleanup_artifacts.ts
fi
