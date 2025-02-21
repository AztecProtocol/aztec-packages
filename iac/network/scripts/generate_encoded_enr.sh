#!/usr/bin/env bash

PRIVATE_KEY=${1:-}
UDP_ADDRESS=${2:-}

OUTPUT=$(cd ~/aztec3-packages/yarn-project/aztec && yarn start generate-bootnode-enr $PRIVATE_KEY $UDP_ADDRESS)
ENR=$(echo "$OUTPUT" | awk -F'ENR: ' '{print $2}')
echo $ENR
