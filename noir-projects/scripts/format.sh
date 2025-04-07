#!/usr/bin/env bash
set -eu

export NARGO=${NARGO:-../noir/noir-repo/target/release/nargo}

cd $(dirname "$0")/../

$NARGO fmt --program-dir ./aztec-nr
$NARGO fmt --program-dir ./noir-contracts
cd ./noir-protocol-circuits && yarn && node ./scripts/generate_variants.js
$NARGO fmt --program-dir ./noir-protocol-circuits
$NARGO fmt --program-dir ./mock-protocol-circuits
