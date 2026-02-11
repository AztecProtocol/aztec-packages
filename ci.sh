#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source $ci3/source_redis
source $ci3/source_refname

cmd=${1:-}
arch=${ARCH:-$(arch)}
NO_TERMINATE=${NO_TERMINATE:-0}
BRANCH=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}
ci3_workflow_id=128853861

function echo_cmd {
  local name=$1
  shift
  printf "${blue}${bold}%21s${reset}: %s\n" $name "$(echo $@ | sed 's/\.\\n/.\n                      /g')"
}

function print_usage {
  echo "usage: $(basename $0) <cmd>"
  echo
  echo_cmd "dash"                  "Display a dashboard showing CI runs for the current user."
  echo_cmd "fast"                  "Spin up an EC2 instance and run bootstrap ci-fast."
  echo_cmd "full"                  "Spin up an EC2 instance and run bootstrap ci-full."
  echo_cmd "full-no-test-cache"    "Spin up an EC2 instance and run bootstrap ci-full-no-test-cache."
  echo_cmd "docs"                  "Spin up an EC2 instance and run docs-only CI."
  echo_cmd "barretenberg"          "Spin up an EC2 instance and run barretenberg-only CI."
  echo_cmd "grind"                 "Spin up EC2 instances to run parallel full CI runs."
  echo_cmd "merge-queue"           "Spin up EC2 instances to run the merge-queue jobs."
  echo_cmd "grind-test"            "Spin up an EC2 and grind a given test command."
  echo_cmd "network-deploy"        "Spin up an EC2 instance to deploy a network."
  echo_cmd "network-scenarios"     "Spin up EC2 instances to run network scenario tests in parallel."
  echo_cmd "network-tests"         "Spin up an EC2 instance to run tests on a network."
  echo_cmd "network-bench"         "Spin up an EC2 instance to run benchmarks on a network."
  echo_cmd "network-teardown"      "Spin up an EC2 instance to teardown a network deployment."
  echo_cmd "network-tests-kind"    "Spin up an EC2 instance to run a KIND-based spartan test."
  echo_cmd "deploy-rollup-upgrade" "Spin up an EC2 instance to deploy a rollup upgrade."
  echo_cmd "release"               "Spin up an EC2 instance and run bootstrap release."
  echo_cmd "shell-new"             "Spin up an EC2 instance, clone the repo, and drop into a shell."
  echo_cmd "shell"                 "Drop into a shell in the current running build instance container."
  echo_cmd "shell-host"            "Drop into a shell in the current running build host."
  echo_cmd "log"                   "Display the log of the given log ID."
  echo_cmd "kill"                  "Terminate running EC2 instance with instance_name."
  echo_cmd "draft"                 "Mark the current PR as draft (no automatic CI runs when pushing)."
  echo_cmd "ready"                 "Mark the current PR as ready (enable automatic CI runs when pushing)."
  echo_cmd "pr-url"                "Print the URL of the current PR associated with the branch."
  echo_cmd "avm-inputs-collection" "Run e2e tests, dump AVM circuit inputs, upload to cache."
  echo_cmd "avm-check-circuit"     "Download cached AVM inputs, run check-circuit on each."
  echo_cmd "help"                  "Display this help message."
}

[ -n "$cmd" ] && shift

instance_name=${INSTANCE_NAME:-$(echo -n "$BRANCH" | tr -c 'a-zA-Z0-9-' '_')_${arch}}
[ -n "${INSTANCE_POSTFIX:-}" ] && instance_name+="_$INSTANCE_POSTFIX"

function get_ip_for_instance {
  ip=$(aws ec2 describe-instances \
    --region us-east-2 \
    --filters "Name=tag:Name,Values=$instance_name" "Name=instance-state-name,Values=running" \
    --query "Reservations[].Instances[0].PublicIpAddress" \
    --output text)
}

function get_latest_run_id {
  gh run list --workflow $ci3_workflow_id -b $BRANCH --limit 1 --json databaseId -q .[0].databaseId
}

# Jobs in the ci dashboards are grouped on a single line by RUN_ID.
export RUN_ID=${RUN_ID:-$(date +%s%3N)}

