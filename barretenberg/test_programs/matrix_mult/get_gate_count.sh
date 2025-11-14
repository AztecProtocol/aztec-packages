#!/bin/bash

set -e

# Script to compile Noir program and get gate count using bb gates

NARGO=/mnt/user-data/sergei/aztec-packages/noir/noir-repo/target/release/nargo
BB=/mnt/user-data/sergei/.bb/bb
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Compiling Noir program ==="
cd "$SCRIPT_DIR"
$NARGO compile

echo ""
echo "=== Getting gate count ==="
ACIR_FILE="$SCRIPT_DIR/target/matrix_mult.json"

if [ ! -f "$ACIR_FILE" ]; then
    echo "Error: ACIR file not found at $ACIR_FILE"
    exit 1
fi

echo "Running: bb gates -s ultra_honk -b $ACIR_FILE"
$BB gates -s ultra_honk -b "$ACIR_FILE"

echo ""
echo "=== Getting detailed gate count per opcode ==="
echo "Running: bb gates -s ultra_honk -b $ACIR_FILE --include_gates_per_opcode"
$BB gates -s ultra_honk -b "$ACIR_FILE" --include_gates_per_opcode
