#!/bin/bash
# Argument 1 is the command to run.
# Argument 2 is the unique name of the target instance. Defaults to the branch name.
source $(git rev-parse --show-toplevel)/ci3/source

cmd=${1:-}
NO_TERMINATE=${NO_TERMINATE:-0}
BRANCH=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}

function echo_cmd {
  local name=$1
  shift
  printf "${blue}${bold}%10s${reset}: %s\n" $name "$(echo $@ | sed 's/\. /.\n            /g')"
}

if [ -z "$cmd" ]; then
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
  exit 0
fi

shift

# Verify that the commit exists on the remote. It will be the remote tip of itself if so.
current_commit=$(git rev-parse HEAD)
function enforce_pushed_commit {
  if [[ "$(git fetch origin --negotiate-only --negotiation-tip=$current_commit)" != *"$current_commit"* ]]; then
    echo "Commit $current_commit is not pushed, exiting."
    exit 1
  fi
}

instance_name="${BRANCH//\//_}"

function get_ip_for_instance {
  local name=$instance_name
  [ -n "${1:-}" ] && name+="_$1"
  ip=$(aws ec2 describe-instances \
    --region us-east-2 \
    --filters "Name=tag:Name,Values=$name" \
    --query "Reservations[].Instances[].PublicIpAddress" \
    --output text)
}

case "$cmd" in
  "ec2")
    enforce_pushed_commit
    # Spin up ec2 instance and ci bootstrap with shell on failure.
    bootstrap_ec2 "./bootstrap.sh ci || exec bash" ${1:-}
    ;;
  "ec2-full")
    enforce_pushed_commit
    # Spin up ec2 instance and full bootstrap with shell on failure.
    bootstrap_ec2 "./bootstrap.sh full || exec bash" ${1:-}
    ;;
  "ec2-full-test")
    enforce_pushed_commit
    # Spin up ec2 instance and full bootstrap with tests and shell on failure.
    bootstrap_ec2 "USE_CACHE=0 ./bootstrap.sh ci || exec bash" ${1:-}
    ;;
  "ec2-shell")
    enforce_pushed_commit
    # Spin up ec2 instance and drop into shell.
    bootstrap_ec2 "exec bash"
    ;;
  "ec2-e2e")
    enforce_pushed_commit
    bootstrap_ec2 "./bootstrap.sh fast && cd yarn-project && ./bootstrap.sh test-e2e" ${1:-}
    ;;
  "ec2-e2e-grind")
    enforce_pushed_commit
    export DENOISE=1
    num=${1:-5}
    seq 0 $((num - 1)) | parallel --tag --line-buffered denoise $0 ec2-e2e {}
    ;;
  "local")
    # Create container with clone of local repo and bootstrap.
    bootstrap_local
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
    local pr_number=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -z "$pr_number" ]; then
      echo "No pull request found for branch $BRANCH."
      exit 1
    fi
    echo "Triggering CI workflow for PR: $pr_number"
    gh pr edit "$pr_number" --remove-label "trigger-workflow" &> /dev/null
    gh pr edit "$pr_number" --add-label "trigger-workflow" &> /dev/null
    sleep 5
    gh pr edit "$pr_number" --remove-label "trigger-workflow" &> /dev/null
    ;&
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
    exit 0
    ;;
  "shell")
      get_ip_for_instance ${1:-}
      [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
      ssh -t -F $ci3/aws/build_instance_ssh_config ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker exec -it aztec_build bash'
      exit 0
    ;;
  "attach")
      get_ip_for_instance ${1:-}
      [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
      ssh -t -F $ci3/aws/build_instance_ssh_config ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker attach aztec_build'
      exit 0
    ;;
  "log")
      get_ip_for_instance ${1:-}
      [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
      ssh -t -F $ci3/aws/build_instance_ssh_config ubuntu@$ip 'docker logs -f aztec_build'
      exit 0
    ;;
  "shell-host")
      get_ip_for_instance ${1:-}
      [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
      ssh -t -F $ci3/aws/build_instance_ssh_config ubuntu@$ip
      exit 0
    ;;
  "draft")
    local pr_number=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -n "$pr_number" ]; then
      gh pr ready "$pr_number" --undo
      echo "Pull request #$pr_number has been set to draft."
    else
      echo "No pull request found for branch $BRANCH."
    fi
    exit 0
    ;;
  "ready")
    local pr_number=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -n "$pr_number" ]; then
      gh pr ready "$pr_number"
      echo "Pull request #$pr_number has been set to ready."
    else
      echo "No pull request found for branch $BRANCH."
    fi
    exit 0
    ;;
  "test-kind-network")
    test=${1:-transfer.test.ts}
    values=${2:-3-validators}
    ./bootstrap.sh image-e2e
    cd yarn-project/end-to-end
    NAMESPACE="kind-network-test" FRESH_INSTALL=true VALUES_FILE=$values.yaml ./scripts/network_test.sh ./src/spartan/$test
    exit 0
    ;;
  "test-network")
    shift 1
    scripts/run_native_testnet.sh -i $@
    exit 0
    ;;
  "gha-url")
    # TODO(ci3) change over to CI3 once fully enabled.
    workflow_id=$(gh workflow list --all --json name,id -q '.[] | select(.name == "CI").id')
    run_url=$(gh run list --workflow $workflow_id -b $BRANCH --limit 1 --json url -q '.[0].url')
    if [ -z "$run_url" ]; then
      echo "No workflow runs found for branch '$BRANCH'."
      exit 1
    fi
    echo "$run_url"
    exit 0
    ;;
  *)
    echo "usage: $0 ec2|ec2-e2e|ec2-e2e-grind|local|run|wt|trigger|log|shell|attach|ssh-host|draft|ready|test-kind-network|test-network|gha-url"
    exit 1
    ;;
esac
