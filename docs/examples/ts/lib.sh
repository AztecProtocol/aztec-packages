#!/usr/bin/env bash
# Shared utilities for docs/examples/ts scripts.
# Source this file — it has no shebang-executable purpose on its own.

# parse_dependencies <config_file> <repo_root>
#
# Reads a config.yaml via yq and classifies each dependency entry into one of
# three global arrays:
#   AZTEC_DEPS          — @aztec/* packages resolved to pkg@link:<repo_root>/yarn-project/<name>
#                         Exceptions (not published locally) are routed to NPM_DEPS:
#                           - @aztec/viem (third-party fork pulled from npm)
#   EXPLICIT_LINK_DEPS  — link: packages resolved to pkg@link:<repo_root>/<path>
#   NPM_DEPS            — npm: packages (bare names, e.g. viem)
#
# Also sets PARSED_DEPS_FOUND to "true" if any dependency was found, "false" otherwise.

# @aztec/* packages that live on npm rather than in yarn-project/.
# When one of these appears bare (e.g. "@aztec/viem"), treat it as an npm dep
# instead of trying to link it from yarn-project/<name>.
AZTEC_NPM_EXCEPTIONS=(
    "@aztec/viem"
)

parse_dependencies() {
    local config_file=$1
    local repo_root=$2

    AZTEC_DEPS=()
    EXPLICIT_LINK_DEPS=()
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
            # External package: npm:viem -> viem
            local npm_pkg="${pkg#npm:}"
            NPM_DEPS+=("$npm_pkg")
        elif [[ "$pkg" =~ ^link: ]]; then
            # Explicit link: link:@aztec/bb.js:barretenberg/ts -> @aztec/bb.js@link:$repo_root/barretenberg/ts
            local link_spec="${pkg#link:}"
            local link_pkg_name="${link_spec%%:*}"
            local link_path="${link_spec#*:}"
            EXPLICIT_LINK_DEPS+=("${link_pkg_name}@link:${repo_root}/${link_path}")
        elif [[ "$pkg" =~ ^@ ]]; then
            # Exception list: some @aztec/* packages live on npm, not in yarn-project/.
            local is_npm_exception=false
            local exc
            for exc in "${AZTEC_NPM_EXCEPTIONS[@]}"; do
                if [ "$pkg" = "$exc" ]; then
                    is_npm_exception=true
                    break
                fi
            done

            if [ "$is_npm_exception" = true ]; then
                NPM_DEPS+=("$pkg")
            else
                # @aztec/* package - auto-link from yarn-project/
                local pkg_name="${pkg#@aztec/}"
                AZTEC_DEPS+=("${pkg}@link:${repo_root}/yarn-project/${pkg_name}")
            fi
        else
            echo "Warning: Unknown dependency format '$pkg' (use '@aztec/pkg', 'link:pkg:path', or 'npm:pkg')" >&2
        fi
    done < <(yq eval '.dependencies[]' "$config_file")
}
