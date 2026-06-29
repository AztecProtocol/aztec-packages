#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

function download_solc {
  # Read solc path from foundry.toml and extract version (e.g., "./solc-0.8.27" -> "0.8.27")
  local solc_path=$(grep '^solc = ' foundry.toml | sed 's/.*"\.\/\(.*\)"/\1/')
  local solc_version=${solc_path#solc-}
  if [ -f "$solc_path" ]; then
    return 0
  fi
  local platform="$(os)-$(arch)"
  local artifact="solc-$platform-$solc_version.tar.gz"
  if cache_download "$artifact"; then
    return 0
  fi

  # Use forge's built-in svm to download solc (handles all platforms including arm64)
  echo_stderr "Downloading solc $solc_version via svm..."
  # svm-rs always uses ~/.svm if it exists. Make sure it does for a consistent path across OS/architecture.
  mkdir -p "$HOME/.svm"
  # We build a minimal file to trigger svm download of solc. svm fetches the
  # binary from binaries.soliditylang.org, which intermittently fails to resolve
  # under heavy parallel CI load; retry every 10s for ~5 min to ride out transient
  # DNS drops, but only on connection/DNS failures so a genuine build error fails
  # fast. (The merge queue disables the cache above, so this download path runs
  # every time. stderr is kept so retry can see the DNS error and match on it.)
  RETRY_ATTEMPTS=30 RETRY_SLEEP=10 retry -p 'dns error|Temporary failure in name resolution|error sending request|failed to lookup address|Connection refused|connection reset' \
    "forge build --use \"$solc_version\" src/core/libraries/ConstantsGen.sol"

  # Copy from svm cache to local path
  local svm_path="$HOME/.svm/$solc_version/solc-$solc_version"
  if [ ! -f "$svm_path" ]; then
    echo_stderr "ERROR: svm failed to download solc $solc_version"
    exit 1
  fi

  cp "$svm_path" "$solc_path"
  cache_upload "$artifact" "$solc_path"
}

# We rely on noir-projects for the verifier contract.
export hash=$(cache_content_hash \
  .rebuild_patterns \
  ../noir/.rebuild_patterns \
  ../noir-projects/noir-protocol-circuits \
  ../barretenberg/cpp/.rebuild_patterns
)

function build_src {
  echo_header "l1-contracts build_src"

  # Download solc binary
  download_solc

  # Deps install
  npm_install_deps

  local artifact=l1-contracts-src-$hash.tar.gz
  if ! cache_download $artifact; then
    # Clean
    rm -rf broadcast cache out serve

    # Install
    forge install

    # Ensure libraries are at the correct version
    git submodule update --init --recursive ./lib

    # Compile contracts
    # Build everything in src and test (except scripts that need generated verifier).
    forge build $(find src test -name '*.sol' ! -name 'shouting.t.sol' ! -path 'test/script/*' )

    # Output storage information for the rollup contract.
    forge inspect --json src/core/Rollup.sol:Rollup storage > ./out/Rollup.sol/storage.json

    # Output storage information for the escape hatch contract.
    forge inspect --json src/core/EscapeHatch.sol:EscapeHatch storage > ./out/EscapeHatch.sol/storage.json

    cache_upload $artifact out cache
  fi
}

function build_verifier {
  echo_header "l1-contracts build_verifier"

  local artifact=l1-contracts-verifier-$hash.tar.gz
  if ! cache_download $artifact; then
    mkdir -p generated

    # Generate network defaults from spartan (canonical source of truth for config values)
    yq -o json 'explode(.) | ."l1-contracts" // {}' ../spartan/environments/network-defaults.yml > generated/default.json

    # Copy from noir-projects. Bootstrap must have ran in noir-projects.
    local rollup_verifier_path=../noir-projects/noir-protocol-circuits/target/keys/rollup_root_verifier.sol
    if [ -f "$rollup_verifier_path" ]; then
      cp "$rollup_verifier_path" generated/HonkVerifier.sol
    else
      echo_stderr "You may need to run ./bootstrap.sh in the noir-projects folder. Could not find the rollup verifier at $rollup_verifier_path."
      exit 1
    fi

    # Build the generated verifier contract with optimization.
    # Build the scripts that rely on the verifier. These are mutually exclusive with the build in build_src.
    forge build \
      $(find generated -name '*.sol') \
      test/shouting.t.sol \
      script/deploy/*.s.sol \
      test/script/*.t.sol

    cache_upload $artifact out cache generated
  fi
}

function build {
  build_src
  build_verifier
}

function test_cmds {
  echo "$hash cd l1-contracts && solhint --config ./.solhint.json \"src/**/*.sol\""
  echo "$hash cd l1-contracts && forge fmt --check"
  echo "$hash cd l1-contracts && forge test"
  echo "$hash cd l1-contracts && forge test --no-match-contract UniswapPortalTest --match-contract MerkleCheck --ffi"
  echo "$hash:ISOLATE=1 cd l1-contracts && scripts/test_rollup_upgrade.sh"
  if [[ "${TARGET_BRANCH:-}" == "master" || "${TARGET_BRANCH:-}" == "staging" ]]; then
    echo "$hash cd l1-contracts && forge test --no-match-contract UniswapPortalTest --match-contract ScreamAndShoutTest"
  fi
}

function test {
  echo_header "l1-contracts test"
  test_cmds | filter_test_cmds | parallelize
}

function inspect {
    echo_header "l1-contracts inspect"

    # Find all .sol files in the src directory
    find src -type f -name "*.sol" | while read -r file; do

        # Get all contract/library/interface names from the file
        while read -r line; do
            if [[ $line =~ ^(contract|library|interface)[[:space:]]+([a-zA-Z0-9_]+) ]]; then
                contract_name="${BASH_REMATCH[2]}"
                full_path="${file}:${contract_name}"

                # Run forge inspect and capture output
                methods_output=$(forge inspect "$full_path" methodIdentifiers 2>/dev/null)
                errors_output=$(forge inspect "$full_path" errors 2>/dev/null)
                events_output=$(forge inspect "$full_path" events 2>/dev/null)

                # Only display if we have methods or errors or events (empty table output is 5 lines)
                if [ $(echo "$methods_output" | wc -l) != 5 ] || [ $(echo "$errors_output" | wc -l) != 5 ] || [ $(echo "$events_output" | wc -l) != 5 ]; then
                    echo "----------------------------------------"
                    echo "Inspecting $full_path"
                    echo "----------------------------------------"

                    if [ $(echo "$methods_output" | wc -l) != 5 ]; then
                        echo "$methods_output"
                        echo ""
                    fi

                    if [ $(echo "$errors_output" | wc -l) != 5 ]; then
                        echo "$errors_output"
                        echo ""
                    fi

                    if [ $(echo "$events_output" | wc -l) != 5 ]; then
                        echo "$events_output"
                        echo ""
                    fi
                fi
            fi
        done < <(grep -E "^[[:space:]]*(contract|library|interface)[[:space:]]+[a-zA-Z0-9_]+" "$file")
    done
}


function gas_report {
  check=${1:-"no"}
  echo_header "l1-contracts gas report"
  forge --version

  FORGE_GAS_REPORT=true forge test \
    --match-contract "^RollupTest$" \
    --no-match-test "(testInvalidBlobHash)|(testInvalidBlobProof)" \
    --fuzz-seed 42 \
    --json \
    > gas_report.new.tmp
  jq '.' gas_report.new.tmp > gas_report.new.json
  rm gas_report.new.tmp
  diff gas_report.new.json gas_report.json > gas_report.diff || true

  if [ -s gas_report.diff -a "$check" = "check" ]; then
    cat gas_report.diff
    echo "Gas report has changed. Please check the diffs above, then run './bootstrap.sh gas_report' to update the gas report."
    exit 1
  fi
  mv gas_report.new.json gas_report.json
}

function bench_cmds {
  echo "$hash l1-contracts/bootstrap.sh bench"
}

function bench {
  rm -rf bench-out && mkdir -p bench-out

  # Run the gas benchmark to generate the markdown file and JSON results
  gas_benchmark

  # Use Python script to generate the benchmark JSON from gas_benchmark_results.json
  python3 scripts/generate_benchmark_json.py
}

function gas_benchmark {
  check=${1:-"no"}

  echo_header "l1-contracts gas benchmark"
  forge --version

  # Run the new Python benchmarking script
  echo "Running gas benchmarks..."
  python3 scripts/gas_benchmarks.py

  # The script generates gas_benchmark.md directly
  # Check if it differs from the committed version
  if [ "$check" = "check" ]; then
    if ! git diff --quiet gas_benchmark.md; then
      git diff gas_benchmark.md
      echo "Gas benchmark has changed. Please check the diffs above, then run './bootstrap.sh gas_benchmark' to update the gas benchmark."
      exit 1
    fi
  fi
}

function validator_costs {
  forge --version

  # Run test without validators
  echo "Running test without validators..."
  FORGE_GAS_REPORT=true forge test \
    --match-contract "BenchmarkRollupTest" \
    --match-test "test_no_validators" \
    --fuzz-seed 42 \
    --json \
    > no_validators.json

  # Run test with 100 validators
  echo "Running test with 100 validators..."
  FORGE_GAS_REPORT=true forge test \
    --match-contract "BenchmarkRollupTest" \
    --match-test "test_100_validators" \
    --fuzz-seed 42 \
    --json \
    > 100_validators.json

  # Run test with 100 validators and slashing
  echo "Running test with 100 validators and slashing..."
  FORGE_GAS_REPORT=true forge test \
    --match-contract "BenchmarkRollupTest" \
    --match-test "test_100_slashing_validators" \
    --fuzz-seed 42 \
    --json \
    > 100_validators_slashing.json

  # Use Python script to process the JSON files
  echo "Processing gas reports with Python script..."
  python3 scripts/process_gas_reports.py no_validators.json 100_validators.json 100_validators_slashing.json
}

# First argument is a branch name (e.g. master, or the latest version e.g. 1.2.3) to push to the head of.
# Second argument is the tag name (e.g. v1.2.3, or commit-<hash>).
# Third argument is the semver for package.json (e.g. 1.2.3 or 1.2.3-commit.<hash>)
#
#   v1.2.3    commit-123cafebabe
#      |     /
#   v1.2.2  commit-123deadbeef
#      |   /
#   v1.2.1
#
function release_git_push {
  local branch_name=$1
  local tag_name=$2
  local version=$3
  local mirrored_repo_url="https://github.com/AztecProtocol/l1-contracts.git"

  # Clean up our release directory.
  rm -rf release-out && mkdir release-out

  # Copy our git files to our release directory.
  git archive HEAD | tar -x -C release-out

  # Copy from noir-projects. Bootstrap must have ran in noir-projects.
  cp ../noir-projects/noir-protocol-circuits/target/keys/rollup_root_verifier.sol release-out/src/HonkVerifier.sol

  cd release-out

  # Update the package version in package.json.
  # TODO remove package.json.
  release_prep_package_json $version

  # CI needs to authenticate from GITHUB_TOKEN.
  gh auth setup-git &>/dev/null || true

  git init &>/dev/null
  git remote add origin "$mirrored_repo_url" &>/dev/null
  git fetch origin --quiet

  # Checkout the existing branch or create it if it doesn't exist.
  if git ls-remote --heads origin "$branch_name" | grep -q "$branch_name"; then
    # Update branch reference without checkout.
    git branch -f "$branch_name" origin/"$branch_name"
    # Point HEAD to the branch.
    git symbolic-ref HEAD refs/heads/"$branch_name"
    # Move to latest commit, keep working tree.
    git reset --soft origin/"$branch_name"
  else
    git checkout -b "$branch_name"
  fi

  if git rev-parse "$tag_name" >/dev/null 2>&1; then
    echo "Tag $tag_name already exists. Skipping release."
  else
    git add .
    git commit -m "Release $tag_name." >/dev/null
    git tag -a "$tag_name" -m "Release $tag_name."
    do_or_dryrun git push origin "$branch_name" --quiet
    do_or_dryrun git push origin --quiet --force "$tag_name" --tags

    echo "Release complete ($tag_name) on branch $branch_name."
  fi

  do_or_dryrun git push origin "$branch_name" --quiet
  do_or_dryrun git push origin --quiet --force "$tag_name" --tags

  echo "Release complete ($tag_name) on branch $branch_name."
}

function coverage {
  echo_header "l1-contracts coverage"
  forge --version

  # Default values
  TEST_MATCH_PATH=""
  LCOV=false
  SERVE=false
  HELP=false
  GOVERNANCE=false
  CORE=false

  # Help text
  show_help() {
    echo "Usage: ./bootstrap.sh coverage [options]"
    echo "Options:"
    echo "  -p <path>    Run only tests in files matching this path pattern"
    echo "  -c           Run core coverage using only non-governance tests"
    echo "  -l           Generate a fresh LCOV report"
    echo "  -s           Serve the existing coverage report"
    echo "  -g           Run coverage for governance contracts using only gov tests"
    echo "  -h           Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./bootstrap.sh coverage                  # Run coverage for all files"
    echo "  ./bootstrap.sh coverage -p test/staking_asset_handler/**/*.t.sol  # Run only matching tests"
    echo "  ./bootstrap.sh coverage -c               # Run core coverage using only non-governance tests"
    echo "  ./bootstrap.sh coverage -s               # Serve the existing coverage report"
    echo "  ./bootstrap.sh coverage -l -s            # Generate and serve a fresh LCOV report"
    echo "  ./bootstrap.sh coverage -g               # Run coverage for governance contracts using only gov tests"
    echo "  ./bootstrap.sh coverage -g -l -s         # Run coverage for governance contracts using only gov tests with LCOV report and serve"
  }

  # Parse options
  while getopts "p:lcshg" opt; do
    case $opt in
      p) TEST_MATCH_PATH="$OPTARG" ;;
      c) CORE=true ;;
      l) LCOV=true ;;
      s) SERVE=true ;;
      h) HELP=true ;;
      g) GOVERNANCE=true ;;
      *) show_help; exit 1 ;;
    esac
  done

  # Show help if requested
  if [ "$HELP" = true ]; then
    show_help
    exit 0
  fi

  if [ "$SERVE" = true ] && [ "$LCOV" = false ]; then
    if [ -n "$TEST_MATCH_PATH" ] || [ "$GOVERNANCE" = true ] || [ "$CORE" = true ]; then
      echo "Warning: -s serves the existing report only; it cannot be combined with -p, -c, or -g without -l"
      exit 1
    fi

    coverage_serve
    exit 0
  fi

  download_solc

  local -a ENV_VARS=("FOUNDRY_PROFILE=coverage" "FORGE_COVERAGE=true")
  local -a CMD=("forge" "coverage" "--offline")

  if [ "$GOVERNANCE" = true ] && [ "$CORE" = true ]; then
    echo "Warning: -c and -g cannot be used together"
    exit 1
  fi

  if [ "$GOVERNANCE" = true ]; then
    CMD+=(
      "--match-path" "test/governance/**/*.t.sol"
      "--no-match-coverage" "(test|script|mock|generated|core|periphery)"
    )
  elif [ "$CORE" = true ]; then
    CMD+=(
      "--no-match-path" "test/governance/**/*.t.sol"
      "--no-match-coverage" "(test|script|mock|generated|governance)"
    )
  else
    CMD+=("--no-match-coverage" "(test|script|mock|generated)")
  fi

  if [ -n "$TEST_MATCH_PATH" ] && { [ "$GOVERNANCE" = true ] || [ "$CORE" = true ]; }; then
    echo "Warning: -p option is not supported in governance or core mode"
    exit 1
  fi

  # Add a test-file filter if specified (only if not in governance mode).
  # This narrows which tests execute via `--match-path`; it does not scope
  # coverage output to those paths.
  if [ -n "$TEST_MATCH_PATH" ] && [ "$GOVERNANCE" = false ]; then
    local -a MATCHED_PATHS=()
    shopt -s globstar nullglob
    MATCHED_PATHS=($TEST_MATCH_PATH)
    shopt -u globstar nullglob

    if [ ${#MATCHED_PATHS[@]} -eq 0 ]; then
      echo "Warning: Path pattern '$TEST_MATCH_PATH' did not match any files"
      exit 1
    fi
    CMD+=("--match-path" "$TEST_MATCH_PATH")
  fi

  # Add LCOV report if requested
  if [ "$LCOV" = true ]; then
    CMD+=("--report" "lcov")
  fi

  local DISPLAY_CMD
  printf -v DISPLAY_CMD '%q ' env "${ENV_VARS[@]}" "${CMD[@]}"
  echo "Running coverage with command: ${DISPLAY_CMD% }"
  env "${ENV_VARS[@]}" "${CMD[@]}"

  # Serve report if requested
  if [ "$SERVE" = true ]; then
    coverage_serve
  fi
}

function coverage_serve {
  echo_header "l1-contracts coverage serve"

  if ! command -v genhtml &> /dev/null; then
    echo "Error: genhtml not found. Please install lcov package."
    exit 1
  fi

  if [ ! -f "lcov.info" ]; then
    echo "Error: lcov.info not found. Run './bootstrap.sh coverage -l' first."
    exit 1
  fi

  mkdir -p coverage
  # Foundry can emit LCOV branch records that genhtml treats as inconsistent
  # even when the report is otherwise usable.
  if ! genhtml lcov.info --branch-coverage --ignore-errors inconsistent,inconsistent --output-dir coverage; then
    echo "Error: failed to generate coverage HTML from lcov.info."
    echo "If the source tree has changed since lcov.info was created, rerun './bootstrap.sh coverage -l'."
    exit 1
  fi
  echo "Serving coverage report at http://localhost:8000"
  python3 -m http.server --directory "coverage" 8000
}

function release {
  echo_header "l1-contracts release"
  local branch=$(dist_tag)
  if [ $branch = latest ]; then
    branch=master
  fi

  release_git_push $branch $REF_NAME ${REF_NAME#v}
}

case "$cmd" in
  "")
    build
    ;;
  "hash")
    echo $hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
