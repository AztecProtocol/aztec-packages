#!/usr/bin/env bash
# Shared utilities for docs/examples/ts scripts.
# Source this file — it has no shebang-executable purpose on its own.

# parse_dependencies <config_file> <repo_root>
#
# Reads a config.yaml via yq and classifies each dependency entry into one of
# these global arrays:
#   AZTEC_DEPS          — @aztec/* packages resolved to pkg@link:<repo_root>/yarn-project/<name>
#   EXPLICIT_LINK_DEPS  — link: packages resolved to pkg@link:<repo_root>/<path>
#   PORTAL_DEPS         — portal: packages resolved to pkg@portal:<repo_root>/<path>
#   NPM_DEPS            — npm: packages (bare names, e.g. viem)
#
# link: vs portal:: link: symlinks the package but does NOT install its own dependencies (the
# consumer must supply them), whereas portal: also installs the package's declared dependencies at
# the versions it pins. Use portal: for standalone packages whose runtime deps the example needs
# (e.g. @aztec/bb.js, which needs pako/msgpackr/...) so the package's own package.json is the single
# source of truth — rather than hand-mirroring its dependency list here (which drifts and, when left
# unversioned, floats to breaking majors).
#
# Also sets PARSED_DEPS_FOUND to "true" if any dependency was found, "false" otherwise.
parse_dependencies() {
    local config_file=$1
    local repo_root=$2

    AZTEC_DEPS=()
    EXPLICIT_LINK_DEPS=()
    PORTAL_DEPS=()
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
        elif [[ "$pkg" =~ ^portal: ]]; then
            # Portal (installs the package's own deps): portal:@aztec/bb.js:barretenberg/ts/bb.js
            #   -> @aztec/bb.js@portal:$repo_root/barretenberg/ts/bb.js
            local portal_spec="${pkg#portal:}"
            local portal_pkg_name="${portal_spec%%:*}"
            local portal_path="${portal_spec#*:}"
            PORTAL_DEPS+=("${portal_pkg_name}@portal:${repo_root}/${portal_path}")
        elif [[ "$pkg" =~ ^@ ]]; then
            # @aztec/* package - auto-link from yarn-project/
            local pkg_name="${pkg#@aztec/}"
            AZTEC_DEPS+=("${pkg}@link:${repo_root}/yarn-project/${pkg_name}")
        else
            echo "Warning: Unknown dependency format '$pkg' (use '@aztec/pkg', 'link:pkg:path', 'portal:pkg:path', or 'npm:pkg')" >&2
        fi
    done < <(yq eval '.dependencies[]' "$config_file")
}
