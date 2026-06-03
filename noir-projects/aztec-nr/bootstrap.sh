#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}

# Fairies want to run these tests on every PR
if [ "${TARGET_BRANCH:-}" = "merge-train/fairies" ]; then
  hash=disabled-cache
else
  hash=$(hash_str $(../../noir/bootstrap.sh hash) $(cache_content_hash "^noir-projects/aztec-nr"))
fi

function build {
  # Being a library, aztec-nr does not technically need to be built. But we can still run nargo check to find any type
  # errors and prevent warnings
  echo_stderr "Checking aztec-nr for warnings..."
  # nargo resolves git dependencies (e.g. noir-lang/sha256, noir-lang/poseidon) by cloning from
  # github.com on a cold cache, which intermittently fails with transient DNS/network errors. Retry
  # only on those transport failures so a flaky clone does not dequeue the merge train, while genuine
  # check failures (type errors, warnings) still fail immediately.
  local git_net_flake="Could not resolve host|unable to access|Connection timed out|Connection refused|Failed to connect|TLS connect error|early EOF|RPC failed"
  retry -p "$git_net_flake" "$NARGO check --deny-warnings"

  # We also check that no docstring links are broken
  retry -p "$git_net_flake" "$NARGO doc --check"
}

function test_cmds {
  i=0
  $NARGO test --list-tests --silence-warnings | grep -v __oracle_test__ | sort | while read -r package test; do
    # We assume there are 8 txe's running.
    port=$((14730 + (i++ % ${NUM_TXES:-1})))
    echo "$hash noir-projects/scripts/run_test.sh aztec-nr $package $test $port"
  done

  # Oracle roundtrip tests run against a dedicated resolver instead of TXE
  local resolver_port=${1:-14830}
  { $NARGO test --list-tests --silence-warnings | grep __oracle_test__ || true; } | sort | while read -r package test; do
    echo "$hash noir-projects/scripts/run_test.sh aztec-nr $package $test $resolver_port"
  done
}

function test {
  # Ports are below the Linux ephemeral range (32768-60999) to avoid conflicts.
  local txe_base_port=14730
  local resolver_port=14830
  trap 'kill $(jobs -p)' EXIT

  check_port $txe_base_port || echo "WARNING: port $txe_base_port is in use, TXE may fail to start"
  (cd $root/yarn-project/txe && UV_THREADPOOL_SIZE=8 LOG_LEVEL=error TXE_PORT=$txe_base_port yarn start) &

  check_port $resolver_port || echo "WARNING: port $resolver_port is in use, oracle test resolver may fail to start"
  (cd $root/yarn-project/txe && LOG_LEVEL=error ORACLE_TEST_PORT=$resolver_port yarn start:oracle-test-resolver) &

  wait_for_port() {
    local port=$1 name=$2 j=0
    echo "Waiting for $name to start..."
    while ! nc -z 127.0.0.1 $port &>/dev/null; do
      if [ $j == 60 ]; then
        echo "$name failed to start on port $port after 60s." >&2
        check_port $port
        exit 1
      fi
      sleep 1
      j=$((j+1))
    done
  }
  wait_for_port $txe_base_port "TXE"
  wait_for_port $resolver_port "oracle test resolver"

  export NARGO_FOREIGN_CALL_TIMEOUT=300000
  test_cmds $resolver_port | filter_test_cmds | parallelize
}

function format {
  $NARGO fmt
}

function release {
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
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
