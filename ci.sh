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
  printf "${blue}${bold}%12s${reset}: %s\n" $name "$(echo $@ | sed 's/\.\\n/.\n             /g')"
}

function print_usage {
  echo "usage: $(basename $0) <cmd>"
  echo
  echo_cmd "fast"           "Spin up an EC2 instance and run bootstrap ci-fast."
  echo_cmd "full"           "Spin up an EC2 instance and run bootstrap ci-full."
  echo_cmd "docs"           "Spin up an EC2 instance and run docs-only CI."
  echo_cmd "barretenberg"   "Spin up an EC2 instance and run barretenberg-only CI."
  echo_cmd "merge-queue"    "Spin up several EC2 instances to run the merge-queue jobs."
  echo_cmd "network-deploy" "Spin up an EC2 instance to deploy a network."
  echo_cmd "network-tests"  "Spin up an EC2 instance to run tests on a network."
  echo_cmd "nightly"        "Spin up an EC2 instance and run bootstrap nightly."
  echo_cmd "release"        "Spin up an EC2 instance and run bootstrap release."
  echo_cmd "shell-new"      "Spin up an EC2 instance, clone the repo, and drop into a shell."
  echo_cmd "shell"          "Drop into a shell in the current running build instance container."
  echo_cmd "shell-host"     "Drop into a shell in the current running build host."
  echo_cmd "run"            "Trigger a GA workflow for the current branch PR and tail logs."
  echo_cmd "trigger"        "Trigger the GA workflow on the PR associated with the current branch."
  echo_cmd "rlog"           "Tail the logs of the latest GA run or the given GA run ID."
  echo_cmd "ilog"           "Tail the logs of the current running build instance."
  echo_cmd "dlog"           "Display the log of the given denoise log ID."
  echo_cmd "tlog"           "Display the last log of the given test command as output by test_cmds."
  echo_cmd "tilog"          "Tail the live log of a given test command as output by test_cmds."
  echo_cmd "llog"           "Tail the live log of a given log ID."
  echo_cmd "draft"          "Mark the current PR as draft (no automatic CI runs when pushing)."
  echo_cmd "ready"          "Mark the current PR as ready (enable automatic CI runs when pushing)."
  echo_cmd "pr-url"         "Print the URL of the current PR associated with the branch."
  echo_cmd "last-run-url"   "Print the URL of the last GA run for the current branch PR."
  echo_cmd "help"           "Display this help message."
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

function tail_live_instance {
  get_ip_for_instance
  [ -z "$ip" ] && return 1;
  ssh -F $ci3/aws/build_instance_ssh_config -q -t -o ConnectTimeout=5 ubuntu@$ip "
    trap 'exit 0' SIGINT
    docker ps -a --filter name=aztec_build --format '{{.Names}}' | grep -q '^aztec_build$' || exit 1
    docker logs -f aztec_build
  "
}

# Used in merge-queue, nightly, and release flows.
function prep_vars {
  export RUN_ID=${RUN_ID:-$(date +%s%3N)}
  export PARENT_LOG_URL=http://ci.aztec-labs.com/$RUN_ID
  export DENOISE=1
  export DENOISE_WIDTH=32
}

# We want to run CI with caching - even though it internally uses caching - to quickly catch no-ops that have the same
# git contents.
function run_ci_with_cache {
  local ci_mode=$1
  local job_id=$2
  local bootstrap_cmd=$3

  # Check if CI already succeeded for this content
  local content_hash=$(git rev-parse HEAD^{tree} | cut -c1-16)
  local cache_key="ci-success-${ci_mode}-${content_hash}.txt"

  if cache_download "$cache_key" 2>/dev/null; then
    if [ -f "$cache_key" ] && grep -q "success" "$cache_key"; then
      echo "Found cached success for ${ci_mode} mode with hash $content_hash"
      exit 0
    fi
  fi

  # Spin up ec2 instance and run the CI flow
  export JOB_ID="$job_id"
  bootstrap_ec2 "$bootstrap_cmd"

  # Upload success marker
  echo "success" > success.txt
  cache_upload "$cache_key" success.txt
}

case "$cmd" in
  "fast")
    run_ci_with_cache "fast" "x1-fast" "./bootstrap.sh ci-fast"
    ;;
  "full")
    run_ci_with_cache "full" "x1-full" "./bootstrap.sh ci-full"
    ;;
  "docs")
    run_ci_with_cache "docs" "x1-docs" "./bootstrap.sh ci-docs"
    ;;
  "barretenberg")
    run_ci_with_cache "barretenberg" "x1-barretenberg" "./bootstrap.sh ci-barretenberg"
    ;;
  "grind")
    # Spin up ec2 instance and run the merge-queue flow.
    run() {
      JOB_ID=$1 INSTANCE_POSTFIX=$1 ARCH=$2 exec denoise "bootstrap_ec2 './bootstrap.sh $3'"
    }
    export -f run
    seq 1 ${1:-5} | parallel --termseq 'TERM,10000' --line-buffered --halt now,fail=1  'run $USER-x{}-full amd64 ci-full'
    ;;
  "merge-queue")
    prep_vars
    # Spin up ec2 instance and run the merge-queue flow.
    run() {
      JOB_ID=$1 INSTANCE_POSTFIX=$1 ARCH=$2 exec denoise "bootstrap_ec2 './bootstrap.sh $3'"
    }
    export -f run
    # We perform two full runs of all tests on x86, and a single fast run on arm64 (allowing use of test cache).
    parallel --jobs 10 --termseq 'TERM,10000' --tagstring '{= $_=~s/run (\w+).*/$1/; =}' --line-buffered --halt now,fail=1 ::: \
      'run x1-full amd64 ci-full' \
      'run x2-full amd64 ci-full' \
      'run x3-full amd64 ci-full' \
      'run x4-full amd64 ci-full' \
      'run a1-fast arm64 ci-fast' | DUP=1 cache_log "Merge queue CI run" $RUN_ID
    ;;
  "network-deploy")
    export JOB_ID="x-${NAMESPACE}-network-deploy"
    bootstrap_ec2 "./bootstrap.sh ci-network-deploy"
    ;;
  "network-tests")
    export JOB_ID="x-${NAMESPACE}-network-tests"
    export AWS_SHUTDOWN_TIME=360 # 6 hours for network tests
    bootstrap_ec2 "./bootstrap.sh ci-network-tests"
    ;;
  "nightly")
    prep_vars
    # Spin up ec2 instance and run the nightly flow.
    run() {
      JOB_ID=$1 INSTANCE_POSTFIX=$1 ARCH=$2 exec denoise "bootstrap_ec2 './bootstrap.sh ci-nightly'"
    }
    export -f run
    # We need to run the release flow on both x86 and arm64.
    parallel --termseq 'TERM,10000' --tagstring '{= $_=~s/run (\w+).*/$1/; =}' --line-buffered --halt now,fail=1 ::: \
      'run x-nightly amd64' \
      'run a-nightly arm64' | DUP=1 cache_log "Nightly CI run" $RUN_ID
    ;;
  "release")
    prep_vars
    # Spin up ec2 instance and run the release flow.
    run() {
      JOB_ID=$1 INSTANCE_POSTFIX=$1 ARCH=$2 exec denoise "bootstrap_ec2 './bootstrap.sh ci-release'"
    }
    export -f run
    # We need to run the release flow on both x86 and arm64.
    parallel --termseq 'TERM,10000' --tagstring '{= $_=~s/run (\w+).*/$1/; =}' --line-buffered --halt now,fail=1 ::: \
      'run x-release amd64' \
      'run a-release arm64' | DUP=1 cache_log "Release CI run" $RUN_ID
    ;;
  "shell-new")
    # Spin up ec2 instance, clone, and drop into shell.
    # False triggers the shell on fail.
    cmd="${1:-false}"
    exec bootstrap_ec2 "$cmd"
    ;;
  "shell-container")
    # Drop into a shell in the current running build instance container.
    get_ip_for_instance
    [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
    [ "$#" -eq 0 ] && set -- "zsh" || true
    ssh -tq -F $ci3/aws/build_instance_ssh_config ubuntu@$ip \
      "docker start aztec_build &>/dev/null || true && docker exec -it --user aztec-dev aztec_build $@"
    ;;
  "shell-host")
    # Drop into a shell in the current running build host.
    get_ip_for_instance
    [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
    ssh -t -F $ci3/aws/build_instance_ssh_config ubuntu@$ip
    ;;
  "run")
    # Trigger a GA workflow for current branch PR and tail logs.
    $0 trigger
    $0 rlog
    ;;
  "trigger")
    # Trigger workflow.
    # We use this label trick because triggering the workflow direct doesn't associate with the PR.
    pr_number=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -z "$pr_number" ]; then
      echo "No pull request found for branch $BRANCH."
      exit 1
    fi
    gh pr edit "$pr_number" --remove-label "trigger-workflow" &> /dev/null
    gh pr edit "$pr_number" --add-label "trigger-workflow" &> /dev/null
    sleep 1
    gh pr edit "$pr_number" --remove-label "trigger-workflow" &> /dev/null
    run_id=$(get_latest_run_id)
    echo "In progress..." | redis_setexz $run_id 3600
    echo -e "Triggered CI for PR: $pr_number (ci rlog ${yellow}$run_id${reset})"
    ;;
  "rlog")
    [ -z "${1:-}" ] && run_id=$(get_latest_run_id) || run_id=$1
    output=$(redis_getz $run_id)
    if [ -z "$output" ] || [ "$output" == "In progress..." ]; then
      # If we're in progress, tail live logs from launched instance.
      exec $0 ilog
    else
      echo "$output" | $PAGER
    fi
    ;;
  "ilog")
    while ! tail_live_instance; do
      echo "Waiting on instance with name: $instance_name"
      sleep 10
    done
    ;;
  "dlog")
    if [ "$CI_REDIS_AVAILABLE" -ne 1 ]; then
      echo "No redis available for log query."
      exit 1
    fi
    pager=${PAGER:-less}
    [ ! -t 0 ] && pager=cat
    redis_getz $1 | $pager
    ;;
  "tlog")
    if [ "$CI_REDIS_AVAILABLE" -ne 1 ]; then
      echo "No redis available for test query."
      exit 1
    fi
    pager=${PAGER:-less}
    key=$(hash_str "$1")
    log_key=$(redis_cli --raw GET $key)
    if [ -n "$log_key" ]; then
      redis_getz $log_key | $pager
    else
      echo "No test log found for: $key"
      exit 1
    fi
    ;;
  "tilog")
    # Given a test cmd, tail it's a live log.
    ./ci.sh llog $(hash_str "$1")
  ;;
  "llog")
    # If the log file exists locally, tail it, otherwise assume it's remote.
    key=$1
    if [ -f /tmp/$key ]; then
      tail -F -n +1 /tmp/$key
    else
      ./ci.sh shell tail -F -n +1 /tmp/$key
    fi
  ;;
  "kill")
    existing_instance=$(aws ec2 describe-instances \
      --region us-east-2 \
      --filters "Name=tag:Name,Values=$instance_name" \
      --query "Reservations[].Instances[?State.Name!='terminated'].InstanceId[]" \
      --output text)
    if [ -n "$existing_instance" ]; then
      aws_terminate_instance $existing_instance
    fi
    ;;
  "draft")
    pr_number=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -n "$pr_number" ]; then
      gh pr ready "$pr_number" --undo
      echo "Pull request #$pr_number has been set to draft."
    else
      echo "No pull request found for branch $BRANCH."
    fi
    ;;
  "ready")
    pr_number=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -n "$pr_number" ]; then
      gh pr ready "$pr_number"
      echo "Pull request #$pr_number has been set to ready."
    else
      echo "No pull request found for branch $BRANCH."
    fi
    ;;
  "pr-url")
    # Print the current PR associated with the branch.
    pr_url=$(gh pr list --head "$BRANCH" --limit 1 --json url -q '.[0].url')
    if [ -z "$pr_url" ]; then
      echo "No pull request found for branch '$BRANCH'."
      exit 1
    fi
    echo "$pr_url"
    ;;
  "last-run-url")
    # Print the URL of the last GA run for the current branch PR.
    run_id=$(get_latest_run_id)
    if [ -z "$run_id" ] || [ "$run_id" == "null" ]; then
      echo "No recent GitHub Actions run found for branch '$BRANCH'."
      exit 1
    fi
    repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
    echo "https://github.com/$repo/actions/runs/$run_id"
    ;;
  "help"|"")
    print_usage
    ;;
  "gh-bench")
    cache_download bench-$COMMIT_HASH.tar.gz
    ;;
  "uncached-tests")
    if [ -z "$CI_REDIS_AVAILABLE" ]; then
      echo "Not connected to CI redis."
      exit 1
    fi
    ./bootstrap.sh test_cmds | \
       grep -Ev -f <(yq e '.tests[] | select(.skip == true) | .regex' $root/.test_patterns.yml) | \
       USE_TEST_CACHE=1 filter_cached_test_cmd
    ;;
  *)
    echo "Unknown command: $cmd, see ./ci.sh help"
    exit 1
    ;;
esac
