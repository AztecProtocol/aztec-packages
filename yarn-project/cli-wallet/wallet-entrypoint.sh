#!/bin/bash

socat UNIX-LISTEN:$HOME/ssh-agent.sock,fork TCP:host.docker.internal:12345 &
SSH_AUTH_SOCK="$HOME/ssh-agent.sock" node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js