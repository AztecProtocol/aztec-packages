#!/usr/bin/env bash
set -eu

yarn
node ./generate_variants.js

echo "Compiling protocol circuits..."
NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
$NARGO compile --silence-warnings