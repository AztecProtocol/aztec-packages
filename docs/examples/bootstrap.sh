#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Get repo root for absolute paths
REPO_ROOT=$(git rev-parse --show-toplevel)

# The examples build with the published toolchain docs/aztec-node.json pins. Their Nargo.toml path
# dependencies name the default checkout (docs/.aztec-node/tree), so an AZTEC_NODE_DIR override never applies.
unset AZTEC_NODE_DIR

# `--line <line> [cmd]` builds a dev line's examples (docs/lines/<line>/) with its pin instead of main's.
# nargo takes the topmost Nargo.toml as its workspace, so a line cannot build under docs/: its
# Nargo.toml and examples are staged outside the repository in a copy that mirrors docs/, with the
# line's .aztec-node (checkout and toolchain) and l1-artifacts linked in where docs/ has its own.
# DOCS_ROOT is where the examples build; DOCS_PATH is their source's path in the repository.
DOCS_LINE= STAGE= DOCS_ROOT=

# Safety net: ensure all TS example yarn.lock files are empty on exit.
# Both validate-ts and execute-examples (via Docker volume mount) can populate
# these files, and their per-project cleanup may not run if processes are killed.
# Set before staging, so a failed copy also removes the stage.
function on_exit {
  if [ -n "$DOCS_ROOT" ]; then
    for lf in "$DOCS_ROOT"/examples/ts/*/yarn.lock; do [ -f "$lf" ] && > "$lf"; done
  fi
  if [ -n "$STAGE" ]; then rm -rf "$STAGE"; fi
}
trap on_exit EXIT

aztec_node=(node "$REPO_ROOT/docs/scripts/aztec_node.mts")
if [ "$cmd" = --line ]; then
  DOCS_LINE=${1:?usage: examples/bootstrap.sh --line <line> [cmd]}
  shift
  cmd=${1:-}
  [ -n "$cmd" ] && shift
  export DOCS_PATH=docs/lines/$DOCS_LINE
  line_root=$REPO_ROOT/$DOCS_PATH
  if [[ ! "$DOCS_LINE" =~ ^v[0-9]+$ ]] || [ ! -f "$line_root/aztec-node.json" ]; then
    echo_stderr "No line $DOCS_LINE: a line is a docs/lines/v<major>/ directory holding an aztec-node.json."
    exit 1
  fi
  aztec_node+=(--line "$DOCS_LINE")
  # On disk rather than in /tmp: the contract artifacts are large. A release cut runs a line's
  # examples one step at a time, so DOCS_LINE_STAGE names a stage it keeps across runs (and removes
  # itself): later steps find what earlier ones compiled.
  if [ -n "${DOCS_LINE_STAGE:-}" ]; then
    stage=$DOCS_LINE_STAGE
  else
    mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}"
    STAGE=$(mktemp -d "${XDG_CACHE_HOME:-$HOME/.cache}/aztec-docs-$DOCS_LINE.XXXXXX")
    stage=$STAGE
  fi
  mkdir -p "$stage/node_modules/@aztec-foundation"
  cp -R "$line_root/Nargo.toml" "$line_root/examples" "$REPO_ROOT/docs/.yarnrc.yml" "$stage/"
  # The links may dangle until pin_toolchain fetches the line.
  ln -sfn "$line_root/.aztec-node" "$stage/.aztec-node"
  ln -sfn "$line_root/.aztec-node/l1-artifacts" "$stage/node_modules/@aztec-foundation/l1-artifacts"
  export DOCS_ROOT=$stage
else
  export DOCS_PATH=docs DOCS_ROOT=$REPO_ROOT/docs
fi

# The pin names the aztec-node commit and every toolchain version, so it keys the examples.
hash=$(cache_content_hash .rebuild_patterns)

# Fetches the pinned checkout, installs the pinned nargo, bb and aztec CLI, and exports NARGO, BB, AZTEC
# and the versions. Each step is a local check when already current, so concurrent test commands only read.
function pin_toolchain {
  local pin
  "${aztec_node[@]}" fetch
  "${aztec_node[@]}" provision nargo bb cli
  pin=$("${aztec_node[@]}" env)
  eval "$pin"
}

# Compiles one example contract (a path under docs/) as aztec-nr compiles its own: nargo with the same
# checks, then bb transpiles the public functions and adds verification keys. `aztec compile` would skip
# a package whenever target/ already holds a newer artifact of another one, so it is not used here.
function compile_contract {
  set -euo pipefail
  local dir=$1 package contract json
  package=$(sed -n -E 's/^name *= *"([^"]+)".*/\1/p' "$dir/Nargo.toml")
  contract=$(awk '/^contract / { print $2 } /^pub contract / { print $3 }' "$dir/src/main.nr")
  json=target/$package-$contract.json
  "$NARGO" compile --package "$package" --inliner-aggressiveness 0 \
    --skip-underconstrained-check --skip-brillig-constraints-check --deny-warnings
  "$BB" aztec_process -i "$json"
  jq --arg v "$AZTEC_VERSION" '.aztec_version = $v' "$json" >"$json.tmp"
  mv "$json.tmp" "$json"
}
export -f compile_contract

