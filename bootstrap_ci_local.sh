#!/bin/bash
set -eu

docker run --name aztec_build -ti --rm \
  --privileged \
  -v $PWD:/aztec-packages-host:ro \
  -v $HOME/.aws:/root/.aws \
  aztecprotocol/ci:2.0 bash -c '
  /usr/local/share/docker-init.sh &> /dev/null
  git config --global --add safe.directory /aztec-packages-host/.git
  cd /root
  # Ensure we get a clean clone of the repo.
  git clone --depth 1 --branch cl/ci3 file:///aztec-packages-host aztec-packages
  cd aztec-packages
  CI=1 ./bootstrap.sh fast || exec /bin/bash
'