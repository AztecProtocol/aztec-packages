#!/usr/bin/env bash
# Run aztec.js documentation examples against a live local network
#
# Prerequisites:
#   - Local Aztec network running on localhost:8080
#   - yarn-project packages built
#
# Usage:
#   ./run.sh                # Run all examples
#   ./run.sh connection     # Run specific example
#   ./run.sh getting_started advanced  # Run multiple examples
#
# Available examples: connection, getting_started, advanced, authwit, testing, swap, aave_bridge, recursive_verification

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLES_DIR="$(dirname "$SCRIPT_DIR")"
source "$EXAMPLES_DIR/lib.sh"
# Derive repo root from known path (docs/examples/ts/aztecjs_runner) to avoid
# git safe.directory failures when running inside Docker containers.
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
export AZTEC_NODE_URL="${AZTEC_NODE_URL:-http://localhost:8080}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Aztec.js Documentation Examples Test Runner           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if network is running
echo -e "${YELLOW}Checking network connection at $AZTEC_NODE_URL...${NC}"
if ! curl -s "$AZTEC_NODE_URL" > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Cannot connect to Aztec network at $AZTEC_NODE_URL${NC}"
    echo "Please start the network with: aztec start --local-network"
    exit 1
fi
echo -e "${GREEN}✓ Network is running${NC}"
echo ""

# Run `yarn add` with retries. Silences output on early attempts but lets
# stderr surface on the final attempt so transient flakes don't disappear
# under set -euo pipefail (silent rc=1 from setup_project was the root cause
# of the docs-examples merge-queue dequeue on aztecjs_advanced).
yarn_add_with_retry() {
    local max_attempts=3
    local attempt=1
    while [ "$attempt" -lt "$max_attempts" ]; do
        if yarn add "$@" > /dev/null 2>&1; then
            return 0
        fi
        echo -e "${YELLOW}  yarn add attempt $attempt failed, retrying in 5s...${NC}"
        sleep 5
        attempt=$((attempt + 1))
    done
    # Final attempt: surface yarn's output so the failure is visible in CI logs.
    echo -e "${YELLOW}  yarn add attempt $attempt (final, output unsilenced):${NC}"
    yarn add "$@"
}

