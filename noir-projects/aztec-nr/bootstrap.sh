#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export NOIR_HASH=${NOIR_HASH:- $(../../noir/bootstrap.sh hash)}
hash=$(hash_str "$NOIR_HASH" $(cache_content_hash  "^noir-projects/aztec-nr"))

function build {
  # Being a library, aztec-nr does not technically need to be built. But we can still run nargo check to find any type
  # errors and prevent warnings
  echo_stderr "Checking aztec-nr for warnings..."
  $NARGO check --deny-warnings
}

function test_cmds {
  i=0
  $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
    # We assume there are 8 txe's running.
    port=$((45730 + (i++ % ${NUM_TXES:-1})))
    echo "$hash noir-projects/scripts/run_test.sh aztec-nr $package $test $port"
  done
}

function test {
  # Start txe server.
  trap 'kill $(jobs -p)' EXIT
  (cd $root/yarn-project/txe && LOG_LEVEL=error TXE_PORT=45730 yarn start) &
  echo "Waiting for TXE to start..."
  while ! nc -z 127.0.0.1 45730 &>/dev/null; do sleep 1; done

  export NARGO_FOREIGN_CALL_TIMEOUT=300000
  test_cmds | filter_test_cmds | parallelize

  # Run the macro compilation failure tests
  ./macro_compilation_failure_tests/assert_macro_compilation_failure.sh
}

function format {
  $NARGO fmt
}

function release {
  if ! semver check $REF_NAME; then
    echo_stderr "Release tag must be a valid semver version. Found: $REF_NAME"
    exit 1
  fi

  release_git_push "master" $REF_NAME
}

function release_git_push {
  local branch_name=$1
  local tag_name=$2
  local mirrored_repo_url="https://github.com/AztecProtocol/aztec-nr.git"

  # Clean up our release directory.
  rm -rf release-out && mkdir release-out

  # Copy our git files to our release directory.
  git archive HEAD -- . | tar -x -C release-out

  cd release-out

  # Update Nargo.toml files to reference noir-protocol-circuits from the monorepo tag
  monorepo_url="https://github.com/AztecProtocol/aztec-packages"
  monorepo_protocol_circuits_path="noir-projects/noir-protocol-circuits"

  # Find all Nargo.toml files that reference noir-protocol-circuits
  nargo_files="$(find . -name 'Nargo.toml' | xargs grep --files-with-matches 'noir-protocol-circuits' || true)"

  # Replace relative paths with git references
  for nargo_file in $nargo_files; do
    sed --regexp-extended --in-place \
      "s;path\s*=\s*\".*noir-protocol-circuits(.*)\";git=\"$monorepo_url\", tag=\"$tag_name\", directory=\"$monorepo_protocol_circuits_path\1\";" \
      $nargo_file
  done

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

case "$cmd" in
  ""|"fast"|"full")
    build
    ;;
  "ci")
    build
    test
    ;;
  test|test_cmds|format|release)
    $cmd
    ;;
  "test-macro-compilation-failure")
    ./macro_compilation_failure_tests/assert_macro_compilation_failure.sh
    ;;
  *)
    echo_stderr "Unknown command: $cmd"
    exit 1
esac
