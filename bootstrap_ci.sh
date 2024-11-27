#!/bin/bash
set -eu

CMD=${1:-}
NO_TERMINATE=${NO_TERMINATE:-0}
GITHUB_ACTIONS=${GITHUB_ACTIONS:-}

cd $(dirname $0)

function gh_start_group {
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::group::$1" || true
}

function gh_end_group {
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::endgroup::" || true
}

# Trap function to terminate our running instance when the script exits.
function terminate_instance {
    set +e
    if [ -n "${ip:-}" ] && [ "$NO_TERMINATE" -eq 0 ]; then
        echo "Terminating instance..."
        ssh ubuntu@$ip sudo halt -p > /dev/null 2>&1
        aws ec2 cancel-spot-instance-requests --spot-instance-request-ids $sir >/dev/null 2>&1
    fi
    if [ -n "${ip:-}" ] && [ "$NO_TERMINATE" -ne 0 ]; then
      echo "Remote machine not terminated, connect with: ssh -t ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker exec -it aztec_build bash'"
    fi
}

# Verify that the commit exists on the remote. It will be the remote tip of itself if so.
current_commit=$(git rev-parse HEAD)
if [[ "$(git fetch origin --negotiate-only --negotiation-tip=$current_commit)" != *"$current_commit"* ]] ; then
  echo "Commit $current_commit is not pushed, exiting."
  exit 1
fi

instance_name=$(git rev-parse --abbrev-ref HEAD | sed 's|/|_|g')

if [ "$CMD" == "log" ]; then
  ip=$(aws ec2 describe-instances \
    --region us-east-2 \
    --filters "Name=tag:Name,Values=$instance_name" \
    --query "Reservations[].Instances[].PublicIpAddress" \
    --output text)
  if [ -z "$ip" ]; then
    echo "No instance found with name: $instance_name"
    exit 1
  fi
  while true; do
    ssh -t ubuntu@$ip docker logs -f aztec_build
    [ $? -eq 130 ] && break  # Exit if SSH exited due to Ctrl-C (exit code 130)
    sleep 5
  done
  exit 0
fi

gh_start_group "Request Build Instance"
ip_sir=$(./build-system/scripts/request_spot $instance_name 128 x86_64)
parts=(${ip_sir//:/ })
ip="${parts[0]}"
sir="${parts[1]}"
trap terminate_instance EXIT
gh_end_group

# pass env vars to inform if we are inside github actions, and our AWS creds
args="-e GITHUB_ACTIONS='$GITHUB_ACTIONS' -e AWS_ACCESS_KEY_ID='${AWS_ACCESS_KEY_ID:-}' -e AWS_SECRET_ACCESS_KEY='${AWS_SECRET_ACCESS_KEY:-}'"
[ "$NO_TERMINATE" -eq 0 ] && args+=" --rm"

# - Use ~/.ssh/build_instance_key to ssh into our requested instance (note, could be on-demand if spot fails)
# - Run in our build container, cloning commit and running bootstrap.sh
gh_start_group "Start CI Image"
ssh -F build-system/remote/ssh_config ubuntu@$ip "
  docker run --privileged $args --name aztec_build -t \
    -v boostrap_ci_local_docker:/var/lib/docker \
    aztecprotocol/ci:2.0 bash -c '
      [ -n \"$GITHUB_ACTIONS\" ] && echo "::endgroup::"
      [ -n \"$GITHUB_ACTIONS\" ] && echo "::group::Clone Repository"
      set -e
      # When restarting the container, just hang around.
      while [ -f started ]; do sleep 999; done
      touch started
      /usr/local/share/docker-init.sh &> /dev/null
      mkdir -p /root/aztec-packages
      cd /root/aztec-packages
      git init &>/dev/null
      git remote add origin http://github.com/aztecprotocol/aztec-packages
      git fetch --depth 1 origin $current_commit
      git checkout FETCH_HEAD >/dev/null
      [ -n \"$GITHUB_ACTIONS\" ] && echo "::endgroup::"
      CI=1 ./bootstrap.sh fast
    '
"