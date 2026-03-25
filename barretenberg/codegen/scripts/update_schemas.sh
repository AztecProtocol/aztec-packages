#!/usr/bin/env bash
#
# Update committed schema JSON files from C++ binaries.
# Run this after changing C++ command structs.
#
# Usage: ./scripts/update_schemas.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN_DIR="$(dirname "$SCRIPT_DIR")"
BB_BIN="${CODEGEN_DIR}/../cpp/build/bin"

echo "Updating schemas from C++ binaries..."

for service in bb:bb wsdb:aztec-wsdb cdb:aztec-cdb avm:aztec-avm; do
  IFS=: read -r name binary <<< "$service"
  bin_path="${BB_BIN}/${binary}"

  if [ ! -x "$bin_path" ]; then
    echo "  [skip] ${name}: binary not found at ${bin_path}"
    echo "         Build C++ first: cd barretenberg/cpp && cmake --preset default && cd build && ninja ${binary}"
    continue
  fi

  "$bin_path" msgpack schema 2>/dev/null > "${CODEGEN_DIR}/schemas/${name}_schema.json"
  echo "  [updated] ${name}_schema.json"
done

# Curve constants (binary msgpack)
bb_path="${BB_BIN}/bb"
if [ -x "$bb_path" ]; then
  "$bb_path" msgpack curve_constants 2>/dev/null > "${CODEGEN_DIR}/schemas/bb_curve_constants.msgpack"
  echo "  [updated] bb_curve_constants.msgpack"
fi

echo ""
echo "Done. Run 'npx tsx src/generate.ts' to regenerate bindings, then commit."
