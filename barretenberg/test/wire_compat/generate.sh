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

$NODE "$GEN" --schema "$SCHEMA" --lang ts        --prefix Echo --out "$DIR/ts/generated"
$NODE "$GEN" --schema "$SCHEMA" --lang rust      --prefix Echo --out "$DIR/rust/src"
$NODE "$GEN" --schema "$SCHEMA" --lang cpp-types --prefix Echo --out "$DIR/cpp/generated"
$NODE "$GEN" --schema "$SCHEMA" --lang zig       --prefix Echo --out "$DIR/zig/generated"

echo "Done."
