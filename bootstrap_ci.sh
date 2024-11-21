#!/bin/bash
set -eu

function on_exit {
    set +e
    if [ -n "$ip" ]; then
        echo "Terminating spot instance..."
        ssh ubuntu@$ip sudo halt -p > /dev/null 2>&1
    fi
}
trap on_exit EXIT

cd $(dirname $0)

ip=$(./build-system/scripts/request_spot charlie-ci3 128 x86_64)

ssh ubuntu@$ip "
  docker run --rm -t aztecprotocol/build:1.0 bash -c '
    cd /root
    git clone http://github.com/aztecprotocol/aztec-packages
    cd aztec-packages
    git checkout cl/ci3
    CI=1 ./bootstrap.sh full
  '
"
