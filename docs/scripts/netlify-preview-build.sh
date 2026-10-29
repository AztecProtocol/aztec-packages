#!/usr/bin/env bash
# Netlify build command for deploy previews, run from docs/ (the Netlify base): the docs as CI builds
# them, plus the aztec-nr API reference generated with the nargo release the pinned aztec-node uses.
set -euo pipefail

docs=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

echo "=== Fetching the pinned aztec-node checkout ==="
node "$docs/scripts/aztec_node.mts" fetch

# Optional: CI builds the docs without it. Called from an `if`, so set -e is off and every step
# returns explicitly.
function api_reference {
  node "$docs/scripts/aztec_node.mts" provision nargo || return 1
  "$docs/scripts/aztec_nr_docs_generation/generate_aztec_nr_docs.sh"
}

echo "=== Generating the aztec-nr API reference ==="
if ! api_reference; then
  echo "WARNING: this preview has no aztec-nr API reference (see above)."
fi

echo "=== Building the docs ==="
cd "$docs"
# shellcheck source=docs/scripts/node_options.sh
source "$docs/scripts/node_options.sh"
yarn build
