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

# Create temporary files for port-forwarding output
boot_tmpfile=$(mktemp)
eth_tmpfile=$(mktemp)

# Set up cleanup for both the temp files and background processes
trap 'echo "Cleaning up port-forwarding processes..."; kill $(jobs -p) 2>/dev/null || true; rm -f "$boot_tmpfile" "$eth_tmpfile"' EXIT

# Start port-forward for boot node
echo "Starting port-forward for boot node..."
kubectl port-forward $NAMESPACE-aztec-network-boot-node-0 :8080 -n $NAMESPACE 2>&1 | tee "$boot_tmpfile" &
boot_pid=$!

# Wait until the forwarding message appears for boot node
echo "Waiting for boot node port-forward to establish..."
timeout=10
start_time=$(date +%s)
while ! grep -q "Forwarding from" "$boot_tmpfile"; do
  current_time=$(date +%s)
  if [ $((current_time - start_time)) -ge $timeout ]; then
    echo "Timeout waiting for boot node port-forward after $timeout seconds"
    kill $boot_pid
    exit 1
  fi
  sleep 0.1
done

# Extract the local port number for boot node
boot_port=$(grep "Forwarding from" "$boot_tmpfile" | sed -nE 's/.*127\.0\.0\.1:([0-9]+).*/\1/p')
echo "Boot node port assigned: $boot_port"

# Start port-forward for eth execution
echo "Starting port-forward for eth execution..."
kubectl port-forward svc/$NAMESPACE-aztec-network-eth-execution :8545 -n $NAMESPACE 2>&1 | tee "$eth_tmpfile" &
eth_pid=$!

# Wait until the forwarding message appears for eth execution
echo "Waiting for eth execution port-forward to establish..."
timeout=10
start_time=$(date +%s)
while ! grep -q "Forwarding from" "$eth_tmpfile"; do
  current_time=$(date +%s)
  if [ $((current_time - start_time)) -ge $timeout ]; then
    echo "Timeout waiting for eth execution port-forward after $timeout seconds"
    kill $eth_pid
    exit 1
  fi
  sleep 0.1
done

# Extract the local port number for eth execution
eth_port=$(grep "Forwarding from" "$eth_tmpfile" | sed -nE 's/.*127\.0\.0\.1:([0-9]+).*/\1/p')
echo "Eth execution port assigned: $eth_port"

echo "Port-forwarding established successfully."

# Use the dynamically assigned ports
registry=$( $EXE get-node-info --json -u "http://localhost:$boot_port" | jq -r .l1ContractAddresses.registry )

echo "Registry: $registry"

export L1_CHAIN_ID=$L1_CHAIN_ID
export ETHEREUM_HOSTS="http://localhost:$eth_port"
$(git rev-parse --show-toplevel)/spartan/scripts/upgrade_rollup_with_lock.sh \
    --aztec-docker-tag $tag \
    --registry $registry \
    --address $ADDRESS \
    --deposit-amount 200000000000000000000000 \
    --mint

