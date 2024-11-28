#!/bin/bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

CMD=${1:-}
NO_TERMINATE=${NO_TERMINATE:-0}
BRANCH=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}

# Verify that the commit exists on the remote. It will be the remote tip of itself if so.
current_commit=$(git rev-parse HEAD)
if [[ "$(git fetch origin --negotiate-only --negotiation-tip=$current_commit)" != *"$current_commit"* ]]; then
  echo "Commit $current_commit is not pushed, exiting."
  exit 1
fi

instance_name="${BRANCH//\//_}"

ip=$(aws ec2 describe-instances \
  --region us-east-2 \
  --filters "Name=tag:Name,Values=$instance_name" \
  --query "Reservations[].Instances[].PublicIpAddress" \
  --output text)

case "$CMD" in
  # Spin up ec2 instance and bootstrap.
  "ec2")
    $ci3/bootstrap/ec2
    ;;
  "local")
    $ci3/bootstrap/local
    ;;
  "run")
    $0 trigger
    $0 log
    ;;
  "trigger")
    # Trigger workflow and drop through to start logging.
    # We use this label trick because triggering the workflow direct doesn't associate with the PR.
    PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -z "$PR_NUMBER" ]; then
      echo "No pull request found for branch $BRANCH."
      exit 1
    fi
    echo "Triggering CI workflow for PR: $PR_NUMBER"
    gh pr edit "$PR_NUMBER" --remove-label "trigger-workflow" &> /dev/null
    gh pr edit "$PR_NUMBER" --add-label "trigger-workflow" &> /dev/null
    sleep 5
    gh pr edit "$PR_NUMBER" --remove-label "trigger-workflow" &> /dev/null
    ;&
  "log")
    # Get workflow id of most recent CI3 run for this given branch.
    workflow_id=$(gh workflow list --all --json name,id -q '.[] | select(.name == "CI3").id')

    # Check if we're in progress.
    if gh run list --workflow $workflow_id -b $BRANCH --limit 1 --json status --jq '.[] | select(.status == "in_progress" or .status == "queued")' | grep -q .; then
      # If we're in progress, tail live logs from launched instance,
      while true; do
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
      [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
      ssh -t ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker exec -it aztec_build bash'
      exit 0
    ;;
  "attach")
      [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
      ssh -t ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker attach aztec_build'
      exit 0
    ;;
  "ssh-host")
      [ -z "$ip" ] && echo "No instance found: $instance_name" && exit 1
      ssh -t ubuntu@$ip
      exit 0
    ;;
  "draft")
    PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -n "$PR_NUMBER" ]; then
      gh pr ready "$PR_NUMBER" --undo
      echo "Pull request #$PR_NUMBER has been set to draft."
    else
      echo "No pull request found for branch $BRANCH."
    fi
    exit 0
    ;;
  "ready")
    PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -n "$PR_NUMBER" ]; then
      gh pr ready "$PR_NUMBER"
      echo "Pull request #$PR_NUMBER has been set to ready."
    else
      echo "No pull request found for branch $BRANCH."
    fi
    exit 0
    ;;
  *)
    echo "Unknown command: $CMD"
    exit 1
    ;;
esac
