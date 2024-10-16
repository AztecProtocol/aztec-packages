#!/bin/bash

$(git rev-parse --show-toplevel)/yarn-project/end-to-end/scripts/native_network_test.sh \
        ./test-transfer.sh \
        ./deploy-l1-contracts.sh \
        ./deploy-l2-contracts.sh \
        ./boot-node.sh \
        ./ethereum.sh \
        "./prover-node.sh false" \
        ./pxe.sh