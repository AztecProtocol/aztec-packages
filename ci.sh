#!/bin/bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

CMD=${1:-}
NO_TERMINATE=${NO_TERMINATE:-0}
BRANCH=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}

# Verify that the commit exists on the remote. It will be the remote tip of itself if so.
current_commit=$(git rev-parse HEAD)
if [[ "$(git fetch origin --negotiate-only --negotiation-tip=$current_commit)" != *"$current_commit"* ]] ; then
  echo "Commit $current_commit is not pushed, exiting."
  exit 1
fi

instance_name="${BRANCH//\//_}"

case "$CMD" in
  # Spin up ec2 instance and bootstrap.
  "ec2")
    ./bootstrap_ci.sh
    ;;
  "run")
    # Trigger workflow and drop through to start logging.
    # We use this label trick because triggering the workflow direct doesn't associate with the PR.
    PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    gh pr edit "$PR_NUMBER" --remove-label "trigger-workflow"
    gh pr edit "$PR_NUMBER" --add-label "trigger-workflow"
    sleep 10
    gh pr edit "$PR_NUMBER" --remove-label "trigger-workflow"
    ;&
  "log")
    # Get workflow id of most recent CI3 run for this given branch.
    workflow_id=$(gh workflow list --all --json name,id -q '.[] | select(.name == "CI3").id')

    # Check if we're in progress.
    if gh run list --workflow $workflow_id -b $BRANCH --limit 1 --json status --jq '.[] | select(.status == "in_progress" or .status == "queued")' | grep -q .; then
      # If we're in progress, tail live logs from launched instance,
      while true; do
        ip=$(aws ec2 describe-instances \
          --region us-east-2 \
          --filters "Name=tag:Name,Values=$instance_name" \
          --query "Reservations[].Instances[].PublicIpAddress" \
          --output text)
        if [ -z "$ip" ]; then
          echo "No instance found with name: $instance_name"
          sleep 5
          continue
        fi
        set +e
        ssh -q -t -o ConnectTimeout=5 ubuntu@$ip docker logs -f aztec_build
        code=$?
        set -e
        # Exit loop if SSH exited due to success or ctrl-c.
        [ "$code" -eq 0 ] || [ "$code" -eq 130 ] && break
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
  "ssh")
    ip=$(aws ec2 describe-instances \
      --region us-east-2 \
      --filters "Name=tag:Name,Values=$instance_name" \
      --query "Reservations[].Instances[].PublicIpAddress" \
      --output text)
      ssh -t ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker exec -it aztec_build bash'
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
