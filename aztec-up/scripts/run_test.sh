#!/bin/bash
set -euo pipefail

trap 'docker kill $1 &>/dev/null' EXIT

docker run --rm \
  -d \
  --privileged \
  --name $1 \
  -v$(git rev-parse --show-toplevel):/root/aztec-packages:ro \
  --mount type=tmpfs,target=/var/lib/docker,tmpfs-size=4g \
  aztecprotocol/dind \
  bash -c "
    /usr/local/share/docker-init.sh &>/dev/null
    tail -f /dev/null
  " >/dev/null

docker save aztecprotocol/aztec:latest | docker exec -i $1 \
  bash -c "
    /usr/local/share/docker-init.sh &>/dev/null
    echo 'Loading image...'
    docker load
  "

if [ -t 0 ]; then
  args="-ti"
  fail_shell="|| exec bash"
fi

docker exec ${args:-} -w/root $1 \
  bash -c "
    ./aztec-packages/aztec-up/test/$1.sh ${fail_shell:-}
  "
