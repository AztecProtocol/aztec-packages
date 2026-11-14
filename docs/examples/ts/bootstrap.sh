#!/usr/bin/env bash
set -euo pipefail

"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source "$(git rev-parse --show-toplevel)/ci3/source_bootstrap"
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

export REPO_ROOT=$(git rev-parse --show-toplevel)
# The docs tree to validate, set by examples/bootstrap.sh: docs/, or a line's stage outside the
# repository (which is why this runs from docs/examples/ts and moves there only after the ci3 setup).
export DOCS_ROOT=${DOCS_ROOT:-$REPO_ROOT/docs} DOCS_PATH=${DOCS_PATH:-docs}
export ARTIFACTS_DIR="$DOCS_ROOT/target"
cd "$DOCS_ROOT/examples/ts"
: "${AZTEC:?the pinned aztec CLI is not exported: run docs/examples/bootstrap.sh validate-ts}"

# Each project starts from an empty yarn.lock that its own install fills. ci3 exports CI=0, which
# yarn's CI detection treats as CI, turning on immutable installs; `yarn init` then fails its install.
export YARN_ENABLE_IMMUTABLE_INSTALLS=false

# Set parallel flags for concurrent validation
export PARALLEL_FLAGS="-j${PARALLELISM:-4} --halt now,fail=1"

# Validate config.yaml structure before processing
validate_config() {
    local config_file=$1
    local project_name=$2

    # Check if yq can parse the YAML
    if ! yq eval '.' "$config_file" >/dev/null 2>&1; then
        echo_stderr "ERROR: Invalid YAML syntax in '${config_file}'"
        return 1
    fi

    # Check contracts section exists and is an array (!!seq in YAML)
    local contracts_type
    contracts_type="$(yq eval '.contracts | type' "$config_file" 2>/dev/null)"
    if [ "$contracts_type" != "!!seq" ]; then
        echo_stderr "ERROR: Missing or invalid 'contracts' array in '${config_file}' (got: ${contracts_type})"
        return 1
    fi

    # Check contracts count (can be empty if using pre-built packages like @aztec-labs/noir-contracts.js)
    local contract_count
    contract_count="$(yq eval '.contracts | length' "$config_file")"

    # Check dependencies section exists and is an array (!!seq in YAML)
    local deps_type
    deps_type="$(yq eval '.dependencies | type' "$config_file" 2>/dev/null)"
    if [ "$deps_type" != "!!seq" ]; then
        echo_stderr "ERROR: Missing or invalid 'dependencies' array in '${config_file}' (got: ${deps_type})"
        return 1
    fi

    # Validate all contract artifacts exist (if any contracts specified)
    if [ "$contract_count" -gt 0 ]; then
        local contract_name
        while IFS= read -r contract_name; do
            local artifact="$ARTIFACTS_DIR/${contract_name}.json"
            if [ ! -f "$artifact" ]; then
                echo_stderr "ERROR: Artifact not found for '${project_name}': ${artifact}"
                return 1
            fi
        done < <(yq eval '.contracts[]' "$config_file")
    fi

    return 0
}
export -f validate_config
export -f parse_dependencies is_hardhat_project project_entry codegen_dir write_tsconfig hardhat_compile \
    clean_hardhat_project

