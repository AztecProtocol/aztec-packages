#!/bin/bash
set -eu

NO_TERMINATE=${NO_TERMINATE:-0}

function on_exit {
    set +e
    if [ -n "$ip" ] && [ "$NO_TERMINATE" -eq 0 ]; then
        echo "Terminating spot instance..."
        ssh ubuntu@$ip sudo halt -p > /dev/null 2>&1
    fi
    if [ -n "$ip" ] && [ "$NO_TERMINATE" -ne 0 ]; then
      echo "Remote machine not terminated, connect with: ssh -t ubuntu@$ip 'docker start aztec_build >/dev/null 2>&1 || true && docker exec -it aztec_build bash'"
    fi
}
trap on_exit EXIT

cd $(dirname $0)

ip=$(./build-system/scripts/request_spot charlie-ci3 128 x86_64)

[ "$NO_TERMINATE" -eq 0 ] && args="--rm" || args=""

ssh ubuntu@$ip "
  docker run $args --name aztec_build -t -v /var/run/docker.sock:/var/run/docker.sock aztecprotocol/build:1.0 bash -c '
    cd /root
    git clone http://github.com/aztecprotocol/aztec-packages
    cd aztec-packages
    git checkout cl/ci3
    CI=1 ./bootstrap.sh fast
  '
"