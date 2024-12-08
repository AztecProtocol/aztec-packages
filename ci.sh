#!/bin/bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source

cmd=${1:-}
shift
NO_TERMINATE=${NO_TERMINATE:-0}
BRANCH=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}

if [ -z "$cmd" ]; then
  echo "usage: $0 <cmd>"
  echo
  echo "The following commands all set CI=1 before bootstrapping."
  echo
  echo "      ec2: Launch an ec2 instance and bootstrap on it."
  echo "           Exactly what Github action does, but doesn't touch GA."
  echo "    local: Clone your last commit into the ci container and bootstrap on local hardware."
  echo "  trigger: Trigger the GA workflow on the PR associated with the current branch."
  echo "           Effectively the same as ec2, only the results will be tracked on your PR."
  echo "      log: Will tail the logs of the current GA run, or dump log if already completed."
  echo "      run: Same as calling trigger, then log."
  echo "       wt: Runs bootstrap in current working tree on local hardware."
  echo "    shell: Jump into a new shell on the current running build."
  echo "   attach: Attach to terminal of the current running build."
  echo " ssh-host: Connect to host instance of the current running build."
  echo "    draft: Mark current PR as draft (no automatic CI runs when pushing)."
  echo "    ready: Mark current PR as ready (enable automatic CI runs when pushing)."
  exit 0
fi

# Verify that the commit exists on the remote. It will be the remote tip of itself if so.
current_commit=$(git rev-parse HEAD)
if [[ "$(git fetch origin --negotiate-only --negotiation-tip=$current_commit)" != *"$current_commit"* ]]; then
  echo "Commit $current_commit is not pushed, exiting."
  exit 1
fi

instance_name="${BRANCH//\//_}"

function get_ip_for_instance {
  ip=$(aws ec2 describe-instances \
    --region us-east-2 \
    --filters "Name=tag:Name,Values=$instance_name" \
    --query "Reservations[].Instances[].PublicIpAddress" \
    --output text)
}

case "$cmd" in
  "ec2")
    # Spin up ec2 instance and execute given command or default (fast bootstrap with shell on failure).
    bootstrap_ec2 "${1:-}" ${2:-}
    ;;
  "ec2-full")
    # Spin up ec2 instance and full bootstrap.
    bootstrap_ec2 "./bootstrap.sh full || exec bash" ${1:-}
    ;;
  "ec2-shell")
    # Spin up ec2 instance and drop into shell.
    bootstrap_ec2 "exec bash"
    ;;
  "ec2-e2e")
    bootstrap_ec2 "./bootstrap.sh fast && cd yarn-project && ./bootstrap.sh test-e2e" $1
    ;;
  "ec2-e2e-grind")
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
  "log")
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
      get_ip_for_instance
      [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
      ssh -t ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker exec -it aztec_build bash'
      exit 0
    ;;
  "attach")
      get_ip_for_instance
      [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
      ssh -t ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker attach aztec_build'
      exit 0
    ;;
  "shell-host")
      get_ip_for_instance
      [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
      ssh -t ubuntu@$ip
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
  *)
    echo "Unknown command: $cmd"
    exit 1
    ;;
esac
