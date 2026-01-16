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
  echo_cmd "grind"                 "Spin up multiple EC2 instances to run parallel full CI runs."
  echo_cmd "merge-queue"           "Spin up several EC2 instances to run the merge-queue jobs."
  echo_cmd "network-deploy"        "Spin up an EC2 instance to deploy a network."
  echo_cmd "network-tests"         "Spin up an EC2 instance to run tests on a network."
  echo_cmd "network-bench"         "Spin up an EC2 instance to run benchmarks on a network."
  echo_cmd "network-teardown"      "Spin up an EC2 instance to teardown a network deployment."
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
      'run x3-full amd64 ci-full-no-test-cache' \
      'run x4-full amd64 ci-full-no-test-cache' \
      'run a1-fast arm64 ci-fast' | DUP=1 cache_log "Merge queue CI run" $RUN_ID
    ;;

  ##########################################
  # NETWORK DEPLOYMENTS WITH BENCHES/TESTS #
  ##########################################
  network-deploy)
    # Args: <scenario> <namespace> [docker_image]
    # If docker_image is not provided, ci-network-deploy will build and push to aztecdev.
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-deploy"
    export INSTANCE_POSTFIX="n-deploy"
    bootstrap_ec2 "./bootstrap.sh ci-network-deploy $*"
    ;;
  network-tests)
    # Args: <scenario> <namespace>
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-tests"
    export AWS_SHUTDOWN_TIME=360 # 6 hours for network tests
    export INSTANCE_POSTFIX="n-tests"
    bootstrap_ec2 "./bootstrap.sh ci-network-tests $*"
    ;;
  network-bench)
    # Args: <scenario> <namespace> [docker_image]
    # If docker_image is not provided, ci-network-bench will build and push to aztecdev.
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-bench" CPUS=16
    export INSTANCE_POSTFIX="n-bench"
    bootstrap_ec2 "./bootstrap.sh ci-network-bench $*"
    ;;
  network-teardown)
    # Args: <scenario> <namespace>
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-teardown"
    export CPUS=4
    export INSTANCE_POSTFIX="n-teardown"
    bootstrap_ec2 "./bootstrap.sh ci-network-teardown $*"
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
    if [ "$CI_REDIS_AVAILABLE" -ne 1 ]; then
      echo "No redis available for log query."
      exit 1
    fi
    pager=${PAGER:-less}
    [ ! -t 0 ] && pager=cat
    redis_getz $1 | $pager
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
  gh-bench|gh-deploy-bench|gh-spartan-bench)
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
