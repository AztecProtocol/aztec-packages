#!/bin/sh
set -eu

cd $(dirname $0)

if [ ! -d "$HOME/.devbox" ]; then
  cp -R ./home $HOME/.devbox
fi

docker run \
  -ti --rm \
  --hostname devbox \
  -e LOCAL_USER_ID=$(id -u) \
  -e LOCAL_GROUP_ID=$(id -g) \
  -v$HOME/.devbox:/home/aztec-dev \
  -v$HOME/.ssh:/home/aztec-dev/.ssh:ro \
  -v/var/run/docker.sock:/var/run/docker.sock \
  aztecprotocol/devbox
