#!/bin/bash

if [ -n "${SSH_AUTH_SOCK:-}" ]; then
    chmod a+w /run/host-services/ssh-auth.sock
fi

node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js "$@"
 