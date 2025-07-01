#!/usr/bin/env bash
set -euo pipefail

trap 'docker rm -f $1 &>/dev/null' SIGINT SIGTERM EXIT
docker rm -f $1 &>/dev/null || true
docker run --rm \
  -d \
  --privileged \
  --name $1 \
  -v$(git rev-parse --show-toplevel):/home/ubuntu/aztec-packages:ro \
  -v$HOME/.bb-crs:/home/ubuntu/.bb-crs \
  --mount type=tmpfs,target=/var/lib/docker,tmpfs-size=4g \
  aztecprotocol/dind \
  bash -c "
    tail -f /dev/null
  " >/dev/null

docker save aztecprotocol/aztec:latest | docker exec -i $1 \
  bash -c "
    echo 'Starting docker...'
    while ! docker info &>/dev/null; do
      /usr/local/share/docker-init.sh &>/dev/null
      sleep 3
      cat /tmp/dockerd.log
    done
    chmod 777 /var/run/docker.sock
    echo 'Loading image...'
    docker load
  "

# If we're running in a terminal, run the container interactively.
# Drop into a shell if the test fails.
if [ -t 0 ]; then
  args="-ti"
  fail_shell="|| exec bash"
fi

docker exec ${args:-} -w/home/ubuntu --user ubuntu:ubuntu $1 \
  bash -c "
    ./aztec-packages/aztec-up/test/$1.sh ${fail_shell:-}
    code=\${PIPESTATUS[0]}
    if [ \$code -ne 0 ]; then
      echo 'Dumping docker logs...'
      cat /tmp/dockerd.log
    fi
    exit \$code
  "
