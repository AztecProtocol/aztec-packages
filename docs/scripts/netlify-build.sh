#!/usr/bin/env bash
# Netlify build command for production and deploy previews, run from docs/ (the Netlify base): the
# docs as CI builds them. Previews also get the aztec-nr API reference generated with the nargo
# release the pinned aztec-node uses; production does not, as it serves only the committed released
# references (static/aztec-nr-api/<network>) and drops the dev docs that link to the generated one.
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

if [ "${CONTEXT:-}" = production ]; then
  # Gitignored, so a reused checkout can still hold one from an earlier preview build.
  rm -rf "$docs/static/aztec-nr-api/next"
  echo "=== Production: no aztec-nr API reference for the dev docs ==="
else
  echo "=== Generating the aztec-nr API reference ==="
  if ! api_reference; then
    echo "WARNING: this preview has no aztec-nr API reference (see above)."
  fi
fi

echo "=== Building the docs ==="
cd "$docs"
# shellcheck source=docs/scripts/node_options.sh
source "$docs/scripts/node_options.sh"
yarn build
