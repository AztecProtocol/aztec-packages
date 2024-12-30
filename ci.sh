#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source

cmd=${1:-}
NO_TERMINATE=${NO_TERMINATE:-0}
BRANCH=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}

function echo_cmd {
  local name=$1
  shift
  printf "${blue}${bold}%10s${reset}: %s\n" $name "$(echo $@ | sed 's/\. /.\n            /g')"
}

function print_usage {
  echo "usage: $(basename $0) <cmd>"
  echo
  echo_cmd "ec2"      "Launch an ec2 instance and bootstrap on it. Exactly what Github action does, but doesn't touch GA."
  echo_cmd "local"    "Clone your last commit into the ci container and bootstrap on local hardware."
  echo_cmd "trigger"  "Trigger the GA workflow on the PR associated with the current branch." \
                      "Effectively the same as ec2, only the results will be tracked on your PR."
  echo_cmd "log"      "Will tail the logs of the current GA run, or dump log if already completed."
  echo_cmd "run"      "Same as calling trigger, then log."
  echo_cmd "wt"       "Runs bootstrap in current working tree on local hardware."
  echo_cmd "shell"    "Jump into a new shell on the current running build."
  echo_cmd "attach"   "Attach to terminal of the current running build."
  echo_cmd "ssh-host" "Connect to host instance of the current running build."
  echo_cmd "draft"    "Mark current PR as draft (no automatic CI runs when pushing)."
  echo_cmd "ready"    "Mark current PR as ready (enable automatic CI runs when pushing)."
}

[ -n "$cmd" ] && shift

instance_name=$(echo -n "$BRANCH" | tr -c 'a-zA-Z0-9-' '_')

function get_ip_for_instance {
  [ -n "${1:-}" ] && instance_name+="_$1"
  ip=$(aws ec2 describe-instances \
    --region us-east-2 \
    --filters "Name=tag:Name,Values=$instance_name" \
    --query "Reservations[].Instances[].PublicIpAddress" \
    --output text)
}

