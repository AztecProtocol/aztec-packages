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
  # Always run codegen — it reads committed JSON schemas (fast, ~2s).
  # No caching of generated output: relative paths cause extraction issues,
  # and the generation is fast enough to just re-run each time.
  npx tsx src/generate.ts
}

case "${1:-build}" in
  hash) echo $hash ;;
  build) build ;;
  generate) generate ;;
  *) echo "Unknown command: $1"; exit 1 ;;
esac
