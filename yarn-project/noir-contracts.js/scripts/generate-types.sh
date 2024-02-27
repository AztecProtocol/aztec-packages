#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="./src"
INDEX="$OUT_DIR/index.ts"

rm -rf "$OUT_DIR" && mkdir -p "$OUT_DIR"

# Check for .json files existence
if ! ls ../../noir-projects/noir-contracts/target/*.json >/dev/null 2>&1; then
  echo "Error: No .json files found in noir-contracts/target folder."
  echo "Make sure noir-contracts is built before running this script."
  exit 1
fi

# Generate index.ts header
echo "// Auto generated module - do not edit!" >"$INDEX"

# Ensure the artifacts directory exists
mkdir -p artifacts

# Parallel codegen
export OUT_DIR
export INDEX
find ../../noir-projects/noir-contracts/target -maxdepth 1 -type f ! -name 'debug_*' -name '*.json' | parallel '
  filename=$(basename {})
  cp {} "artifacts/$filename"
  CONTRACT=$(jq -r .name "artifacts/$filename")
  echo "Creating types for $CONTRACT using artifacts/$filename..."
  node --no-warnings ../noir-compiler/dest/cli.js codegen -o $OUT_DIR --ts "artifacts/$filename"
  echo "export * from '\''./${CONTRACT}.js'\'';" >> $INDEX
'

echo "Formatting..."
yarn formatting:fix
