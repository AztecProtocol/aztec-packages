#!/usr/bin/env bash
# Shared utilities for docs/examples/ts scripts.
# Source this file — it has no shebang-executable purpose on its own.

# parse_dependencies <config_file>
#
# Reads a config.yaml via yq and classifies each dependency entry into one of
# two global arrays:
#   PINNED_DEPS  — @aztec-labs/* at $AZTEC_VERSION and @aztec-foundation/* at $BB_VERSION, the versions
#                  docs/aztec-node.json pins (`node docs/scripts/aztec_node.mts env` exports both)
#   NPM_DEPS     — npm: packages as written (npm:@aztec/viem@2.38.2 -> @aztec/viem@2.38.2)
#
# Also sets PARSED_DEPS_FOUND to "true" if any dependency was found, "false" otherwise.
parse_dependencies() {
    local config_file=$1
    local fix="eval the output of node docs/scripts/aztec_node.mts env first"
    : "${AZTEC_VERSION:?$fix}" "${BB_VERSION:?$fix}"

    PINNED_DEPS=()
    NPM_DEPS=()
    PARSED_DEPS_FOUND=false

    local pkg
    while IFS= read -r pkg; do
        PARSED_DEPS_FOUND=true
        # Remove quotes and whitespace
        pkg="${pkg//\"/}"
        pkg="${pkg#"${pkg%%[![:space:]]*}"}"  # ltrim
        pkg="${pkg%"${pkg##*[![:space:]]}"}"  # rtrim

        if [ -z "$pkg" ]; then
            continue
        fi

        if [[ "$pkg" =~ ^npm: ]]; then
            NPM_DEPS+=("${pkg#npm:}")
        elif [[ "$pkg" == @aztec-labs/* ]]; then
            PINNED_DEPS+=("${pkg}@${AZTEC_VERSION}")
        elif [[ "$pkg" == @aztec-foundation/* ]]; then
            PINNED_DEPS+=("${pkg}@${BB_VERSION}")
        else
            echo "Warning: Unknown dependency format '$pkg' (use '@aztec-labs/pkg', '@aztec-foundation/pkg', or 'npm:pkg')" >&2
        fi
    done < <(yq eval '.dependencies[]' "$config_file")
}
