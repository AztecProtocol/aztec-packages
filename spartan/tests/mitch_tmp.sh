#!/bin/bash

set -eu

NAMESPACE=$1
ADDRESS=${2:-"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"} # first addr in junk mnemonic
L1_CHAIN_ID=${3:-1337}

image=$(kubectl get pod $NAMESPACE-aztec-network-boot-node-0 -n $NAMESPACE -o jsonpath="{.spec.containers[*].image}")
tag=$(echo $image | cut -d ':' -f 2)

echo $image

# pull the image if it's not already pulled
if ! docker images $image --format "{{.Repository}}:{{.Tag}}" | grep -q $image; then
    docker pull $image
fi


AZTEC_BIN="/usr/src/yarn-project/aztec/dest/bin/index.js"
EXE="docker run --rm --network=host  $image $AZTEC_BIN"


# Set up trap to kill all background processes on exit
trap 'echo "Cleaning up port-forwarding processes..."; kill $(jobs -p) 2>/dev/null || true' EXIT

# Start port-forwarding in background
echo "Starting port-forwarding..."
kubectl port-forward $NAMESPACE-aztec-network-boot-node-0 8080:8080 -n $NAMESPACE &
kubectl port-forward svc/$NAMESPACE-aztec-network-eth-execution 8545:8545 -n $NAMESPACE &

# Wait for port-forwarding to establish
echo "Waiting for port-forwarding to establish..."
sleep 3

# Verify ports are listening
if ! nc -z localhost 8080 >/dev/null 2>&1; then
    echo "Port 8080 is not available. Port-forwarding may have failed."
    exit 1
fi

if ! nc -z localhost 8545 >/dev/null 2>&1; then
    echo "Port 8545 is not available. Port-forwarding may have failed."
    exit 1
fi

echo "Port-forwarding established successfully."

registry=$( $EXE get-node-info --json | jq -r .l1ContractAddresses.registry )

echo $registry


export L1_CHAIN_ID=$L1_CHAIN_ID
$(git rev-parse --show-toplevel)/spartan/scripts/upgrade_rollup_with_lock.sh \
    --aztec-docker-tag $tag \
    --registry $registry \
    --address $ADDRESS \
    --deposit-amount 200000000000000000000000 \
    --mint