# Setup function for a project
setup_project() {
    local project_name=$1
    local project_dir="$EXAMPLES_DIR/$project_name"

    echo -e "${YELLOW}Setting up $project_name...${NC}"

    cd "$project_dir"

    # Clean up any previous setup (include codegenCache.json so codegen re-generates artifacts/)
    rm -rf node_modules .yarn package.json tsconfig.json artifacts codegenCache.json 2>/dev/null || true

    # Run codegen for custom contracts if specified in config.yaml
    local contract_count
    contract_count="$(yq eval '.contracts | length' config.yaml 2>/dev/null || echo "0")"

    if [ "$contract_count" -gt 0 ]; then
        local ARTIFACTS_DIR="$REPO_ROOT/docs/target"
        local BUILDER_CLI="$REPO_ROOT/yarn-project/builder/dest/bin/cli.js"

        while IFS= read -r contract_name; do
            local artifact="$ARTIFACTS_DIR/${contract_name}.json"
            if [ ! -f "$artifact" ]; then
                echo -e "${RED}ERROR: Compiled artifact not found: ${artifact}${NC}"
                echo -e "${RED}  The Noir compile step may have failed. Check 'Compile (Noir contracts)' output.${NC}"
                return 1
            fi
            echo -e "  Generating TS interface for ${contract_name}..."
            node --no-warnings "$BUILDER_CLI" codegen "$artifact" -o artifacts
        done < <(yq eval '.contracts[]' config.yaml)

        # Verify codegen produced the expected files
        echo -e "  Generated artifacts:"
        ls -la artifacts/ 2>/dev/null || echo -e "${RED}  ERROR: artifacts/ directory does not exist after codegen${NC}"
    fi

    # Initialize yarn
    yarn init -y > /dev/null 2>&1
    yarn config set nodeLinker node-modules > /dev/null 2>&1

    # Set package type to module for ESM
    node -e "const pkg = require('./package.json'); pkg.type = 'module'; require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));"

    # Read dependencies from config.yaml and install
    parse_dependencies config.yaml "$REPO_ROOT"
    if [ "$PARSED_DEPS_FOUND" = true ]; then
        local all_link_deps=("${AZTEC_DEPS[@]}" "${EXPLICIT_LINK_DEPS[@]}")
        [ ${#all_link_deps[@]} -gt 0 ] && yarn_add_with_retry "${all_link_deps[@]}"
        [ ${#NPM_DEPS[@]} -gt 0 ] && yarn_add_with_retry "${NPM_DEPS[@]}"
    fi

<<<<<<< HEAD
    # Pin typescript to the 5.x line used across the monorepo. An unpinned
    # `yarn add typescript` now resolves to the 7.x native port, whose package
    # layout has no lib/_tsc.js, so yarn 4's builtin compat patch fails to apply.
    yarn_add_with_retry -D "typescript@^5.3.3" tsx
=======
    yarn_add_with_retry -D typescript@^5.3.3 tsx
>>>>>>> origin/v5-next

    # Copy tsconfig
    cp "$EXAMPLES_DIR/tsconfig.template.json" tsconfig.json

    echo -e "${GREEN}✓ $project_name ready${NC}"
}

# Run function for a project
run_project() {
    local project_name=$1
    local project_dir="$EXAMPLES_DIR/$project_name"

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}▶ Running: $project_name${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    cd "$project_dir"

    # Run setup command if specified in config.yaml (e.g., proof generation)
    local setup_cmd
    setup_cmd="$(yq eval '.setup // ""' config.yaml 2>/dev/null)"
    if [ -n "$setup_cmd" ]; then
        echo -e "${YELLOW}Running setup: $setup_cmd${NC}"
        if ! eval "$setup_cmd"; then
            echo -e "${RED}✗ FAIL - $project_name setup failed${NC}"
            return 1
        fi
        echo -e "${GREEN}✓ Setup complete${NC}"
    fi

    local start_time=$(date +%s)
    local max_retries=5

    for attempt in $(seq 1 $max_retries); do
        if npx tsx index.ts; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            echo ""
            echo -e "${GREEN}✓ PASS - $project_name (${duration}s)${NC}"
            return 0
        fi

        if [ "$attempt" -lt "$max_retries" ]; then
            echo -e "${YELLOW}  Attempt $attempt/$max_retries failed, retrying in 10s...${NC}"
            # Clean up PXE data between retries to avoid stale state
            rm -rf "$project_dir/pxe_data_"* "$project_dir/wallet_data_"* 2>/dev/null || true
            sleep 10
        fi
    done

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo ""
    echo -e "${RED}✗ FAIL - $project_name after $max_retries attempts (${duration}s)${NC}"
    return 1
}

# Cleanup function
cleanup_project() {
    local project_name=$1
    local project_dir="$EXAMPLES_DIR/$project_name"

    rm -rf "$project_dir/node_modules" \
           "$project_dir/.yarn" \
           "$project_dir/package.json" \
           "$project_dir/tsconfig.json" \
           "$project_dir/.yarnrc.yml" \
           "$project_dir/artifacts" \
           "$project_dir/codegenCache.json" \
           "$project_dir/data.json" 2>/dev/null || true
    # Keep yarn.lock empty
    > "$project_dir/yarn.lock"
}

# Determine which examples to run
# Note: bob_token_contract and other custom contract examples require verification keys
# which aren't generated during docs compilation, so they're not included by default
if [ $# -eq 0 ]; then
    # aave_bridge disabled: timing out on merge queue (~600s), blocked on proving block 64.
    # See http://ci.aztec-labs.com/aabf2c7e271636a0
    EXAMPLES=("aztecjs_connection" "aztecjs_getting_started" "aztecjs_advanced" "aztecjs_authwit" "aztecjs_testing" "example_swap" "recursive_verification")
else
    EXAMPLES=()
    for arg in "$@"; do
        case "$arg" in
            connection)      EXAMPLES+=("aztecjs_connection") ;;
            getting_started) EXAMPLES+=("aztecjs_getting_started") ;;
            advanced)        EXAMPLES+=("aztecjs_advanced") ;;
            authwit)         EXAMPLES+=("aztecjs_authwit") ;;
            testing)         EXAMPLES+=("aztecjs_testing") ;;
            swap)            EXAMPLES+=("example_swap") ;;
            aave_bridge)     EXAMPLES+=("aave_bridge") ;;
            recursive_verification) EXAMPLES+=("recursive_verification") ;;
            *)
                if [ -d "$EXAMPLES_DIR/aztecjs_$arg" ]; then
                    EXAMPLES+=("aztecjs_$arg")
                elif [ -d "$EXAMPLES_DIR/$arg" ]; then
                    EXAMPLES+=("$arg")
                else
                    echo -e "${RED}Unknown example: $arg${NC}"
                    exit 1
                fi
                ;;
        esac
    done
fi

echo "Running ${#EXAMPLES[@]} example(s): ${EXAMPLES[*]}"
echo ""

# Track results
PASSED=0
FAILED=0
FAILED_EXAMPLES=()

# Setup all projects first
echo -e "${YELLOW}Setting up projects...${NC}"
for example in "${EXAMPLES[@]}"; do
    setup_project "$example"
done
echo ""

# Run all projects
for example in "${EXAMPLES[@]}"; do
    if run_project "$example"; then
        PASSED=$((PASSED + 1))
    else
        FAILED=$((FAILED + 1))
        FAILED_EXAMPLES+=("$example")
    fi
done

# Cleanup
echo ""
echo -e "${YELLOW}Cleaning up...${NC}"
for example in "${EXAMPLES[@]}"; do
    cleanup_project "$example"
done

# Summary
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                           SUMMARY                              ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Passed: ${GREEN}$PASSED${NC}"
echo -e "  Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed examples:${NC}"
    for ex in "${FAILED_EXAMPLES[@]}"; do
        echo -e "  - $ex"
    done
    echo ""
    exit 1
else
    echo -e "${GREEN}✅ All examples passed!${NC}"
    echo ""
    exit 0
fi