function compile-circuits {
  echo_header "Compiling vanilla Noir circuits"
  pin_toolchain
  local CIRCUITS_DIR="$DOCS_ROOT/examples/circuits"

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
      (cd "$DOCS_ROOT" && $NARGO compile --package "$name")
    fi
  done
}

function compile {
  echo_header "Compiling example contracts"
  pin_toolchain
  local CONTRACTS_DIR="$DOCS_ROOT/examples/contracts"

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

  # nargo resolves packages from the docs/ workspace, so it runs there.
  (
    cd "$DOCS_ROOT"
    parallel -j"${PARALLELISM:-4}" --halt now,fail=1 --line-buffer --tag compile_contract examples/{} ::: "${contracts[@]}"
  )
}

function compile-solidity {
  echo_header "Compiling Solidity examples"
  local SOLIDITY_DIR="$DOCS_ROOT/examples/solidity"
  local OUTPUT_DIR="$DOCS_ROOT/target/solidity"

  # The examples compile against the l1-contracts sources shipped in the
  # @aztec-foundation/l1-artifacts package (see foundry.toml), so docs' node_modules
  # must be populated. Unconditional so that a pin bump refreshes an
  # existing node_modules instead of compiling against stale sources. A line's
  # copy is the one its fetch provisions, linked into the stage.
  if [ -n "$DOCS_LINE" ]; then
    "${aztec_node[@]}" fetch
  else
    (cd "$DOCS_ROOT" && npm_install_deps)
  fi

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
  pin_toolchain
  # It validates the projects under $DOCS_ROOT/examples/ts.
  (cd "$REPO_ROOT/docs/examples/ts" && ./bootstrap.sh "$@")
}

function validate-webapp-tutorial {
  echo_header "Validating webapp-tutorial build"
  pin_toolchain
  local TUTORIAL_DIR="$DOCS_ROOT/examples/webapp-tutorial"
  local ARTIFACTS_DIR="$DOCS_ROOT/target"

  compile webapp-tutorial/contracts

  (
    cd "$TUTORIAL_DIR"

    # Backup package.json (the only tracked file we mutate). yarn.lock is
    # gitignored and reseeded on each run, so we don't back it up.
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
    rm -rf node_modules .yarn .yarnrc.yml yarn.lock

    # The tutorial's own setup installs the published packages a reader gets, at the pinned version.
    # It starts from an empty lockfile, which the --immutable yarn 4 turns on under CI would refuse.
    # Only the e2e suite needs a browser, so other runs skip puppeteer's Chrome
    # download. Set here rather than in webapp-tutorial itself so users following
    # the tutorial still get Chrome for `yarn test:e2e`.
    local skip_chrome=(PUPPETEER_SKIP_DOWNLOAD=1)
    [ "${WEBAPP_TESTS:-}" = e2e ] && skip_chrome=()
    env "${skip_chrome[@]}" YARN_ENABLE_IMMUTABLE_INSTALLS=false ./setup.sh "$AZTEC_VERSION"

    # Copy compiled contract artifact and run codegen
    mkdir -p src/artifacts
    local artifact="$ARTIFACTS_DIR/pod_racing_contract-PodRacing.json"
    if [ ! -f "$artifact" ]; then
      echo_stderr "ERROR: Contract artifact not found at $artifact"
      return 1
    fi
    cp "$artifact" src/artifacts/
    "$AZTEC" codegen "$artifact" -o src/artifacts

    # Type check (build mode follows project references in tsconfig.json)
    echo_stderr "Type checking webapp-tutorial..."
    npx tsc -b --noEmit

    # Vite production build
    echo_stderr "Running vite build..."
    npx vite build

    # The tests need the dependencies this subshell's EXIT trap removes. The e2e suite
    # serves the app on ports 4173 and 4174, expects a local network at localhost:8080, and runs
    # the extension test in a headed browser (under Xvfb when there is no display), so it is run
    # by hand (test-webapp-e2e) and not from test_cmds.
    if [ -n "${WEBAPP_TESTS:-}" ]; then
      echo_stderr "Running webapp-tutorial unit tests..."
      yarn test:unit
    fi
    if [ "${WEBAPP_TESTS:-}" = e2e ]; then
      echo_stderr "Running webapp-tutorial e2e tests..."
      yarn build:test-extension
      if [ -z "${DISPLAY:-}" ] && command -v xvfb-run >/dev/null; then
        xvfb-run -a yarn test:e2e
      else
        yarn test:e2e
      fi
    fi

    echo_stderr "webapp-tutorial validated successfully"
  )
}

function execute-examples {
  echo_header "Executing TypeScript documentation examples"
  # The compose file mounts the repository and runs main's examples.
  if [ -n "$DOCS_LINE" ]; then
    echo_stderr "execute runs main's examples only: a line's run against a network at its cut."
    return 1
  fi
  pin_toolchain
  local COMPOSE_DIR="$DOCS_ROOT/examples/ts"
  run_compose_test "docs_examples" "docs-examples" "$COMPOSE_DIR"
}

