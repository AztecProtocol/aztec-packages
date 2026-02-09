#!/usr/bin/env bash
set -euo pipefail

# Copies select Foundry artifacts from l1-contracts to yarn-project/l1-artifacts/l1-contracts.
# This makes yarn-project self-contained for runtime contract deployment.
#
# We use cp -p to preserve timestamps - forge cache uses timestamps to detect changes.
# See release-image/Dockerfile.dockerignore for the canonical list of what's needed.

cd $(git rev-parse --show-toplevel)/yarn-project/l1-artifacts

src="../../l1-contracts"

[ -d "$src/out" ] || { echo "Error: l1-contracts/out not found. Build l1-contracts first."; exit 1; }

rm -rf "l1-contracts"
mkdir -p "l1-contracts/script" "l1-contracts/lib" "l1-contracts/broadcast"

# Copy build artifacts, cache, sources, and config (preserving timestamps for cache validity)
cp -rp "$src"/{out,cache,src,generated} "l1-contracts/"
cp -rp "$src/script/deploy" "l1-contracts/script/"  # only deploy/, other scripts depend on test files
# Kludge: copy test files that forge cache references to avoid stale artifact warnings
mkdir -p "l1-contracts/test/script"
cp -p "$src/test/shouting.t.sol" "l1-contracts/test/"
cp -p "$src"/test/script/*.sol "l1-contracts/test/script/"
cp -p "$src"/{foundry.toml,foundry.lock,package.json,solc-*} "l1-contracts/"
# Compile the forge broadcast wrapper to JS (Node refuses to load .ts from node_modules).
mkdir -p "l1-contracts/scripts"
npx swc "$src/scripts/forge_broadcast.ts" -o "l1-contracts/scripts/forge_broadcast.js" \
  --config-file="$(dirname "$0")/../../.swcrc"
abs_dest=$(pwd)/l1-contracts
# Keep only the foundry relevant files from lib
(cd "$src" && find lib \( -name "*.sol" -o -name "remappings.txt" -o -name "foundry.toml" \) -exec cp --parents -t "$abs_dest" {} +)

# Foundry is very finicky about copying out subsets.
# Patch over what foundry feels needs to be rebuild (~3 seconds on mainframe)
(cd "l1-contracts" && forge build)
