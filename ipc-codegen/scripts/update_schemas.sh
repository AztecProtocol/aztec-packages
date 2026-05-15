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

# Curve constants: export as msgpack then convert to JSON
bb_path="${BB_BIN}/bb"
if [ -x "$bb_path" ]; then
  tmpfile=$(mktemp)
  "$bb_path" msgpack curve_constants 2>/dev/null > "$tmpfile"
  # Convert msgpack to JSON (msgpackr from barretenberg/ts node_modules)
  NODE_PATH="${CODEGEN_DIR}/../ts/node_modules" node -e "
    const {unpack} = require('msgpackr');
    const fs = require('fs');
    const buf = fs.readFileSync('$tmpfile');
    const c = unpack(buf);
    const toHex = (a) => Buffer.from(a).toString('hex');
    const cvt = (p) => Array.isArray(p.x) ? {x:p.x.map(toHex),y:p.y.map(toHex)} : {x:toHex(p.x),y:toHex(p.y)};
    const out = {};
    for (const [k,v] of Object.entries(c)) {
      out[k] = k.endsWith('_modulus') ? toHex(v) : cvt(v);
    }
    fs.writeFileSync('${CODEGEN_DIR}/schemas/bb_curve_constants.json', JSON.stringify(out, null, 2));
  "
  rm -f "$tmpfile"
  echo "  [updated] bb_curve_constants.json"
fi

echo ""
echo "Done. Run 'npx tsx src/generate.ts' to regenerate bindings, then commit."
