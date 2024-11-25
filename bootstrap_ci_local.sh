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

current_commit=$(git rev-parse HEAD)

# Verify that the commit exists on the remote. It will be the remote tip of itself if so.
if [ $(git fetch origin --negotiate-only --negotiation-tip=$current_commit) != $current_commit ] ; then
  echo "Commit $current_commit is not pushed, exiting."
  exit 1
fi

docker run --name aztec_build -ti --rm \
  --privileged \
  -v boostrap_ci_local_docker:/var/lib/docker \
  -v $PWD:/aztec-packages-host:ro \
  -v $HOME/.aws:/root/.aws \
  aztecprotocol/ci:2.0 bash -c "
  /usr/local/share/docker-init.sh &> /dev/null
  git config --global --add safe.directory /aztec-packages-host/.git
  mkdir -p /root/aztec-packages && cd /root/aztec-packages
  # Ensure we get a clean clone of the repo.
  git init
  git remote add origin http://github.com/aztecprotocol/aztec-packages
  git fetch --depth 1 origin $current_commit
  git checkout FETCH_HEAD &>/dev/null
  CI=1 ./bootstrap.sh fast || exec /bin/bash
"