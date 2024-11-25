#!/bin/bash
set -eu

[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
NO_TERMINATE=${NO_TERMINATE:-0}

function on_exit {
    set +e
    if [ -n "$ip" ] && [ "$NO_TERMINATE" -eq 0 ]; then
        echo "Terminating spot instance..."
        ssh ubuntu@$ip sudo halt -p > /dev/null 2>&1
        aws ec2 cancel-spot-instance-requests --spot-instance-request-ids $sir >/dev/null 2>&1 || true
    fi
    if [ -n "$ip" ] && [ "$NO_TERMINATE" -ne 0 ]; then
      echo "Remote machine not terminated, connect with: ssh -t ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker exec -it aztec_build bash'"
    fi
}
trap on_exit EXIT

cd $(dirname $0)

ip_sir=$(./build-system/scripts/request_spot ci3-$USER 64 x86_64)
parts=(${ip_sir//:/ })
ip="${parts[0]}"
sir="${parts[1]}"

[ "$NO_TERMINATE" -eq 0 ] && args="--rm" || args=""

# Get current branch
current_branch=$(git rev-parse --abbrev-ref HEAD)
function check_git() {
  # Fetch remote branch
  git fetch origin "$current_branch"

  # Compare local and remote commits
  local_commit=$(git rev-parse "$current_branch")
  remote_commit=$(git rev-parse "origin/$current_branch")

  test "$local_commit" = "$remote_commit"
}
check_git || (echo "Local branch $current_branch does not match remote branch origin/$current_branch. Not starting build instance." && exit 1)

ssh -F build-system/remote/ssh_config -o SendEnv=AWS_ACCESS_KEY_ID -o SendEnv=AWS_SECRET_ACCESS_KEY ubuntu@$ip "
  docker run $args -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY --name aztec_build -t -v /var/run/docker.sock:/var/run/docker.sock aztecprotocol/build:1.0 bash -c '
    set -e
    # When restarting the container, just hang around.
    while [ -f started ]; do sleep 999; done
    touch started
    cd /root
    git clone --depth 1 --branch $current_branch http://github.com/aztecprotocol/aztec-packages
    cd aztec-packages
    CI=1 ./bootstrap.sh fast
  '
"