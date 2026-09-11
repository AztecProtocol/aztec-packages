#!/usr/bin/env bash
set -euo pipefail

# Builds a self-contained, publishable Foundry subtree for runtime contract deployment from the
# parent l1-contracts sources.
#
# See release-image/Dockerfile.dockerignore for the canonical list of what's needed.

cd $(git rev-parse --show-toplevel)/l1-contracts/l1-artifacts

src=".."

[ -d "$src/out" ] || { echo "Error: l1-contracts/out not found. Build l1-contracts first."; exit 1; }

rm -rf "l1-contracts"
mkdir -p "l1-contracts/script" "l1-contracts/lib" "l1-contracts/broadcast"

# Copy sources and config, then compile the bundle independently so its cache and artifacts contain
# only files that can be reached from the published source tree.
cp -rp "$src"/{src,generated} "l1-contracts/"
cp -rp "$src/script/deploy" "l1-contracts/script/"  # only deploy/, other scripts depend on test files
# EmptyPayload for the rollup-upgrade docs tutorial's quick-test path
# (docs/docs-developers/docs/tutorials/testing_governance_rollup_upgrade.md); the tutorial's main
# payload, RegisterNewRollupVersionPayload, ships with src/periphery. Compiles against src/ only.
mkdir -p "l1-contracts/test/governance/governance"
cp -p "$src/test/governance/governance/TestPayloads.sol" "l1-contracts/test/governance/governance/"
cp -p "$src"/{foundry.toml,foundry.lock,package.json,solc-*} "l1-contracts/"
# Copy the forge broadcast wrapper (now a plain .js source file) and the network defaults
# (read at deploy time via foundry fs_permissions / vm.readFile).
mkdir -p "l1-contracts/scripts"
cp -p "$src/scripts/forge_broadcast.js" "l1-contracts/scripts/"
cp -p "$src/scripts/network-defaults.json" "l1-contracts/scripts/"
abs_dest=$(pwd)/l1-contracts
# Keep only the foundry relevant files from lib
(cd "$src" && find lib \( -name "*.sol" -o -name "remappings.txt" -o -name "foundry.toml" \) -exec cp --parents -t "$abs_dest" {} +)

# Build a cache and artifact tree that exactly matches the files in the published bundle.
(cd "l1-contracts" && forge build)
