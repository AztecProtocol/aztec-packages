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

    # Check contracts count (can be empty if using pre-built packages like @aztec/noir-contracts.js)
    local contract_count
    contract_count="$(yq eval '.contracts | length' "$config_file")"

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

    if [ ! -f "$project_name/package.json" ]; then
        echo_stderr "ERROR: No package.json found in '${project_name}'"
        return 1
    fi

    if [ ! -f "$project_name/yarn.lock" ] || [ ! -s "$project_name/yarn.lock" ]; then
        echo_stderr "ERROR: yarn.lock missing or empty in '${project_name}'. Run docs/examples/bootstrap.sh refresh-ts-lockfiles."
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

        # Cleanup removes only generated artifacts. The committed package.json,
        # yarn.lock, and .yarnrc.yml stay in place.
        cleanup() {
            local exit_code=$?
            rm -rf node_modules tsconfig.json artifacts codegenCache.json 2>/dev/null || true
            return $exit_code
        }
        trap cleanup EXIT

        # Read contracts from config.yaml (already validated above)
        local contract_count
        contract_count="$(yq eval '.contracts | length' config.yaml)"

        if [ "$contract_count" -gt 0 ]; then
            echo_stderr "Running codegen for '${project_name}'..."
            local contract_name
            while IFS= read -r contract_name; do
                local artifact="$ARTIFACTS_DIR/${contract_name}.json"
                echo_stderr "  - ${contract_name}..."
                node --no-warnings "$BUILDER_CLI" codegen "$artifact" -o artifacts
            done < <(yq eval '.contracts[]' config.yaml)
        fi

        # Verify every link: target in package.json exists and has built .d.ts
        # output. Yarn's --immutable check pins versions but doesn't validate
        # that link targets resolve, so we check explicitly.
        echo_stderr "Verifying linked packages for '${project_name}'..."
        local link_errors=0
        while IFS=$'\t' read -r pkg_name link_path; do
            [ -z "$pkg_name" ] && continue
            local link_target
            link_target="$(cd "$(dirname package.json)" && cd "$link_path" 2>/dev/null && pwd)" || link_target=""
            if [ -z "$link_target" ] || [ ! -d "$link_target" ]; then
                echo_stderr "  ✗ $pkg_name: link target missing ($link_path)"
                link_errors=$((link_errors + 1))
                continue
            fi
            local dts_count=0
            local check_dir
            for check_dir in dest lib nodejs web; do
                if [ -d "$link_target/$check_dir" ]; then
                    dts_count=$(find "$link_target/$check_dir" -name "*.d.ts" 2>/dev/null | wc -l)
                    [ "$dts_count" -gt 0 ] && break
                fi
            done
            if [ "$dts_count" -eq 0 ]; then
                echo_stderr "  ✗ $pkg_name: no .d.ts files under $link_target/{dest,lib,nodejs,web}"
                link_errors=$((link_errors + 1))
                continue
            fi
            echo_stderr "  ✓ $pkg_name: $dts_count .d.ts files"
        done < <(node -e '
            const pkg = require("./package.json");
            for (const [n, v] of Object.entries(pkg.dependencies || {})) {
                if (typeof v === "string" && v.startsWith("link:")) {
                    process.stdout.write(n + "\t" + v.slice(5) + "\n");
                }
            }
        ')
        if [ "$link_errors" -gt 0 ]; then
            return 1
        fi

        # Install with --immutable. The committed yarn.lock pins all third-party
        # transitive deps; if a regen is needed the message points to the
        # refresh subcommand.
        echo_stderr "Installing dependencies for '${project_name}'..."
        if ! yarn install --immutable; then
            echo_stderr "ERROR: yarn install --immutable failed for '${project_name}'."
            echo_stderr "       If this is due to a dep change, run: docs/examples/bootstrap.sh refresh-ts-lockfiles"
            return 1
        fi

        # Create tsconfig.json from template
        if [ ! -f "$REPO_ROOT/docs/examples/ts/tsconfig.template.json" ]; then
            echo_stderr "ERROR: tsconfig template not found at '$REPO_ROOT/docs/examples/ts/tsconfig.template.json'"
            return 1
        fi
        cp "$REPO_ROOT/docs/examples/ts/tsconfig.template.json" tsconfig.json

        # Type check. yarn tsc only invokes the locally-installed binary;
        # npx tsc would fall back to a registry install if missing, which
        # bypasses the lockfile.
        echo_stderr "Type checking '${project_name}'..."
        if ! yarn tsc --noEmit; then
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

# Lint: every example must declare typescript and tsx as devDeps, with the
# same range across all examples. Hand-edited package.jsons across eleven
# examples are otherwise prone to drift and silent omissions; presence-check
# guards against an example that "passes" by missing the binary entirely
# (which would let npm-fallback resolution kick in via shell).
lint_shared_devdep_versions() {
    node -e '
        const { readdirSync, readFileSync, existsSync } = require("fs");
        const SHARED = ["typescript", "tsx"];
        const seen = Object.fromEntries(SHARED.map((k) => [k, new Map()]));
        const missing = [];
        for (const d of readdirSync(".", { withFileTypes: true })) {
            if (!d.isDirectory()) continue;
            const path = `${d.name}/package.json`;
            if (!existsSync(path)) continue;
            const pkg = JSON.parse(readFileSync(path, "utf8"));
            for (const k of SHARED) {
                const v = (pkg.devDependencies || {})[k];
                if (v === undefined) {
                    missing.push(`${d.name} (missing ${k})`);
                    continue;
                }
                if (!seen[k].has(v)) seen[k].set(v, []);
                seen[k].get(v).push(d.name);
            }
        }
        let bad = false;
        for (const k of SHARED) {
            if (seen[k].size > 1) {
                bad = true;
                console.error(`ERROR: ${k} version drift across docs/examples/ts/*:`);
                for (const [v, dirs] of seen[k]) console.error(`  ${v}: ${dirs.join(", ")}`);
            }
        }
        if (missing.length) {
            bad = true;
            console.error(`ERROR: required devDependency missing in docs/examples/ts/*:`);
            for (const m of missing) console.error(`  ${m}`);
        }
        if (bad) process.exit(1);
    '
}

case "$cmd" in
    "")
        # Validate all projects in parallel
        echo_header "Validating TypeScript examples"

        if ! lint_shared_devdep_versions; then
            exit 1
        fi

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
