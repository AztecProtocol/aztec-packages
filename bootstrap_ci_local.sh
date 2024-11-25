#!/bin/bash
# Launches our CI image locally and runs the bootstrap.
# This replicates exactly what our CI run experiences.
# It uses docker-in-docker as some test flows require it (e.g. e2e).
# We use a volume on /var/lib/docker as overlayfs trashes performance (in fact it just breaks).
# We mount in aws credentials to leverage the s3 cache.
# The host repository is mounted in read-only, and a clone is taken to ensure a clean start.
# If anything goes wrong during the run, the container will drop into a shell.
#
# TODO: The docker flows need to pull images. Kinda sucks as they're right on the host (and maybe more up-to-date).
# Preload them in?
# The docker volume makes the image partly stateful.
set -eu

docker run --name aztec_build -ti --rm \
  --privileged \
  -v boostrap_ci_local_docker:/var/lib/docker \
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