case "$cmd" in
  dash)
    watch_ci -s next,prs --user --watch
    ;;
  fast|full|full-no-test-cache|full-no-test-cache-makefile|docs|barretenberg|barretenberg-full)
    export CI_DASHBOARD="prs"
    export JOB_ID="x-$cmd"
    bootstrap_ec2 "./bootstrap.sh ci-$cmd"
    ;;
  avm-inputs-collection|avm-check-circuit)
    export CI_DASHBOARD="nightly"
    export JOB_ID="x-$cmd"
    bootstrap_ec2 "./bootstrap.sh ci-$cmd"
    ;;
  grind)
    # Grind a default of 5 times.
    export CI_DASHBOARD="local"
    export DENOISE=1
    export DENOISE_WIDTH=32
    run() {
      JOB_ID=$1 INSTANCE_POSTFIX=$1 ARCH=$2 exec denoise "bootstrap_ec2 './bootstrap.sh $3'"
    }
    export -f run
    seq 1 ${1:-5} | parallel --termseq 'TERM,10000' --tagstring '{= $_=~s/run (\w+).*/$1/; =}' --line-buffered \
      'run $USER-x{}-full amd64 ci-full-no-test-cache'
    ;;
  merge-queue)
    # We perform full runs of all tests on multiple x86, and a single fast run on arm64.
    if [[ "$REF_NAME" =~ ^gh-readonly-queue/ ]]; then
      export CI_DASHBOARD=${TARGET_BRANCH:-local}
    else
      export CI_DASHBOARD="prs"
    fi
    export DENOISE=1
    export DENOISE_WIDTH=32
    run() {
      PARENT_LOG_ID=$RUN_ID JOB_ID=$1 INSTANCE_POSTFIX=$1 ARCH=$2 exec denoise "bootstrap_ec2 './bootstrap.sh $3'"
    }
    export -f run

    parallel --jobs 10 --termseq 'TERM,10000' --tagstring '{= $_=~s/run (\w+).*/$1/; =}' --line-buffered --halt now,fail=1 ::: \
      'run x1-full amd64 ci-full-no-test-cache' \
      'run x2-full amd64 ci-full-no-test-cache' \
      'run x3-full amd64 ci-full-no-test-cache-makefile' \
      'run x4-full amd64 ci-full-no-test-cache-makefile' \
      'run a1-fast arm64 ci-fast' | DUP=1 cache_log "Merge queue CI run" $RUN_ID
    ;;
  merge-queue-heavy)
    # Heavy merge queue with 10 parallel grind runs, used for merge-train/spartan PRs.
    if [[ "$REF_NAME" =~ ^gh-readonly-queue/ ]]; then
      export CI_DASHBOARD=${TARGET_BRANCH:-local}
    else
      export CI_DASHBOARD="prs"
    fi
    export DENOISE=1
    export DENOISE_WIDTH=32
    run() {
      PARENT_LOG_ID=$RUN_ID JOB_ID=$1 INSTANCE_POSTFIX=$1 ARCH=$2 exec denoise "bootstrap_ec2 './bootstrap.sh $3'"
    }
    export -f run

    parallel --jobs 10 --termseq 'TERM,10000' --tagstring '{= $_=~s/run (\w+).*/$1/; =}' --line-buffered --halt now,fail=1 ::: \
      'run x1-full amd64 ci-full-no-test-cache' \
      'run x2-full amd64 ci-full-no-test-cache' \
      'run x3-full amd64 ci-full-no-test-cache' \
      'run x4-full amd64 ci-full-no-test-cache' \
      'run x5-full amd64 ci-full-no-test-cache' \
      'run x6-full amd64 ci-full-no-test-cache' \
      'run x7-full amd64 ci-full-no-test-cache' \
      'run x8-full amd64 ci-full-no-test-cache' \
      'run x9-full amd64 ci-full-no-test-cache' \
      'run x10-full amd64 ci-full-no-test-cache' \
      'run a1-fast arm64 ci-fast' | DUP=1 cache_log "Merge queue heavy CI run" $RUN_ID
    ;;
  grind-test)
    full_cmd="$1"
    timeout="${2:-}"
    jobs_pct="${3:-200}"
    memsuspend_pct="${4:-50}"
    commit="${5:-}"
    # Extract test command (strip rebuild hash prefix) and hash it
    # Uses same hash as run_test_cmd's test_hash for consistency
    test_cmd="${full_cmd#* }"
    test_hash=$(hash_str_orig "$test_cmd")
    export CI_DASHBOARD="deflake"
    export JOB_ID="grind-test-$test_hash"
    export INSTANCE_POSTFIX=$JOB_ID
    export CPUS=${CPUS:-192}
    bootstrap_ec2 "./bootstrap.sh ci-grind-test $(printf %q "$full_cmd") $timeout $jobs_pct $memsuspend_pct $commit" | DUP=1 cache_log "Grind test CI run" $RUN_ID
    ;;
  ##########################################
  # NETWORK DEPLOYMENTS WITH BENCHES/TESTS #
  ##########################################
  network-scenarios)
    # Args: <scenario> <namespace> [docker_image] [test_set]
    # If test_set provided, run just that set. Otherwise run both in parallel.
    scenario="${1:?scenario is required}"
    namespace="${2:?namespace is required}"
    docker_image="${3:-}"
    test_set="${4:-}"

    export CI_DASHBOARD="network"
    # Enough for the build, which should have a lot of caching, and the test harness.
    # Resources are on GCP.
    export CPUS=16
    run() {
      local set=$1
      JOB_ID="x-${namespace}-${set}" INSTANCE_POSTFIX="n-deploy-${set}" \
        bootstrap_ec2 "./bootstrap.sh ci-network-deploy $scenario ${namespace}-${set} \"$docker_image\" $set"
    }
    export -f run
    export scenario namespace docker_image

    if [[ -n "$test_set" ]]; then
      run "$test_set"
    else
      parallel --jobs 2 --line-buffered ::: 'run 1' 'run 2'
    fi
    ;;
  network-deploy)
    # Args: <scenario> <namespace> [docker_image]
    # If docker_image is not provided, ci-network-deploy will build and push to aztecdev.
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-deploy"
    export INSTANCE_POSTFIX="n-deploy"
    # Enough for the build, which should have a lot of caching, and the test harness.
    # Resources are on GCP.
    export CPUS=16
    bootstrap_ec2 "./bootstrap.sh ci-network-deploy $*"
    ;;
  network-tests)
    # Args: <scenario> <namespace>
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-tests"
    export AWS_SHUTDOWN_TIME=360 # 6 hours for network tests
    export INSTANCE_POSTFIX="n-tests"
    # Enough for the build, which should have a lot of caching, and the test harness.
    # Resources are on GCP.
    export CPUS=16
    bootstrap_ec2 "./bootstrap.sh ci-network-tests $*"
    ;;
  network-bench)
    # Args: <scenario> <namespace> [docker_image]
    # If docker_image is not provided, ci-network-bench will build and push to aztecdev.
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-bench"
    export INSTANCE_POSTFIX="n-bench"
    # Enough for the build, which should have a lot of caching, and the test harness.
    # Resources are on GCP.
    export CPUS=16
    bootstrap_ec2 "./bootstrap.sh ci-network-bench $*"
    ;;
  network-proving-bench)
    # Args: <scenario> <namespace> [docker_image]
    # Deploys network and runs proving benchmarks.
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-proving-bench" CPUS=16
    export INSTANCE_POSTFIX="n-proving-bench"
    bootstrap_ec2 "./bootstrap.sh ci-network-proving-bench $*"
    ;;
  network-teardown)
    # Args: <scenario> <namespace>
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-teardown"
    export CPUS=4
    export INSTANCE_POSTFIX="n-teardown"
    bootstrap_ec2 "./bootstrap.sh ci-network-teardown $*"
    ;;

  network-tests-kind-proven)
    # Args: [test_set]
    # Runs KIND-based spartan tests with real provers on 96-core instances.
    # If test_set provided, run just that set. Otherwise run both in parallel.
    test_set="${1:-}"
    export CI_DASHBOARD="network"
    export AWS_SHUTDOWN_TIME=180
    export CPUS=96
    run() {
      local set=$1
      JOB_ID="x-kind-proven-${set}" INSTANCE_POSTFIX="nkp${set}" \
        bootstrap_ec2 "./bootstrap.sh ci-network-kind-proven $set"
    }
    export -f run
    if [[ -n "$test_set" ]]; then
      run "$test_set"
    else
      parallel --jobs 2 --line-buffered ::: 'run 1' 'run 2'
    fi
    ;;
  network-tests-kind)
    # Runs all KIND scenario tests in parallel, one 32-core EC2 per test (fake provers).
    # INSTANCE_POSTFIX kept short (nk0..nk12) to avoid hostname >63 char limit.
    export CI_DASHBOARD="network"
    export AWS_SHUTDOWN_TIME=180
    export CPUS=32
    run() {
      local test_file=$1
      local i=$2
      local test_name="${test_file%.test.ts}"
      JOB_ID="x-kind-${test_name}" INSTANCE_POSTFIX="nk${i}" \
        bootstrap_ec2 "./bootstrap.sh ci-network-kind-test $test_file"
    }
    export -f run
    parallel --jobs 0 --line-buffered ::: \
      'run reorg.test.ts 0' \
      'run upgrade_rollup_version.test.ts 1' \
      'run validator_ha.test.ts 2' \
      'run transfer.test.ts 3' \
      'run slash_inactivity.test.ts 4' \
      'run proving.test.ts 5' \
      'run prover-node.test.ts 6' \
      'run gating-passive.test.ts 7' \
      'run invalidate_blocks.test.ts 8' \
      'run mempool_limit.test.ts 9' \
      'run upgrade_governance_proposer.test.ts 10' \
      'run validator_nuke_and_suppression.test.ts 11' \
      'run mbps.test.ts 12'
    ;;
  deploy-rollup-upgrade)
    # Env vars: NETWORK, GCP_PROJECT_ID (for GCP secrets)
    # Args: <registry_address>
    export CI_DASHBOARD="network"
    export JOB_ID="x-deploy-rollup-upgrade"
    export CPUS=8
    export INSTANCE_POSTFIX="rollup-upgrade"
    bootstrap_ec2 "./bootstrap.sh ci-deploy-rollup-upgrade $*"
    ;;

  ############
  # RELEASES #
  ############
  release)
    # Spin up ec2 instance and run the release flow.
    export CI_DASHBOARD="releases"
    export DENOISE=1
    export DENOISE_WIDTH=32
    run() {
      PARENT_LOG_ID=$RUN_ID JOB_ID=$1 INSTANCE_POSTFIX=$1 ARCH=$2 exec denoise "bootstrap_ec2 './bootstrap.sh ci-release'"
    }
    export -f run

    parallel --termseq 'TERM,10000' --tagstring '{= $_=~s/run (\w+).*/$1/; =}' --line-buffered --halt now,fail=1 ::: \
      'run x-release amd64' \
      'run a-release arm64' | DUP=1 cache_log "Release CI run" $RUN_ID
    ;;

  ##################
  # SHELL SESSIONS #
  ##################
  shell-new)
    # Spin up ec2 instance, clone, and drop into shell.
    # False triggers the shell on fail.
    cmd="${1:-false}"
    exec bootstrap_ec2 "$cmd"
    ;;
  shell-container)
    # Drop into a shell in the current running build instance container.
    get_ip_for_instance
    [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
    [ "$#" -eq 0 ] && set -- "zsh" || true
    ssh -tq -F $ci3/aws/build_instance_ssh_config ubuntu@$ip \
      "docker start aztec_build &>/dev/null || true && docker exec -it --user aztec-dev aztec_build $@"
    ;;
  shell-host)
    # Drop into a shell in the current running build host.
    get_ip_for_instance
    [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
    ssh -t -F $ci3/aws/build_instance_ssh_config ubuntu@$ip
    ;;
  kill)
    existing_instance=$(aws ec2 describe-instances \
      --region us-east-2 \
      --filters "Name=tag:Name,Values=$instance_name" \
      --query "Reservations[].Instances[?State.Name!='terminated'].InstanceId[]" \
      --output text)
    if [ -n "$existing_instance" ]; then
      aws_terminate_instance $existing_instance
    fi
    ;;

  ###################
  # DISPLAYING LOGS #
  ###################
  log|dlog)
    pager=${PAGER:-less}
    [ ! -t 0 ] && pager=cat
    key=$1
    # Handle list/* URLs or history_* keys (Redis LISTs, not strings)
    if [[ "$key" == list/* ]]; then
      key=${key#list/}
    fi
    if [[ "$key" == history_* || "$key" == failed_tests* ]]; then
      if [ "$CI_REDIS_AVAILABLE" -ne 1 ]; then
        echo "No redis available for list log query."
        exit 1
      fi
      redis_cli LRANGE "$key" 0 -1 | $pager
    elif [ "$CI_REDIS_AVAILABLE" -eq 1 ]; then
      redis_getz "$key" | $pager
    else
      if [ -z "${CI_PASSWORD:-}" ]; then
        echo "No redis available and CI_PASSWORD not set for http fallback."
        exit 1
      fi
      curl -sf "http://aztec:$CI_PASSWORD@ci.aztec-labs.com/$key.txt" | $pager
      if [ ${PIPESTATUS[0]} -ne 0 ]; then
        echo "Failed to fetch log via http."
        exit 1
      fi
    fi
    ;;

  #################
  # PR MANAGEMENT #
  #################
  draft)
    pr_number=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -n "$pr_number" ]; then
      gh pr ready "$pr_number" --undo
      echo "Pull request #$pr_number has been set to draft."
    else
      echo "No pull request found for branch $BRANCH."
    fi
    ;;
  ready)
    pr_number=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -n "$pr_number" ]; then
      gh pr ready "$pr_number"
      echo "Pull request #$pr_number has been set to ready."
    else
      echo "No pull request found for branch $BRANCH."
    fi
    ;;
  pr-url)
    # Print the current PR associated with the branch.
    pr_url=$(gh pr list --head "$BRANCH" --limit 1 --json url -q '.[0].url')
    if [ -z "$pr_url" ]; then
      echo "No pull request found for branch '$BRANCH'."
      exit 1
    fi
    echo "$pr_url"
    ;;

  ########################
  # BENCHMARK PROCESSING #
  ########################
  gh-bench|gh-deploy-bench|gh-spartan-bench|gh-spartan-proving-bench)
    cache_download ${cmd#gh-}-$(git rev-parse HEAD^{tree}).tar.gz
    ;;

  help|"")
    print_usage
    ;;
  *)
    echo "Unknown command: $cmd, see ./ci.sh help"
    exit 1
    ;;
esac
