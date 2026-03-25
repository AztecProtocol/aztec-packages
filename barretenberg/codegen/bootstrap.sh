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
    npm_install_deps
    cache_upload codegen-$hash.tar.gz node_modules package-lock.json
  fi
}

function generate {
  build

  echo_header "codegen generate (hash=$hash)"
  if ! cache_download codegen-generate-$hash.tar.gz; then
    # Run codegen from committed schema JSON files (no C++ binary dependency)
    npx tsx src/generate.ts

    # Cache all generated output
    cache_upload codegen-generate-$hash.tar.gz \
      ../ts/src/cbind/generated \
      ../ts/src/aztec-wsdb/generated \
      ../ts/src/aztec-cdb/generated \
      ../ts/src/aztec-avm/generated \
      ../rust/barretenberg-rs/src/generated_types.rs \
      ../rust/barretenberg-rs/src/api.rs
  fi
}

case "${1:-build}" in
  hash) echo $hash ;;
  build) build ;;
  generate) generate ;;
  *) echo "Unknown command: $1"; exit 1 ;;
esac
