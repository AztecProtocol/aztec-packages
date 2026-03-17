#!/usr/bin/env bash
# Copy acir_components_count from barretenberg cpp build into this directory
# so it is included in the Docker image. Run from this directory after building barretenberg:
#   cd barretenberg/cpp && cmake --preset default && cmake --build build --target acir_components_count
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BB_CPP_BIN="${SCRIPT_DIR}/../../cpp/build/bin/acir_components_count"
if [[ -f "$BB_CPP_BIN" ]]; then
    cp "$BB_CPP_BIN" "${SCRIPT_DIR}/acir_components_count"
    chmod +x "${SCRIPT_DIR}/acir_components_count"
    echo "Copied acir_components_count into $(basename "$SCRIPT_DIR")/"
else
    echo "Binary not found at $BB_CPP_BIN" >&2
    echo "Build it first: cd barretenberg/cpp && cmake --preset default && cmake --build build --target acir_components_count" >&2
    exit 1
fi
