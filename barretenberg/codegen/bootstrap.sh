#!/usr/bin/env bash
# Codegen tool bootstrap: builds the tool and generates bindings for all consumers.
#
# Usage:
#   ./bootstrap.sh           # Build tool (npm install)
#   ./bootstrap.sh build     # Same
#   ./bootstrap.sh generate  # Build + run codegen from committed schemas
#   ./bootstrap.sh hash      # Print tool hash (includes schemas)

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Hash includes codegen source AND committed schema files.
# Changes to either invalidate the cache.
export hash=$(cache_content_hash .rebuild_patterns)

function build {
  echo_header "codegen tool build"
  if ! cache_download codegen-$hash.tar.gz; then
    npm ci --silent
    cache_upload codegen-$hash.tar.gz node_modules package-lock.json
  fi
}

function generate {
  build

  echo_header "codegen generate"
  echo "Working directory: $(pwd)"
  echo "Schemas: $(ls schemas/*.json 2>/dev/null | wc -l) JSON files"

  # Always run codegen — it reads committed JSON schemas (fast, ~2s).
  ./node_modules/.bin/tsx src/generate.ts

  echo "Generate complete. Checking output..."
  ls -la ../ts/src/cbind/generated/api_types.ts ../rust/barretenberg-rs/src/api.rs 2>&1 || true
}

case "${1:-build}" in
  hash) echo $hash ;;
  build) build ;;
  generate) generate ;;
  *) echo "Unknown command: $1"; exit 1 ;;
esac