case "$cmd" in
  "ec2")
    # Spin up ec2 instance and ci bootstrap with shell on failure.
    # You can override the bootstrap command with the first arg e.g: ci ec2 full
    bootstrap_ec2 "./bootstrap.sh ${1:-ci} || exec zsh" ${2:-}
    ;;
  "ec2-no-cache")
    # Same as ec2, but disable the build and test cache.
    bootstrap_ec2 "USE_CACHE=0 USE_TEST_CACHE=0 ./bootstrap.sh ${1:-ci} || exec zsh" ${2:-}
    ;;
  "ec2-test")
    # Same as ec2, but don't use the test cache.
    bootstrap_ec2 "USE_TEST_CACHE=0 ./bootstrap.sh ci || exec zsh" ${1:-}
    ;;
  "ec2-shell")
    # Spin up ec2 instance, clone, and drop into shell.
    bootstrap_ec2 "exec zsh"
    ;;
  "ec2-grind")
    # Same as ec2-test but repeat it over arg1 instances.
    export DENOISE=1
    num=${1:-5}
    seq 0 $((num - 1)) | parallel --tag --line-buffered "denoise 'bootstrap_ec2 \"USE_TEST_CACHE=0 ./bootstrap.sh ci\" {}'"
    ;;
  "local")
    # Create container with clone of local repo and bootstrap.
    bootstrap_local "$@"
    ;;
  "run")
    # Trigger a GA workflow for current branch PR and tail logs.
    $0 trigger
    $0 log
    ;;
  "wt")
    # Runs bootstrap in current working tree.
    ./bootstrap.sh ci
    ;;
  "trigger")
    # Trigger workflow and drop through to start logging.
    # We use this label trick because triggering the workflow direct doesn't associate with the PR.
    pr_number=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -z "$pr_number" ]; then
      echo "No pull request found for branch $BRANCH."
      exit 1
    fi
    echo "Triggering CI workflow for PR: $pr_number"
    gh pr edit "$pr_number" --remove-label "trigger-workflow" &> /dev/null
    gh pr edit "$pr_number" --add-label "trigger-workflow" &> /dev/null
    sleep 5
    gh pr edit "$pr_number" --remove-label "trigger-workflow" &> /dev/null
    ;;
  "ga-log")
    # Get workflow id of most recent CI3 run for this given branch.
    workflow_id=$(gh workflow list --all --json name,id -q '.[] | select(.name == "CI3").id')

    # Check if we're in progress.
    if gh run list --workflow $workflow_id -b $BRANCH --limit 1 --json status --jq '.[] | select(.status == "in_progress" or .status == "queued")' | grep -q .; then
      # If we're in progress, tail live logs from launched instance,
      while true; do
        get_ip_for_instance
        if [ -z "$ip" ]; then
          echo "Waiting on instance with name: $instance_name"
          sleep 5
          continue
        fi
        set +e
        ssh -q -t -o ConnectTimeout=5 ubuntu@$ip "
          trap 'exit 130' SIGINT
          docker ps -a --filter name=aztec_build --format '{{.Names}}' | grep -q '^aztec_build$' || exit 255
          docker logs -f aztec_build
        "
        code=$?
        set -e
        # Exit loop if not an ssh or missing container error.
        [ "$code" -ne 255 ] && exit $code
        echo "Waiting on aztec_build container..."
        sleep 5
      done
    else
      # If not in progress, dump the log from github.
      run_id=$(gh run list --workflow $workflow_id -b $BRANCH --limit 1 --json databaseId -q .[0].databaseId)
      job_id=$(gh run view $run_id --json jobs -q '.jobs[0].databaseId')
      PAGER= gh run view -j $job_id --log
    fi
    ;;
  "shell")
    get_ip_for_instance ${1:-}
    [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
    ssh -t -F $ci3/aws/build_instance_ssh_config ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker exec -it --user aztec-dev aztec_build zsh'
    ;;
  "attach")
    get_ip_for_instance ${1:-}
    [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
    ssh -t -F $ci3/aws/build_instance_ssh_config ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker attach aztec_build'
   ;;
  "log")
    get_ip_for_instance ${1:-}
    [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
    ssh -t -F $ci3/aws/build_instance_ssh_config ubuntu@$ip 'docker logs -f aztec_build'
    ;;
  "dlog")
    pager=${PAGER:-less}
    [ ! -t 0 ] && pager=cat
    # TODO: Is this ok? We might show a local test log rather than a remote one as the hashes would collide.
    if [ "$(redis-cli --raw EXISTS $1)" -eq 1 ]; then
      redis-cli --raw GET $1 | $pager
    else
      ssh -F $ci3/aws/build_instance_ssh_config ci-bastion.aztecprotocol.com \
        redis-cli -h ci-redis.lzka0i.0001.use2.cache.amazonaws.com --raw GET $1 | $pager
    fi
    ;;
  "shell-host")
    get_ip_for_instance ${1:-}
    [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
    ssh -t -F $ci3/aws/build_instance_ssh_config ubuntu@$ip
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
  "test-kind-network")
    test=${1:-transfer.test.ts}
    values=${2:-3-validators}
    ./bootstrap.sh image-e2e
    cd yarn-project/end-to-end
    NAMESPACE="kind-network-test" FRESH_INSTALL=true VALUES_FILE=$values.yaml ./scripts/network_test.sh ./src/spartan/$test
    ;;
  "test-network")
    shift 1
    scripts/run_native_testnet.sh -i $@
    ;;
  "gha-url")
    workflow_id=$(gh workflow list --all --json name,id -q '.[] | select(.name == "CI").id')
    run_url=$(gh run list --workflow $workflow_id -b $BRANCH --limit 1 --json url -q '.[0].url')
    if [ -z "$run_url" ]; then
      echo "No workflow runs found for branch '$BRANCH'."
      exit 1
    fi
    echo "$run_url"
    ;;
  "help"|"")
    print_usage
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
    ;;
esac
