#!/usr/bin/env bash
set -euo pipefail

source "$(git rev-parse --show-toplevel)/ci3/source_bootstrap"
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

export REPO_ROOT=$(git rev-parse --show-toplevel)
export ARTIFACTS_DIR="$REPO_ROOT/docs/target"
: "${AZTEC:?the pinned aztec CLI is not exported: run docs/examples/bootstrap.sh validate-ts}"

# Each project starts from an empty yarn.lock that its own install fills. ci3 exports CI=0, which
# yarn's CI detection treats as CI, turning on immutable installs; `yarn init` then fails its install.
export YARN_ENABLE_IMMUTABLE_INSTALLS=false

# Set parallel flags for concurrent validation
export PARALLEL_FLAGS="-j${PARALLELISM:-4} --halt now,fail=1"

# Ensure all yarn.lock files are empty on exit. The per-project cleanup trap
# handles the normal case, but parallel's --halt can kill jobs before their trap runs.
trap 'for lf in */yarn.lock; do [ -f "$lf" ] && > "$lf"; done' EXIT

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
export -f parse_dependencies

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

    if [ ! -f "$project_name/index.ts" ]; then
        echo_stderr "ERROR: No index.ts found in '${project_name}'"
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
                   node_modules .yarn .yarnrc.yml codegenCache.json \
                   package.json tsconfig.json artifacts 2>/dev/null || true
            # Keep yarn.lock empty to prevent yarn from using parent monorepo's yarn.lock
            > yarn.lock
            return $exit_code
        }
        trap cleanup EXIT

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
                "$AZTEC" codegen "$artifact" -o artifacts
            done < <(yq eval '.contracts[]' config.yaml)
        else
            echo_stderr "No custom contracts for '${project_name}', skipping codegen..."
        fi

        # Setup yarn
        echo_stderr "Setting up yarn for '${project_name}'..."
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
        if [ ! -f "$REPO_ROOT/docs/examples/ts/tsconfig.template.json" ]; then
            echo_stderr "ERROR: tsconfig template not found at '$REPO_ROOT/docs/examples/ts/tsconfig.template.json'"
            return 1
        fi
        cp "$REPO_ROOT/docs/examples/ts/tsconfig.template.json" tsconfig.json

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

# Collect all projects with index.ts and config.yaml
get_all_projects() {
    for dir in */; do
        if [ -d "$dir" ]; then
            local project_name="${dir%/}"
            if [ -f "$project_name/index.ts" ] && [ -f "$project_name/config.yaml" ]; then
                echo "$project_name"
            fi
        fi
    done
}

# In CI, validate all yarn.lock files are committed empty (they must exist but contain no content).
# We check git state (not filesystem) because a previous interrupted validation run may have
# populated lockfiles on disk via yarn add before cleanup could run.
# Locally, the pre-commit hook handles this; here we catch it in case hooks were bypassed.
if [ "${CI:-0}" != "0" ]; then
    for lockfile in */yarn.lock; do
        [ -f "$lockfile" ] || continue
        if [ -n "$(git show HEAD:"docs/examples/ts/$lockfile" 2>/dev/null)" ]; then
            echo_stderr "ERROR: $lockfile is not empty in git. These files must be committed empty."
            echo_stderr "       Run: > $lockfile && git add $lockfile"
            exit 1
        fi
        # Ensure clean filesystem state (may be dirty from a previous interrupted run)
        > "$lockfile"
    done
fi

case "$cmd" in
    "")
        # Validate all projects in parallel
        echo_header "Validating TypeScript examples"

        projects=$(get_all_projects)

        if [ -z "$projects" ]; then
            echo_stderr "WARNING: No projects found with index.ts and config.yaml"
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
