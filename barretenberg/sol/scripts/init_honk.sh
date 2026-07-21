#!/usr/bin/env bash
set -eu
# the verification key is the same for ultra and ultra zk
SRS_PATH="$HOME/.bb-crs"
OUTPUT_PATH="./src/honk"
KEYGEN="../cpp/build/bin/honk_solidity_key_gen"

if [ ! -x "$KEYGEN" ]; then
  echo "Error: honk_solidity_key_gen binary not found at $KEYGEN" >&2
  echo "Run barretenberg/cpp bootstrap first." >&2
  exit 1
fi

mkdir -p './src/honk/keys'

$KEYGEN add2 $OUTPUT_PATH $SRS_PATH
$KEYGEN blake $OUTPUT_PATH $SRS_PATH
$KEYGEN ecdsa $OUTPUT_PATH $SRS_PATH
$KEYGEN recursive $OUTPUT_PATH $SRS_PATH

echo ""
echo "✓ VK generation complete"

# Sync honk-optimized.sol with generated Blake VK
echo ""
echo "Syncing honk-optimized.sol with generated Blake VK..."
./scripts/sync_blake_opt_vk.sh
