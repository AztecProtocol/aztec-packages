#!/usr/bin/env bash
# Generate echo service types for all 4 languages from schema.json.
# Uses the codegen CLI — same as any service developer would.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)/codegen"
NODE="node --experimental-strip-types --experimental-transform-types --no-warnings"
GEN="$CODEGEN/src/generate.ts"
SCHEMA="$DIR/schema.json"

echo "Generating echo types from $SCHEMA"

$NODE "$GEN" --schema "$SCHEMA" --lang cpp  --server --client --uds --out "$DIR/cpp/generated" --prefix Echo --cpp-namespace echo --cpp-include-dir echo
$NODE "$GEN" --schema "$SCHEMA" --lang ts   --server --client --uds --out "$DIR/ts/generated"  --prefix Echo
$NODE "$GEN" --schema "$SCHEMA" --lang rust --server --client --uds --out "$DIR/rust/src/generated" --prefix Echo
$NODE "$GEN" --schema "$SCHEMA" --lang zig  --server --client --uds --out "$DIR/zig/generated"  --prefix Echo

echo "Done."
