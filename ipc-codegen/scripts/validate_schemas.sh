#!/usr/bin/env bash
#
# Validate committed schema JSON files match C++ binary output.
# Run in CI after C++ build to catch schema drift.
#
# Usage: ./scripts/validate_schemas.sh
# Exit 0: schemas match. Exit 1: schemas out of date.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN_DIR="$(dirname "$SCRIPT_DIR")"
BB_BIN="${CODEGEN_DIR}/../cpp/build/bin"

FAIL=0

for service in bb:bb wsdb:aztec-wsdb cdb:aztec-cdb avm:aztec-avm; do
  IFS=: read -r name binary <<< "$service"
  bin_path="${BB_BIN}/${binary}"
  schema_path="${CODEGEN_DIR}/schemas/${name}_schema.json"

  if [ ! -x "$bin_path" ]; then
    echo "  [skip] ${name}: binary not found at ${bin_path}"
    continue
  fi

  if [ ! -f "$schema_path" ]; then
    echo "  [FAIL] ${name}: committed schema not found at ${schema_path}"
    FAIL=1
    continue
  fi

  # Export current schema from binary
  current=$("$bin_path" msgpack schema 2>/dev/null)

  # Compare with committed
  committed=$(cat "$schema_path")

  if [ "$current" = "$committed" ]; then
    echo "  [ok] ${name}_schema.json matches binary"
  else
    echo "  [FAIL] ${name}_schema.json is out of date!"
    echo "         Run: cd ipc-codegen && ./scripts/update_schemas.sh"
    FAIL=1
  fi
done

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Schema validation failed. Committed schemas are out of sync with C++ code."
  echo "Fix: cd ipc-codegen && ./scripts/update_schemas.sh && git add schemas/"
  exit 1
fi

echo ""
echo "All schemas are up to date."
