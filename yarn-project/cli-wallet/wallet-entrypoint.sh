#!/bin/bash

SOCKET="$HOME/.aztec/aztec-wallet-$RANDOM.sock"

cleanup() {
    kill -9 $SOCAT_PID
    rm -rf $SOCKET
}

socat UNIX-LISTEN:$SOCKET,fork TCP:host.docker.internal:${SSH_AUTH_SOCK_SOCAT_PORT} &
SOCAT_PID=$!
trap cleanup EXIT SIGKILL SIGTERM
SSH_AUTH_SOCK="$SOCKET" node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js $@
