#!/bin/bash
set -eu

NO_TERMINATE=${NO_TERMINATE:-0}

function on_exit {
    set +e
    if [ -n "${ip:-}" ] && [ "$NO_TERMINATE" -eq 0 ]; then
        echo "Terminating spot instance..."
        ssh ubuntu@$ip sudo halt -p > /dev/null 2>&1
        aws ec2 cancel-spot-instance-requests --spot-instance-request-ids $sir >/dev/null 2>&1 || true
    fi
    if [ -n "${ip:-}" ] && [ "$NO_TERMINATE" -ne 0 ]; then
      echo "Remote machine not terminated, connect with: ssh -t ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker exec -it aztec_build bash'"
    fi
}
trap on_exit EXIT

cd $(dirname $0)

current_commit=$(git rev-parse HEAD)

# Verify that the commit exists on the remote. It will be the remote tip of itself if so.
if [ $(git fetch origin --negotiate-only --negotiation-tip=$current_commit) != $current_commit ] ; then
  echo "Commit $current_commit is not pushed. The build instance needs this; exiting."
  exit 1
fi

ip_sir=$(./build-system/scripts/request_spot ci3-$USER 64 x86_64)
parts=(${ip_sir//:/ })
ip="${parts[0]}"
sir="${parts[1]}"

[ "$NO_TERMINATE" -eq 0 ] && args="--rm" || args=""

# - Use ~/.ssh/build_instance_key to ssh into our requested instance (note, could be on-demand if spot fails)
# - Pass our AWS cred through both ssh and docker
# - Mount our docker socket into docker itself for efficient nesting
# - Run in our build container
# Then:
#   - Clone our repo at a certain commit
#   - Run bootstrap.sh fast
ssh -F build-system/remote/ssh_config -o SendEnv=AWS_ACCESS_KEY_ID -o SendEnv=AWS_SECRET_ACCESS_KEY ubuntu@$ip "
  docker run $args -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY --name aztec_build -t -v /var/run/docker.sock:/var/run/docker.sock aztecprotocol/build:1.0 bash -c '
    set -e
    # When restarting the container, just hang around.
    while [ -f started ]; do sleep 999; done
    touch started
    mkdir -p /root/aztec-packages
    cd /root/aztec-packages
    git init
    git remote add origin http://github.com/aztecprotocol/aztec-packages
    git fetch --depth 1 origin $current_commit
    git checkout FETCH_HEAD
    CI=1 ./bootstrap.sh fast
  '
"