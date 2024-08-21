#!/bin/bash

socat UNIX-LISTEN:$HOME/ssh-agent.internal.sock,fork TCP:host.docker.internal:${SSH_AUTH_SOCK_SOCAT_PORT} &
SSH_AUTH_SOCK="$HOME/ssh-agent.internal.sock" node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js $@