# Function to validate a single TS project
# Must be exported for parallel execution
validate_project() {
    # Re-enable strict mode as parallel runs in new shell
    set -euo pipefail

    local project_name=$1

    if [ ! -d "$project_name" ]; then
        echo_stderr "ERROR: Project directory not found: '${project_name}'"
        return 1
    fi

    local entry
    entry=$(project_entry "$project_name")
    if [ ! -f "$project_name/$entry" ]; then
        echo_stderr "ERROR: No $entry found in '${project_name}'"
        return 1
    fi

    if [ ! -f "$project_name/config.yaml" ]; then
        echo_stderr "ERROR: No config.yaml found in '${project_name}'"
        return 1
    fi

    # Validate config early before doing any work
    if ! validate_config "$project_name/config.yaml" "$project_name"; then
        return 1
    fi

    echo_header "Validating $project_name"

    (
        set -euo pipefail
        cd "$project_name"

        # Cleanup function - always runs on exit (success or failure)
        cleanup() {
            local exit_code=$?
            if [ "$exit_code" -ne 0 ]; then
                echo_stderr "Validation failed for '${project_name}', cleaning up..."
            else
                echo_stderr "Cleaning up temporary files for '${project_name}'..."
            fi
            rm -rf .git .gitignore .editorconfig .gitattributes README.md \
                   node_modules .yarn .yarnrc.yml yarn.lock codegenCache.json \
                   package.json tsconfig.json artifacts 2>/dev/null || true
            if is_hardhat_project; then clean_hardhat_project; fi
            return $exit_code
        }
        trap cleanup EXIT
        # Truncated rather than created, so a lockfile an interrupted run filled starts over.
        : > yarn.lock

        # Read contracts from config.yaml (already validated above)
        local contract_count
        contract_count="$(yq eval '.contracts | length' config.yaml)"

        if [ "$contract_count" -gt 0 ]; then
            echo_stderr "Running codegen for '${project_name}'..."

            # Process each contract
            local contract_name
            while IFS= read -r contract_name; do
                local artifact="$ARTIFACTS_DIR/${contract_name}.json"
                echo_stderr "  - ${contract_name}..."
                "$AZTEC" codegen "$artifact" -o "$(codegen_dir)"
            done < <(yq eval '.contracts[]' config.yaml)
        else
            echo_stderr "No custom contracts for '${project_name}', skipping codegen..."
        fi

        # Setup yarn
        echo_stderr "Setting up yarn for '${project_name}'..."
        # Corepack takes Yarn's version from the nearest package.json, and a line's stage has none above the
        # projects: without this pin they install with Corepack's newest Yarn (4.18 skips dependency build scripts).
        jq -n --arg pm "$(jq -r .packageManager "$REPO_ROOT/docs/package.json")" '{packageManager: $pm}' > package.json
        yarn init -y
        yarn config set nodeLinker node-modules

        # Set package type to module for ESM support
        node -e "const pkg = require('./package.json'); pkg.type = 'module'; require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));"

        # Read dependencies from config.yaml
        echo_stderr "Installing dependencies for '${project_name}'..."

        parse_dependencies config.yaml

        if [ "$PARSED_DEPS_FOUND" = true ]; then
            if [ ${#PINNED_DEPS[@]} -gt 0 ]; then
                echo_stderr "Adding pinned deps: ${PINNED_DEPS[*]}"
                yarn add "${PINNED_DEPS[@]}"
            fi

            if [ ${#NPM_DEPS[@]} -gt 0 ]; then
                echo_stderr "Adding npm deps: ${NPM_DEPS[*]}"
                yarn add "${NPM_DEPS[@]}"
            fi
        else
            # Fallback to default dependencies if none specified
            echo_stderr "No dependencies in config.yaml, using defaults..."
            yarn add \
                "@aztec-labs/aztec.js@$AZTEC_VERSION" \
                "@aztec-labs/accounts@$AZTEC_VERSION" \
                "@aztec-labs/wallets@$AZTEC_VERSION" \
                "@aztec-labs/kv-store@$AZTEC_VERSION"
        fi

        yarn add -D "typescript@^5.3.3"

        # Create tsconfig.json from template
        if [ ! -f "$DOCS_ROOT/examples/ts/tsconfig.template.json" ]; then
            echo_stderr "ERROR: tsconfig template not found at '$DOCS_ROOT/examples/ts/tsconfig.template.json'"
            return 1
        fi
        write_tsconfig "$DOCS_ROOT/examples/ts/tsconfig.template.json"

        if is_hardhat_project; then
            echo_stderr "Compiling Solidity for '${project_name}'..."
            hardhat_compile
        fi

        # Type check
        echo_stderr "Type checking '${project_name}'..."
        if ! npx tsc --noEmit; then
            echo_stderr "ERROR: Type checking failed for '${project_name}'"
            return 1
        fi

        echo_stderr "✓ '${project_name}' validated successfully"
    )
}
export -f validate_project

# Collect all projects with an entry point and config.yaml
get_all_projects() {
    for dir in */; do
        if [ -d "$dir" ]; then
            local project_name="${dir%/}"
            if [ -f "$project_name/$(project_entry "$project_name")" ] && [ -f "$project_name/config.yaml" ]; then
                echo "$project_name"
            fi
        fi
    done
}

case "$cmd" in
    "")
        # Validate all projects in parallel
        echo_header "Validating TypeScript examples"

        projects=$(get_all_projects)

        if [ -z "$projects" ]; then
            echo_stderr "WARNING: No projects found with an entry point and config.yaml"
            exit 0
        fi

        # Use parallel with joblog
        code=0
        echo "$projects" | parallel $PARALLEL_FLAGS --joblog joblog.txt -v --line-buffer --tag validate_project {} || code=$?
        cat joblog.txt

        if [ "$code" -ne 0 ]; then
            echo_stderr "ERROR: Some project(s) failed validation"
            exit 1
        fi

        echo_stderr "✓ All projects validated successfully"
        ;;
    *)
        # Validate specific project(s)
        if [ $# -eq 0 ]; then
            # Single project passed as command
            if ! validate_project "$cmd"; then
                echo_stderr "ERROR: Project '${cmd}' failed validation"
                exit 1
            fi
        else
            # Multiple projects - use parallel
            code=0
            parallel $PARALLEL_FLAGS --joblog joblog.txt -v --line-buffer --tag validate_project {} ::: "$cmd" "$@" || code=$?
            cat joblog.txt

            if [ "$code" -ne 0 ]; then
                echo_stderr "ERROR: Some project(s) failed validation"
                exit 1
            fi
        fi

        echo_stderr "✓ All specified projects validated successfully"
        ;;
esac
