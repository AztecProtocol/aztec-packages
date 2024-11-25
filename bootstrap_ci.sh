#!/bin/bash
set -eu

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

ip_sir=$(./build-system/scripts/request_spot ci3-$USER 128 x86_64)
parts=(${ip_sir//:/ })
ip="${parts[0]}"
sir="${parts[1]}"

[ "$NO_TERMINATE" -eq 0 ] && args="--rm" || args=""

ssh ubuntu@$ip "
  docker run --privileged $args --name aztec_build -t \
    -v boostrap_ci_local_docker:/var/lib/docker \
    aztecprotocol/ci:2.0 bash -c '
      set -e
      # When restarting the container, just hang around.
      while [ -f started ]; do sleep 999; done
      touch started
      /usr/local/share/docker-init.sh &> /dev/null
      cd /root
      git clone --depth 1 --branch cl/ci3 http://github.com/aztecprotocol/aztec-packages
      cd aztec-packages
      CI=1 ./bootstrap.sh fast
    '
"