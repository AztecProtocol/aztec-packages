#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}


# We rely on noir-projects for the verifier contract.
export hash=$(cache_content_hash \
  .rebuild_patterns \
  ../noir/.rebuild_patterns \
  ../noir-projects/noir-protocol-circuits \
  ../barretenberg/cpp/.rebuild_patterns
)

function build {
  echo_header "l1-contracts build"

  # Deps install
  yarn

  local artifact=l1-contracts-$hash.tar.gz
  if ! cache_download $artifact; then
    # Clean
    rm -rf broadcast cache out serve generated

    # Install
    forge install

    # Ensure libraries are at the correct version
    git submodule update --init --recursive ./lib

    mkdir -p generated
    # Copy from noir-projects. Bootstrap must have ran in noir-projects.
    local rollup_verifier_path=../noir-projects/noir-protocol-circuits/target/keys/rollup_root_verifier.sol
    if [ -f "$rollup_verifier_path" ]; then
      cp "$rollup_verifier_path" generated/HonkVerifier.sol
    else
      echo_stderr "You may need to run ./bootstrap.sh in the noir-projects folder. Could not find the rollup verifier at $rollup_verifier_path."
      exit 1
    fi

    # Compile contracts
    # Step 1: Build everything in src.
    forge build $(find src test -name '*.sol')

    # Step 1.5: Output storage information for the rollup contract.
    forge inspect --json src/core/Rollup.sol:Rollup storage > ./out/Rollup.sol/storage.json

    # Step 2: Build the generated verifier contract with optimization.
    forge build $(find generated -name '*.sol') \
      --optimize \
      --optimizer-runs 1 \
      --no-metadata

    cache_upload $artifact out generated
  fi
}

function test_cmds {
  echo "$hash cd l1-contracts && solhint --config ./.solhint.json \"src/**/*.sol\""
  echo "$hash cd l1-contracts && forge fmt --check"
  echo "$hash cd l1-contracts && forge test"
  echo "$hash cd l1-contracts && forge test --no-match-contract UniswapPortalTest --match-contract MerkleCheck --ffi"
  if [ "$CI" -eq 0 ] || [[ "${TARGET_BRANCH:-}" == "master" || "${TARGET_BRANCH:-}" == "staging" ]]; then
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
  $root/ci3/npm/release_prep_package_json $version

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
  MATCH_PATH=""
  LCOV=false
  SERVE=false
  HELP=false
  GOVERNANCE=false

  # Help text
  show_help() {
    echo "Usage: ./bootstrap.sh coverage [options]"
    echo "Options:"
    echo "  -p <path>    Run coverage only for files matching this path pattern"
    echo "  -l           Generate LCOV report"
    echo "  -s           Serve coverage report (requires -l)"
    echo "  -g           Run coverage for governance contracts using only gov tests"
    echo "  -h           Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./bootstrap.sh coverage                  # Run coverage for all files"
    echo "  ./bootstrap.sh coverage -p src/core      # Run coverage only for src/core"
    echo "  ./bootstrap.sh coverage -l -s            # Generate and serve LCOV report"
    echo "  ./bootstrap.sh coverage -g               # Run coverage for governance contracts using only gov tests"
    echo "  ./bootstrap.sh coverage -g -l -s         # Run coverage for governance contracts using only gov tests with LCOV report and serve"
  }

  # Parse options
  while getopts "p:lshg" opt; do
    case $opt in
      p) MATCH_PATH="$OPTARG" ;;
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

  # Validate serve option
  if [ "$SERVE" = true ] && [ "$LCOV" = false ]; then
    echo "Error: -s option requires -l option to be enabled"
    exit 1
  fi

  # Build the command
  if [ "$GOVERNANCE" = true ]; then
    CMD="FORGE_COVERAGE=true forge coverage --match-path \"test/governance/**/*.t.sol\" --no-match-coverage \"(test|script|mock|generated|core|periphery)\""
  else
    # Default coverage command
    CMD="FORGE_COVERAGE=true forge coverage --no-match-coverage \"(test|script|mock|generated)\""
  fi

  if [ -n "$MATCH_PATH" ] && [ "$GOVERNANCE" = true ]; then
    echo "Warning: -p option is not supported in governance mode"
    exit 1
  fi

  # Add path filter if specified (only if not in governance mode)
  if [ -n "$MATCH_PATH" ] && [ "$GOVERNANCE" = false ]; then
    if [ ! -e "$MATCH_PATH" ]; then
      echo "Warning: Path '$MATCH_PATH' does not exist"
      exit 1
    fi
    CMD="$CMD --match-path \"$MATCH_PATH\""
  fi

  # Add LCOV report if requested
  if [ "$LCOV" = true ]; then
    CMD="$CMD --report lcov"
  fi

  echo "Running coverage with command: $CMD"
  eval "$CMD"

  # Serve report if requested
  if [ "$SERVE" = true ]; then
    if ! command -v genhtml &> /dev/null; then
      echo "Error: genhtml not found. Please install lcov package."
      exit 1
    fi

    mkdir -p coverage
    genhtml lcov.info --branch-coverage --output-dir coverage
    echo "Serving coverage report at http://localhost:8000"
    python3 -m http.server --directory "coverage" 8000
  fi
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
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  "gas_report")
    shift
    gas_report "$@"
    ;;
  "gas_benchmark")
    shift
    gas_benchmark "$@"
    ;;
  "coverage")
    shift
    coverage "$@"
    ;;
  test|test_cmds|bench|bench_cmds|inspect|release)
    $cmd
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
