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

# The bridge tutorials' examples are Hardhat projects in the reader's layout: the entry point is
# scripts/index.ts, and Hardhat owns artifacts/, so codegen writes to contracts/aztec/artifacts/.
is_hardhat_project() {
    [ -f "${1:-.}/hardhat.config.ts" ]
}

project_entry() {
    if is_hardhat_project "${1:-.}"; then echo scripts/index.ts; else echo index.ts; fi
}

codegen_dir() {
    if is_hardhat_project "${1:-.}"; then echo contracts/aztec/artifacts; else echo artifacts; fi
}

# write_tsconfig <template>
write_tsconfig() {
    local include=("$(project_entry)" "$(codegen_dir)/**/*.ts")
    if is_hardhat_project; then include+=(hardhat.config.ts); fi
    jq '.include = $ARGS.positional' "$1" --args "${include[@]}" > tsconfig.json
}

# hardhat_compile: run in a Hardhat project after its install. l1-artifacts ships no remappings and
# Hardhat applies the project's to no file under node_modules, so remappings.txt reaches the
# package's own sources through an l1-contracts link at the project root.
hardhat_compile() {
    if [ -e l1-contracts ] && [ ! -L l1-contracts ]; then
        echo "ERROR: $PWD/l1-contracts is not the link to the l1-artifacts package" >&2
        return 1
    fi
    ln -sfn node_modules/@aztec-foundation/l1-artifacts/l1-contracts l1-contracts
    npx hardhat compile
}

# An example's contracts/aztec holds only generated bindings: its Noir sources live in docs/examples/contracts.
clean_hardhat_project() {
    if [ -L l1-contracts ]; then rm l1-contracts; fi
    rm -rf cache contracts/aztec
}
