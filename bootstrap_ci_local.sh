#!/bin/bash
set -eu

docker run --name aztec_build -ti --rm \
  -v $PWD:/aztec-packages-host:ro \
  -v /var/run/docker.sock:/var/run/docker.sock \
  aztecprotocol/build:1.0 bash -c '
  set -e
  git config --global --add safe.directory /aztec-packages-host/.git
  cd /root
  # Ensure we get a clean clone of the repo.
  git clone --depth 1 --branch cl/ci3 file:///aztec-packages-host aztec-packages
  cd aztec-packages
  CI=1 ./bootstrap.sh fast
'