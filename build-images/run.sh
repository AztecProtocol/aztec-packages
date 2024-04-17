#!/bin/sh
set -eu

cd $(dirname $0)

if [ ! -d "$HOME/.devbox" ]; then
  cp -R ./home $HOME/.devbox
fi

if [[ "$OSTYPE" == "linux"* ]]; then
  ID_ARGS="-e LOCAL_USER_ID=$(id -u) -e LOCAL_GROUP_ID=$(id -g)"
fi

docker run \
  -ti --rm \
  --hostname devbox \
  -e SSH_CONNECTION=' ' \
  ${ID_ARGS:-} \
  -w/workspaces/aztec-packages \
  -v$PWD/..:/workspaces/aztec-packages \
  -v$HOME/.devbox:/home/aztec-dev \
  -v$HOME/.ssh:/home/aztec-dev/.ssh:ro \
  -v/var/run/docker.sock:/var/run/docker.sock \
  aztecprotocol/codespace
