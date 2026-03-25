#!/usr/bin/env bash
# Codegen tool bootstrap: builds the tool and generates bindings for all consumers.
#
# Usage:
#   ./bootstrap.sh           # Build tool (npm install)
#   ./bootstrap.sh build     # Same
#   ./bootstrap.sh generate  # Build + run codegen (needs C++ binaries)
#   ./bootstrap.sh hash      # Print tool hash
#   ./bootstrap.sh generate_hash  # Print generation hash (tool + C++ schemas)

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

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

  # Generation hash depends on both the codegen tool AND the C++ schemas
  local cpp_hash=$(../cpp/bootstrap.sh hash)
  local gen_hash=$(hash_str $hash $cpp_hash)
  export generate_hash=$gen_hash

  echo_header "codegen generate (hash=$gen_hash)"
  if ! cache_download codegen-generate-$gen_hash.tar.gz; then
    # Run codegen against C++ binaries
    npx tsx src/generate.ts

    # Cache all generated output
    cache_upload codegen-generate-$gen_hash.tar.gz \
      ../ts/src/cbind/generated \
      ../ts/src/aztec-wsdb/generated \
      ../ts/src/aztec-cdb/generated \
      ../ts/src/aztec-avm/generated \
      ../rust/barretenberg-rs/src/generated_types.rs \
      ../rust/barretenberg-rs/src/api.rs
  fi
}

function generate_hash {
  local cpp_hash=$(../cpp/bootstrap.sh hash)
  hash_str $hash $cpp_hash
}

case "${1:-build}" in
  hash) echo $hash ;;
  generate_hash) generate_hash ;;
  build) build ;;
  generate) generate ;;
  *) echo "Unknown command: $1"; exit 1 ;;
esac
