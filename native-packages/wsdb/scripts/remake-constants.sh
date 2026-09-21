#!/usr/bin/env bash
# Regenerates cpp/src/common/aztec_constants.hpp, restricted to wsdb's symbol selection, with
# @aztec-foundation/constants-codegen at the pinned foundation version (the package embeds its
# release's constants.nr).
set -euo pipefail
pkg_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cpp_output="$pkg_dir/cpp/src/common/aztec_constants.hpp"
version=${WSDB_FOUNDATION_VERSION:?the foundation version, from foundation.pin without its leading v}

# Write via temp file + rename: concurrent configures each regenerate this header.
tmp_dir=$(mktemp -d "$(dirname "$cpp_output")/.constants-gen.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT
npx -y "@aztec-foundation/constants-codegen@$version" \
  --cpp "$tmp_dir/aztec_constants.hpp" --selection "$pkg_dir/scripts/constants-codegen/cpp.json"
mv "$tmp_dir/aztec_constants.hpp" "$cpp_output"
