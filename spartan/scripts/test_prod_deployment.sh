#!/usr/bin/env bash

# Test Production Deployment Script
# ================================
#
# This script tests a production-like deployment scenario by simulating a rolling upgrade
# process across two releases. The test follows these steps:
#
# 1. Initial Setup:
#    - Deploys a full cluster ("original" release) with all components using 1-validators.yaml
#    - Runs initial smoke tests to verify deployment
#
# 2. Partial Teardown:
#    - Removes specific components from the original deployment while preserving:
#      * Boot node
#      * Ethereum nodes
#      * Any full nodes
#
# 3. Bridge Configuration:
#    - Sets up port forwarding to the boot node
#    - Retrieves critical network information:
#      * Bootstrap ENR (Ethereum Node Record)
#      * Registry contract address
#      * Slash factory contract address
#
# 4. Secondary Deployment:
#    - Deploys a new "offshoot" release using slim.yaml, which only has a pxe, a validator, and prover infrastructure
#    - Configures the new deployment to use existing network components/rollup
#    - Points new validator/prover nodes to the original boot node enr for p2p bootstrapping
#    - Connects to existing Ethereum services
#
# 5. Final Verification:
#    - Runs smoke tests against the new deployment to ensure functionality
#
# This test validates that the network can maintain functionality during a staged upgrade
# process where some components are replaced while others remain operational.

source $(git rev-parse --show-toplevel)/ci3/source

export NAMESPACE=${NAMESPACE:-prod}
release=original
offshoot="$release-offshoot"
original_values_file=1-validators.yaml
offshoot_values_file=slim.yaml

kubectl delete namespace $NAMESPACE --ignore-not-found=true

HELM_INSTANCE=$release ./test_k8s.sh kind src/spartan/smoke.test.ts $original_values_file $NAMESPACE

# Delete stuff in the original namespace, we'll recreate it in the offshoot
kubectl delete statefulset $release-aztec-network-validator -n $NAMESPACE --wait=true
kubectl delete service $release-aztec-network-validator -n $NAMESPACE --wait=true

kubectl delete statefulset $release-aztec-network-prover-node -n $NAMESPACE --wait=true
kubectl delete service $release-aztec-network-prover-node -n $NAMESPACE --wait=true

kubectl delete statefulset $release-aztec-network-prover-broker -n $NAMESPACE --wait=true
kubectl delete service $release-aztec-network-prover-broker -n $NAMESPACE --wait=true

kubectl delete replicaset $release-aztec-network-prover-agent -n $NAMESPACE --wait=true

kubectl delete deployment $release-aztec-network-pxe -n $NAMESPACE --wait=true
kubectl delete service $release-aztec-network-pxe -n $NAMESPACE --wait=true

kubectl delete statefulset $release-aztec-network-bot -n $NAMESPACE --wait=true
kubectl delete service $release-aztec-network-bot -n $NAMESPACE --wait=true

# At this point, the namespace should just have a boot node and ethereum nodes

tmpfile=$(mktemp)

# Set up cleanup for both the temp file and background processes
trap 'kill $(jobs -p); rm -f "$tmpfile"' EXIT

# Start port-forward in the background and tee its output to a file in order to capture the port number
kubectl -n "$NAMESPACE" port-forward svc/"$release-aztec-network-boot-node" :8080 2>&1 | tee "$tmpfile" &
pf_pid=$!

# Wait until the forwarding message appears, with a 10-second timeout
timeout=10
start_time=$(date +%s)
while ! grep -q "Forwarding from" "$tmpfile"; do
  current_time=$(date +%s)
  if [ $((current_time - start_time)) -ge $timeout ]; then
    echo "Timeout waiting for port-forward after $timeout seconds"
    kill $pf_pid
    exit 1
  fi
  sleep 0.1
done

# Extract the local port number from the message.
forwarded_port=$(grep "Forwarding from" "$tmpfile" | sed -nE 's/.*127\.0\.0\.1:([0-9]+).*/\1/p')
echo "Port assigned: $forwarded_port"

# Point the PXE at the first validator
# Note: this is just for the PXE that we're going to spin up.
# It looks for a "boot node" in its startup scripts when the network is public,
# and we do set it to be a validator service when the network is not public.
# So in this case, by explicitly setting the external bootnode host,
# we save ourselves from trying to reach out to a "boot node" (which won't be there) in both cases.
boot_node_host="http://$offshoot-aztec-network-validator-0.$offshoot-aztec-network-validator.$NAMESPACE.svc.cluster.local:8080"

# Point ethereum clients at the external services
ethereum_execution="http://$release-aztec-network-eth-execution.$NAMESPACE:8545"
ethereum_beacon="http://$release-aztec-network-eth-beacon.$NAMESPACE:5052"

node_info=$(curl -s -X POST -H 'Content-Type: application/json' \
        -d '{"jsonrpc":"2.0","method":"node_getNodeInfo","params":[],"id":42}' \
        "http://localhost:$forwarded_port")

enr=$(jq -r '.result.enr' <<< "$node_info")
registry_address=$(jq -r '.result.l1ContractAddresses.registryAddress' <<< "$node_info")
slash_factory_address=$(jq -r '.result.l1ContractAddresses.slashFactoryAddress' <<< "$node_info")

echo "Boot node host: $boot_node_host"
echo "Ethereum execution: $ethereum_execution"
echo "Ethereum beacon: $ethereum_beacon"
echo "ENR: $enr"
echo "Registry address: $registry_address"
echo "Slash factory address: $slash_factory_address"

export OVERRIDES="bootNode.externalHost=$boot_node_host,ethereum.execution.externalHosts=$ethereum_execution,ethereum.beacon.externalHost=$ethereum_beacon,aztec.contracts.registryAddress=$registry_address,aztec.contracts.slashFactoryAddress=$slash_factory_address,aztec.bootstrapENRs=$enr"

echo "OVERRIDES: $OVERRIDES"

FRESH_INSTALL=false INSTALL_METRICS=false HELM_INSTANCE=$offshoot ./test_k8s.sh kind src/spartan/smoke.test.ts $offshoot_values_file $NAMESPACE
