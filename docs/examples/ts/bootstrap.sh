#!/usr/bin/env bash
set -euo pipefail

source "$(git rev-parse --show-toplevel)/ci3/source_bootstrap"

export REPO_ROOT=$(git rev-parse --show-toplevel)
export ARTIFACTS_DIR="$REPO_ROOT/docs/target"
export BUILDER_CLI="$REPO_ROOT/yarn-project/builder/dest/bin/cli.js"

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

    # Check contracts array is not empty
    local contract_count
    contract_count="$(yq eval '.contracts | length' "$config_file")"
    if [ "$contract_count" -eq 0 ]; then
        echo_stderr "ERROR: No contracts specified in '${config_file}'"
        return 1
    fi

    # Check dependencies section exists and is an array (!!seq in YAML)
    local deps_type
    deps_type="$(yq eval '.dependencies | type' "$config_file" 2>/dev/null)"
    if [ "$deps_type" != "!!seq" ]; then
        echo_stderr "ERROR: Missing or invalid 'dependencies' array in '${config_file}' (got: ${deps_type})"
        return 1
    fi

    # Validate all contract artifacts exist
    local contract_name
    while IFS= read -r contract_name; do
        local artifact="$ARTIFACTS_DIR/${contract_name}.json"
        if [ ! -f "$artifact" ]; then
            echo_stderr "ERROR: Artifact not found for '${project_name}': ${artifact}"
            return 1
        fi
    done < <(yq eval '.contracts[]' "$config_file")

    return 0
}
export -f validate_config

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
        echo_stderr "Compiling contracts for '${project_name}'..."

        # Process each contract
        local contract_name
        while IFS= read -r contract_name; do
            local artifact="$ARTIFACTS_DIR/${contract_name}.json"
            echo_stderr "Running codegen for '${contract_name}'..."
            node --no-warnings "$BUILDER_CLI" codegen "$artifact" -o artifacts
        done < <(yq eval '.contracts[]' config.yaml)

        # Setup yarn
        echo_stderr "Setting up yarn for '${project_name}'..."
        yarn init -y >/dev/null 2>&1
        yarn config set nodeLinker node-modules >/dev/null 2>&1

        # Set package type to module for ESM support
        node -e "const pkg = require('./package.json'); pkg.type = 'module'; require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));"

        # Read dependencies from config.yaml
        echo_stderr "Installing dependencies for '${project_name}'..."

        # Separate @aztec packages (linked) from npm packages (external)
        local aztec_deps=()
        local npm_deps=()
        local pkg
        local has_deps=false

        while IFS= read -r pkg; do
            has_deps=true
            # Remove quotes and whitespace
            pkg="${pkg//\"/}"
            pkg="${pkg#"${pkg%%[![:space:]]*}"}"  # ltrim
            pkg="${pkg%"${pkg##*[![:space:]]}"}"  # rtrim

            if [ -z "$pkg" ]; then
                continue
            fi

            # Check if it's an external npm package (prefixed with npm:)
            if [[ "$pkg" =~ ^npm: ]]; then
                # External package: npm:viem -> viem
                local npm_pkg="${pkg#npm:}"
                npm_deps+=("$npm_pkg")
            elif [[ "$pkg" =~ ^@ ]]; then
                # @aztec/* package - auto-link from yarn-project/
                local pkg_name="${pkg#@aztec/}"
                aztec_deps+=("${pkg}@link:$REPO_ROOT/yarn-project/${pkg_name}")
            else
                echo_stderr "Warning: Unknown dependency format '$pkg' (use '@aztec/pkg' or 'npm:pkg')"
            fi
        done < <(yq eval '.dependencies[]' config.yaml)

        if [ "$has_deps" = true ]; then
            # Install linked @aztec dependencies
            if [ ${#aztec_deps[@]} -gt 0 ]; then
                yarn add "${aztec_deps[@]}" >/dev/null 2>&1
            fi

            # Install external npm dependencies
            if [ ${#npm_deps[@]} -gt 0 ]; then
                yarn add "${npm_deps[@]}" >/dev/null 2>&1
            fi
        else
            # Fallback to default dependencies if none specified
            echo_stderr "No dependencies in config.yaml, using defaults..."
            yarn add \
                @aztec/aztec.js@link:$REPO_ROOT/yarn-project/aztec.js \
                @aztec/accounts@link:$REPO_ROOT/yarn-project/accounts \
                @aztec/test-wallet@link:$REPO_ROOT/yarn-project/test-wallet \
                @aztec/kv-store@link:$REPO_ROOT/yarn-project/kv-store \
                >/dev/null 2>&1
        fi

        yarn add -D typescript >/dev/null 2>&1

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

# Main logic
cmd=${1:-}
shift || true

case "$cmd" in
    ""|"full"|"fast")
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
