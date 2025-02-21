#!/usr/bin/env bash

OUTPUT=$(cd ~/aztec3-packages/yarn-project/aztec && yarn start generate-p2p-private-key)
PRIVATE_KEY=$(echo "$OUTPUT" | awk -F'Private key: ' '{print $2}' | awk '{print $1}')
echo $PRIVATE_KEY
