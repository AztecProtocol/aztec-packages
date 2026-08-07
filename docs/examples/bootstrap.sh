#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Get repo root for absolute paths
REPO_ROOT=$(git rev-parse --show-toplevel)

export BB=${BB:-"$REPO_ROOT/labs-aztec-toolchain/bin/bb"}
export NARGO=${NARGO:-"$REPO_ROOT/labs-aztec-toolchain/bin/nargo"}
AZTEC_TOOLCHAIN_HASH=${AZTEC_TOOLCHAIN_HASH:-$("$REPO_ROOT/labs-aztec-toolchain/bootstrap.sh" hash)}
export AZTEC_TOOLCHAIN_HASH

# Safety net: ensure all TS example yarn.lock files are empty on exit.
# Both validate-ts and execute-examples (via Docker volume mount) can populate
# these files, and their per-project cleanup may not run if processes are killed.
trap 'for lf in "$REPO_ROOT"/docs/examples/ts/*/yarn.lock; do [ -f "$lf" ] && > "$lf"; done' EXIT

hash=$(hash_str \
  $AZTEC_TOOLCHAIN_HASH \
  $(cache_content_hash .rebuild_patterns))

function compile-circuits {
  echo_header "Compiling vanilla Noir circuits"
  local CIRCUITS_DIR="$REPO_ROOT/docs/examples/circuits"

  if [ ! -d "$CIRCUITS_DIR" ]; then
    echo_stderr "No circuits directory found at $CIRCUITS_DIR"
    return 0
  fi

  if [ ! -f "$CIRCUITS_DIR/Nargo.toml" ]; then
    echo_stderr "No workspace Nargo.toml found in $CIRCUITS_DIR"
    return 0
  fi

  # Compile vanilla circuits (not contracts - those are compiled separately).
  # nargo walks up to docs/Nargo.toml, so we compile specific packages.
  echo_stderr "Compiling circuits..."
  local circuit
  for circuit in "$CIRCUITS_DIR"/*/; do
    local name=$(basename "$circuit")
    if [ -f "$circuit/Nargo.toml" ]; then
      echo_stderr "  Compiling $name..."
      (cd "$REPO_ROOT/docs" && $NARGO compile --package "$name")
    fi
  done
}

function compile {
  echo_header "Compiling example contracts"
  local CONTRACTS_DIR="$REPO_ROOT/docs/examples/contracts"

  if [ ! -d "$CONTRACTS_DIR" ]; then
    echo_stderr "No contracts directory found at $CONTRACTS_DIR"
    return 0
  fi

  local contracts=()
  if [ "$#" -gt 0 ]; then
    local contract
    for contract in "$@"; do
      if [[ "$contract" == */* ]]; then
        contracts+=("$contract")
      else
        contracts+=("contracts/$contract")
      fi
    done
  else
    local contract
    for contract in "$CONTRACTS_DIR"/*/; do
      if [ -f "$contract/Nargo.toml" ] && grep -q '^type = "contract"' "$contract/Nargo.toml"; then
        contracts+=("contracts/$(basename "$contract")")
      fi
    done
  fi

  # Use noir-contracts bootstrap with DOCS_WORKING_DIR pointing to parent (docs/).
  # Pass only contract packages so circuits in the shared docs workspace are not
  # treated as contract artifacts by the noir-contracts bootstrap.
  DOCS_WORKING_DIR="$(cd .. && pwd)" \
    $REPO_ROOT/noir-projects/labs/noir-contracts/bootstrap.sh compile "${contracts[@]}"
}

function compile-solidity {
  echo_header "Compiling Solidity examples"
  local SOLIDITY_DIR="$REPO_ROOT/docs/examples/solidity"
  local OUTPUT_DIR="$REPO_ROOT/docs/target/solidity"

  # The examples compile against the l1-contracts sources shipped in the
  # @aztec/l1-artifacts package (see foundry.toml), so docs' node_modules
  # must be populated. Unconditional so that a pin bump refreshes an
  # existing node_modules instead of compiling against stale sources.
  (cd "$REPO_ROOT/docs" && npm_install_deps)

  # Find all .sol files recursively
  local sol_files
  sol_files=$(find "$SOLIDITY_DIR" -name "*.sol" 2>/dev/null)
  if [ -z "$sol_files" ]; then
    echo_stderr "No Solidity files found in $SOLIDITY_DIR"
    return 0
  fi

  mkdir -p "$OUTPUT_DIR"

  # Compile using the local foundry.toml with proper remappings
  (
    cd "$SOLIDITY_DIR"
    for subdir in */; do
      if [ -d "$subdir" ] && ls "$subdir"/*.sol >/dev/null 2>&1; then
        local subdir_name=$(basename "$subdir")
        echo_stderr "Compiling $subdir_name..."
        # On a cold ~/.svm, forge downloads the pinned solc from
        # binaries.soliditylang.org, which intermittently fails to resolve
        # under heavy parallel CI load (same failure mode l1-contracts'
        # download_solc rides out). Retry on connection/DNS failures only so
        # a genuine build error still fails fast.
        RETRY_ATTEMPTS=30 RETRY_SLEEP=10 retry -p 'dns error|Temporary failure in name resolution|error sending request|failed to lookup address|Connection refused|connection reset' \
          "forge build --contracts \"$subdir\" --out \"$OUTPUT_DIR/$subdir_name\" --no-cache"
      fi
    done
  )

  echo_stderr "Solidity artifacts written to $OUTPUT_DIR"
}

function validate-ts {
  echo_header "Validating TypeScript examples"
  (cd ts && ./bootstrap.sh "$@")
}

function validate-webapp-tutorial {
  echo_header "Validating webapp-tutorial build"
  local TUTORIAL_DIR="$REPO_ROOT/docs/examples/webapp-tutorial"
  local ARTIFACTS_DIR="$REPO_ROOT/docs/target"
  local BUILDER_CLI="$REPO_ROOT/yarn-project/builder/dest/bin/cli.js"
  local YP="$REPO_ROOT/yarn-project"

  # Compile the pod_racing_contract (uses existing compile infrastructure)
  compile webapp-tutorial/contracts

  (
    cd "$TUTORIAL_DIR"

    # Backup package.json (the only tracked file we mutate). yarn.lock is
    # gitignored and regenerated on each run, so we don't back it up.
    cp package.json package.json.bak

    cleanup() {
      local exit_code=$?
      echo_stderr "Cleaning up webapp-tutorial..."
      [ -f package.json.bak ] && mv package.json.bak package.json
      rm -rf node_modules .yarn yarn.lock .yarnrc.yml 2>/dev/null || true
      return $exit_code
    }
    trap cleanup EXIT

    # Start from a fresh node_modules / lock so we don't reuse state from
    # a previous run that may have been interrupted mid-cleanup.
    # An empty yarn.lock is required to mark this directory as a standalone
    # yarn project; otherwise yarn 4 walks up to docs/ and refuses to install
    # because webapp-tutorial isn't listed as a workspace there.
    rm -rf node_modules .yarn .yarnrc.yml
    : > yarn.lock

    # Replace #include_aztec_version with link: paths to local workspace
    # packages. link: does not install workspace transitive deps, so add the
    # local @aztec dependency closure that published npm packages would bring in.
    echo_stderr "Linking local @aztec packages..."
    REPO_ROOT="$REPO_ROOT" YP="$YP" node <<'NODE'
      const fs = require('fs');
      const path = require('path');

      const repoRoot = process.env.REPO_ROOT;
      const yp = process.env.YP;
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const packageDirs = new Map();

      function addPackageDir(dir) {
        const pkgPath = path.join(dir, 'package.json');
        if (!fs.existsSync(pkgPath)) return;
        const manifest = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (manifest.name?.startsWith('@aztec/')) {
          packageDirs.set(manifest.name, dir);
        }
      }

      for (const base of [yp, path.join(repoRoot, 'barretenberg/ts')]) {
        if (!fs.existsSync(base)) continue;
        addPackageDir(base);
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
          if (entry.isDirectory()) addPackageDir(path.join(base, entry.name));
        }
      }

      // yarn-project pins the @aztec packages built outside it (e.g. @aztec/bb.js,
      // @aztec/ipc-runtime, @aztec/wsdb, @aztec/noir-*) to published npm versions via
      // its root resolutions. Workspace manifests declare those with placeholder
      // versions that only the resolutions rewrite, so mirror the pins here: consume
      // them from npm at the pinned version, never link them. Path-based entries
      // (portal:/file:) still resolve to local dirs for the closure walk.
      const rootManifest = JSON.parse(fs.readFileSync(path.join(yp, 'package.json'), 'utf8'));
      const npmPins = new Map();
      for (const [name, ver] of Object.entries(rootManifest.resolutions || {})) {
        if (!name.startsWith('@aztec/')) continue;
        const m = /^(portal:|file:)(.*)$/.exec(String(ver));
        if (m) addPackageDir(path.resolve(yp, m[2]));
        else npmPins.set(name, String(ver));
      }

      function setLinkedDependency(name, dir) {
        let replaced = false;
        for (const section of ['dependencies', 'devDependencies']) {
          if (pkg[section]?.[name]) {
            pkg[section][name] = 'link:' + dir;
            replaced = true;
          }
        }
        if (!replaced) {
          pkg.dependencies ??= {};
          pkg.dependencies[name] = 'link:' + dir;
        }
      }

      function addNpmDependency(name, ver) {
        if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) return;
        ver = String(ver);
        if (ver.startsWith('workspace:') || ver.startsWith('portal:') || ver.startsWith('file:')) return;
        pkg.dependencies ??= {};
        pkg.dependencies[name] = ver;
      }

      function registerLocalDependency(ownerDir, dep, ver) {
        if (!dep.startsWith('@aztec/')) return false;
        ver = String(ver);

        if (ver.startsWith('workspace:')) {
          return packageDirs.has(dep);
        }

        if (ver.startsWith('portal:') || ver.startsWith('file:')) {
          addPackageDir(path.resolve(ownerDir, ver.replace(/^(portal:|file:)/, '')));
          return packageDirs.has(dep);
        }

        return false;
      }

      const queue = [];
      const queued = new Set();
      for (const section of ['dependencies', 'devDependencies']) {
        for (const [name, ver] of Object.entries(pkg[section] || {})) {
          if (ver === '#include_aztec_version' && name.startsWith('@aztec/')) {
            if (npmPins.has(name)) {
              pkg[section][name] = npmPins.get(name);
            } else {
              queue.push(name);
              queued.add(name);
            }
          }
        }
      }

      for (let i = 0; i < queue.length; i++) {
        const name = queue[i];
        const dir = packageDirs.get(name);
        if (!dir) {
          throw new Error(`Could not find local package for ${name}`);
        }
        setLinkedDependency(name, dir);

        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        for (const section of ['dependencies', 'peerDependencies']) {
          for (const [dep, ver] of Object.entries(manifest[section] || {})) {
            // Pinned packages always come from npm at the pinned version, matching
            // how yarn-project's own resolutions rewrite them; the declared version
            // is a placeholder and a local dir (if any) is not what workspaces use.
            if (npmPins.has(dep)) {
              if (section === 'dependencies') addNpmDependency(dep, npmPins.get(dep));
              continue;
            }
            // Link any @aztec dep we have a local dir for — either resolved by
            // version (workspace:/portal:/file:) or discovered as a local portal
            // in the root resolutions above. Otherwise it's a published npm dep.
            const localByDir = dep.startsWith('@aztec/') && packageDirs.has(dep);
            if (!queued.has(dep) && (registerLocalDependency(dir, dep, ver) || localByDir)) {
              queue.push(dep);
              queued.add(dep);
            } else if (section === 'dependencies') {
              addNpmDependency(dep, ver);
            }
          }
        }
      }

      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
NODE

    # Fresh yarn setup for linking
    yarn config set nodeLinker node-modules 2>/dev/null || true
    # Yarn 4 auto-enables --immutable when CI is set; we intentionally start
    # with an empty yarn.lock that this install populates, so disable that.
    YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn install

    # yarn's `link:` protocol creates portals into yarn-project/*, which require
    # --preserve-symlinks for Node's ESM loader to resolve dependencies correctly
    # (vite in particular fails to load its config without it).
    export NODE_OPTIONS="${NODE_OPTIONS:-} --preserve-symlinks"

    # Copy compiled contract artifact and run codegen
    mkdir -p src/artifacts
    local artifact="$ARTIFACTS_DIR/pod_racing_contract-PodRacing.json"
    if [ ! -f "$artifact" ]; then
      echo_stderr "ERROR: Contract artifact not found at $artifact"
      return 1
    fi
    cp "$artifact" src/artifacts/
    node --no-warnings "$BUILDER_CLI" codegen "$artifact" -o src/artifacts

    # Type check (build mode follows project references in tsconfig.json)
    echo_stderr "Type checking webapp-tutorial..."
    npx tsc -b --noEmit

    # Vite production build
    echo_stderr "Running vite build..."
    npx vite build

    echo_stderr "webapp-tutorial validated successfully"
  )
}

function execute-examples {
  echo_header "Executing TypeScript documentation examples"
  local COMPOSE_DIR="$REPO_ROOT/docs/examples/ts"
  run_compose_test "docs_examples" "docs-examples" "$COMPOSE_DIR"
}

# Runs the Noir TXE tests for the example test packages (the type = "lib" packages
# that the `compile` step skips). A local TXE server resolves the foreign calls the
# tests make: account creation, deployment, and private/utility execution.
function test-contracts {
  echo_header "Testing example contracts (TXE)"
  local test_packages=("counter_contract_test" "logging_example_test")
  local txe_port=${TXE_PORT:-14745}

  # Run in a subshell so the EXIT trap that stops the TXE is scoped to this step.
  (
    set -euo pipefail
    if command -v check_port >/dev/null 2>&1; then
      check_port "$txe_port" || {
        echo_stderr "Cannot start TXE: port $txe_port is already in use."
        exit 1
      }
    fi
    cd "$REPO_ROOT/yarn-project/txe"
    UV_THREADPOOL_SIZE=8 LOG_LEVEL=silent TXE_PORT="$txe_port" yarn start >/dev/null &
    txe_pid=$!
    trap 'kill "$txe_pid" &>/dev/null || true' EXIT

    echo_stderr "Waiting for TXE to start on port $txe_port..."
    j=0
    while ! nc -z 127.0.0.1 "$txe_port" &>/dev/null; do
      [ "$j" -ge 60 ] && {
        echo_stderr "TXE failed to start on port $txe_port after 60s."
        exit 1
      }
      sleep 1
      j=$((j + 1))
    done

    export RAYON_NUM_THREADS=1
    export NARGO_FOREIGN_CALL_TIMEOUT=300000
    cd "$REPO_ROOT/docs"
    for pkg in "${test_packages[@]}"; do
      echo_stderr "Running $pkg..."
      $NARGO test --silence-warnings --skip-brillig-constraints-check \
        --oracle-resolver "http://127.0.0.1:$txe_port" --package "$pkg"
    done
  )
}

function test_cmds {
  # Bumped from the default 600s by ~50% (now 15m) to absorb cumulative-runtime growth
  # under merge-queue load — example_swap's `wait-for-proven` poll was tipping SIGTERM
  # near the old limit. See PR #23253 dequeue log http://ci.aztec-labs.com/b08ac48286302949.
  echo "$hash:ONLY_TERM_PARENT=1:TIMEOUT=15m docs/examples/bootstrap.sh execute"
  echo "$hash:ONLY_TERM_PARENT=1 docs/examples/bootstrap.sh test-contracts"
}

function test {
  echo_header "docs examples test"
  test_cmds | filter_test_cmds | parallelize
}

##############################################################################
# CI failure handling - send Slack notifications instead of blocking the build
##############################################################################

# Get PR number (returns empty string if not in PR context)
function get_pr_number {
  if [[ -z "${CI:-}" ]] || ! command -v gh &>/dev/null; then
    return
  fi

  local branch="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"

  if [[ -n "$branch" && "$branch" != "HEAD" ]]; then
    gh pr list --head "$branch" --json number --jq '.[0].number' 2>/dev/null || echo "Failed to query PR number from branch $branch" >&2
  fi
}

function send_slack_message {
  local message=$1
  local channel=${2:-"#docs-alerts"}
  if [[ -z "${AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN:-}" ]]; then
    echo "AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN not set, skipping Slack notification"
    return 0
  fi

  local data
  data=$(jq -n --arg channel "$channel" --arg text "$message" \
    '{channel: $channel, text: $text}')

  local response
  if ! response=$(curl -s --fail-with-body -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $AZTEC_FOUNDATION_CI_SLACK_BOT_TOKEN" \
    -H "Content-type: application/json" \
    --data "$data"); then
    echo "Slack API request failed (curl error)" >&2
    return 1
  fi

  local ok
  if ! ok=$(echo "$response" | jq -r '.ok' 2>/dev/null); then
    echo "Slack API returned invalid JSON: $response" >&2
    return 1
  fi

  if [[ "$ok" != "true" ]]; then
    local error
    error=$(echo "$response" | jq -r '.error // "unknown error"' 2>/dev/null)
    echo "Slack API error: $error" >&2
    return 1
  fi

  return 0
}

# Arrays to collect failures across all steps
FAILED_STEPS=()
FAILED_OUTPUTS=()

# Run a step with retry, collect failure if it fails
function run_step {
  local step_name=$1
  local step_func=$2
  local output exit_code

  # Disable errexit only around the assignment so we can capture the exit code.
  # Re-enable it inside the command substitution; otherwise step functions can
  # continue after a failing command and report success.
  set +e
  output=$(set -e; "$step_func" 2>&1)
  exit_code=$?
  set -e
  echo "$output"

  # Retry once on failure
  if [[ $exit_code -ne 0 ]]; then
    echo "WARNING: $step_name failed (exit code $exit_code), retrying..."
    set +e
    output=$(set -e; "$step_func" 2>&1)
    exit_code=$?
    set -e
    echo "$output"
  fi

  if [[ $exit_code -ne 0 ]]; then
    echo "WARNING: $step_name failed after retry (exit code $exit_code)"
    FAILED_STEPS+=("$step_name")
    FAILED_OUTPUTS+=("$output")
  fi
}

# Send a consolidated Slack message for all failed steps
function send_failure_slack_message {
  local branch="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")}"
  local context="branch: \`${branch}\`"

  local pr_number
  pr_number=$(get_pr_number)
  if [[ -n "$pr_number" ]]; then
    local pr_url
    pr_url=$(gh pr view "$pr_number" --json url --jq '.url' 2>/dev/null || echo "")
    if [[ -n "$pr_url" ]]; then
      context="<${pr_url}|PR #${pr_number}>"
    else
      context="PR #${pr_number}"
    fi
  fi

  local max_chars_per_failure=$((2500 / ${#FAILED_STEPS[@]}))
  local message=":warning: *Docs Examples Validation Failed* (${context})"$'\n\n'

  for i in "${!FAILED_STEPS[@]}"; do
    local output="${FAILED_OUTPUTS[$i]}"
    if [[ ${#output} -gt $max_chars_per_failure ]]; then
      output="(truncated)..."$'\n'"${output: -$max_chars_per_failure}"
    fi
    message+="*${FAILED_STEPS[$i]}*"$'\n'"\`\`\`"$'\n'"$output"$'\n'"\`\`\`"$'\n\n'
  done

  message+="*Action required:* Please fix the docs examples or update them to match the current API."

  send_slack_message "$message"
}

case "$cmd" in
  "")
    run_step "Compile (Noir circuits)" compile-circuits
    run_step "Compile (Noir contracts)" compile
    run_step "Compile (Solidity)" compile-solidity
    run_step "TypeScript validation" validate-ts
    run_step "Webapp tutorial build" validate-webapp-tutorial

    if [[ ${#FAILED_STEPS[@]} -gt 0 ]]; then
      send_failure_slack_message

      # Print a prominent error summary at the bottom of the log
      echo ""
      echo "============================================================"
      echo "  DOCS EXAMPLES FAILURE SUMMARY"
      echo "============================================================"
      for i in "${!FAILED_STEPS[@]}"; do
        echo ""
        echo "--- FAILED: ${FAILED_STEPS[$i]} ---"
        # Extract lines containing 'error' or 'ERROR' for a concise summary
        error_lines=$(echo "${FAILED_OUTPUTS[$i]}" | grep -i 'error' || true)
        if [[ -n "$error_lines" ]]; then
          echo "$error_lines"
        else
          # If no error lines found, show the last 20 lines of output
          echo "${FAILED_OUTPUTS[$i]}" | tail -20
        fi
      done
      echo ""
      echo "============================================================"
      echo ""

      # Block PRs on failure, but allow merge queue to proceed (may be transient infra issues)
      if [[ ! "$REF_NAME" =~ ^gh-readonly-queue/ ]]; then
        echo "ERROR: Docs examples validation failed. Failing the build."
        exit 1
      fi
    fi
    ;;
  "hash")
    echo "$hash"
    ;;
  compile-circuits)
    compile-circuits
    ;;
  compile-solidity)
    compile-solidity
    ;;
  execute)
    execute-examples
    ;;
  test-contracts)
    test-contracts
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