# Runs the Noir tests of every docs workspace package that has any (the type = "lib" test
# packages the `compile` step skips, and the #[test]s inside circuits and contracts). A local
# TXE server resolves the foreign calls the tests make: account creation, deployment, and
# private/utility execution.
function test-contracts {
  echo_header "Testing example contracts (TXE)"
  pin_toolchain
  local test_packages=()
  local member
  # TXE deploys contracts from target/, which main's build fills but a line's new stage does not.
  if [ -n "$DOCS_LINE" ]; then
    local contracts=()
    for member in $(sed -n -E 's/^ *"examples\/([^"]+)",?$/\1/p' "$DOCS_ROOT/Nargo.toml"); do
      if grep -q '^type = "contract"' "$DOCS_ROOT/examples/$member/Nargo.toml"; then
        contracts+=("$member")
      fi
    done
    compile "${contracts[@]}"
  fi
  for member in $(sed -n -E 's/^ *"(examples\/[^"]+)",?$/\1/p' "$DOCS_ROOT/Nargo.toml"); do
    if grep -rqs '#\[test' "$DOCS_ROOT/$member/src"; then
      test_packages+=("$(sed -n -E 's/^name *= *"([^"]+)".*/\1/p' "$DOCS_ROOT/$member/Nargo.toml")")
    fi
  done
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
    # Its own process group, so teardown stops the CLI wrapper and the node server it runs, and nothing else.
    UV_THREADPOOL_SIZE=8 LOG_LEVEL=silent setsid "$AZTEC" start --txe --port "$txe_port" >/dev/null &
    txe_pid=$!
    trap 'kill -- -"$txe_pid" &>/dev/null || true' EXIT

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
    cd "$DOCS_ROOT"
    for pkg in "${test_packages[@]}"; do
      echo_stderr "Running $pkg..."
      $NARGO test --skip-brillig-constraints-check \
        --oracle-resolver "http://127.0.0.1:$txe_port" --package "$pkg"
    done
  )
}

# Builds the "Your first full project" page's project in an empty folder with this line's pin. The test reads
# the line's page and example from the repository, not from the stage.
function test-first-project {
  echo_header "Testing the first full project from an empty folder"
  pin_toolchain
  "$REPO_ROOT/$DOCS_PATH/examples/ts/first_full_project/fresh_folder_test.sh"
}

# Every line's checkout and toolchain, installed before test commands that share them run in parallel.
function pin_toolchains {
  pin_toolchain
  local line
  for line in $("${aztec_node[@]}" lines); do
    "${aztec_node[@]}" --line "$line" fetch
    "${aztec_node[@]}" --line "$line" provision nargo bb cli
  done
}

function test_cmds {
  # Bumped from the default 600s by ~50% (now 15m) to absorb cumulative-runtime growth
  # under merge-queue load — example_swap's `wait-for-proven` poll was tipping SIGTERM
  # near the old limit. See PR #23253 dequeue log http://ci.aztec-labs.com/b08ac48286302949.
  echo "$hash:ONLY_TERM_PARENT=1:TIMEOUT=15m docs/examples/bootstrap.sh execute"
  echo "$hash:ONLY_TERM_PARENT=1 docs/examples/bootstrap.sh test-contracts"
  echo "$hash:ONLY_TERM_PARENT=1 docs/examples/bootstrap.sh test-webapp"
  # The fresh-folder test also renders its page with the site's preprocessing.
  local render=("^docs/src/" "^docs/developer_version_config.json" "^docs/release_names.json")
  local page="^docs/docs-developers/docs/tutorials/js_tutorials/first_full_project.md"
  echo "$(cache_content_hash .rebuild_patterns "$page" "${render[@]}"):ONLY_TERM_PARENT=1 docs/examples/bootstrap.sh test-first-project"
  # A line's TXE needs a port of its own: the test commands run in parallel.
  local line line_hash i=0
  for line in $("${aztec_node[@]}" lines); do
    line_hash=$(cache_content_hash .rebuild_patterns "^docs/lines/$line/")
    echo "$line_hash:ONLY_TERM_PARENT=1:TXE_PORT=$((14746 + i)) docs/examples/bootstrap.sh --line $line test-contracts"
    line_hash=$(cache_content_hash .rebuild_patterns "^docs/lines/$line/" "${render[@]}")
    echo "$line_hash:ONLY_TERM_PARENT=1 docs/examples/bootstrap.sh --line $line test-first-project"
    i=$((i + 1))
  done
}

function test {
  echo_header "docs examples test"
  pin_toolchains
  test_cmds | filter_test_cmds | parallelize
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

case "$cmd" in
  "")
    run_step "Compile (Noir circuits)" compile-circuits
    run_step "Compile (Noir contracts)" compile
    run_step "Compile (Solidity)" compile-solidity
    run_step "TypeScript validation" validate-ts
    run_step "Webapp tutorial build" validate-webapp-tutorial

    if [[ ${#FAILED_STEPS[@]} -gt 0 ]]; then
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
  test-webapp)
    WEBAPP_TESTS=unit validate-webapp-tutorial
    ;;
  test-webapp-e2e)
    WEBAPP_TESTS=e2e validate-webapp-tutorial
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
