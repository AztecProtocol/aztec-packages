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

    # Step 2: Build the the generated verifier contract with optimization.
    forge build $(find generated -name '*.sol') \
      --optimize \
      --optimizer-runs 1 \
      --no-metadata

    cache_upload $artifact out
  fi
}

function test_cmds {
  echo "$hash cd l1-contracts && solhint --config ./.solhint.json \"src/**/*.sol\""
  echo "$hash cd l1-contracts && forge fmt --check"
  echo "$hash cd l1-contracts && forge test --no-match-contract UniswapPortalTest"
}

function test {
  echo_header "l1-contracts test"
  test_cmds | filter_test_cmds | parallelise
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
    --isolate \
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


function gas_benchmark {
  check=${1:-"no"}
  echo_header "Benchmarking gas"
  forge --version

  FORGE_GAS_REPORT=true forge test \
    --match-contract "BenchmarkRollupTest" \
    --fuzz-seed 42 \
    --isolate \
    > gas_benchmark.new.tmp
  grep "^|" gas_benchmark.new.tmp > gas_benchmark.new.md
  rm gas_benchmark.new.tmp
  diff gas_benchmark.new.md gas_benchmark.md > gas_benchmark.diff || true

  if [ -s gas_benchmark.diff -a "$check" = "check" ]; then
    cat gas_benchmark.diff
    echo "Gas benchmark has changed. Please check the diffs above, then run './bootstrap.sh gas_benchmark' to update the gas benchmark."
    exit 1
  fi
  mv gas_benchmark.new.md gas_benchmark.md
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
  test|test_cmds|inspect|release)
    $cmd
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
