#!/usr/bin/env bash
# Generate echo service types for all 4 languages from schema.json.
# Uses the codegen CLI — same as any service developer would.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
EXAMPLES="$(cd "$DIR/.." && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
NODE="node --experimental-strip-types --experimental-transform-types --no-warnings"
GEN="$CODEGEN/src/generate.ts"
SCHEMA="$DIR/schema.json"

echo "Generating echo types from $SCHEMA"

$NODE "$GEN" --schema "$SCHEMA" --lang cpp  --server --client --uds --out "$EXAMPLES/cpp/echo/generated" --prefix Echo --cpp-namespace echo
$NODE "$GEN" --schema "$SCHEMA" --lang ts   --server --client --uds --out "$EXAMPLES/ts/echo/generated"  --prefix Echo
$NODE "$GEN" --schema "$SCHEMA" --lang rust --server --client --uds --out "$EXAMPLES/rust/echo/src/generated" --prefix Echo
$NODE "$GEN" --schema "$SCHEMA" --lang zig  --server --client --uds --out "$EXAMPLES/zig/echo/generated"  --prefix Echo

echo "Done."
