#!/bin/bash

REPO=$(git rev-parse --show-toplevel)

ENCLAVE_NAME=${ENCLAVE_NAME:-"ethereum-testnet"}

# Check if the kurtosis CLI is installed
if ! command -v kurtosis &> /dev/null
then
  echo "Kurtosis CLI not found, run ${REPO}/scripts/install_kurtosis.sh"
  exit 1
fi

# Run the kurtosis gateway in the background
kurtosis gateway start &

function cleanup() {
  # kill everything in our process group except our process
  trap - SIGTERM && kill -9 $(pgrep -g $$ | grep -v $$) $(jobs -p) $STERN_PID &>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

echo "Deploying Ethereum Testnet"
kurtosis run --enclave ${ENCLAVE_NAME} github.com/ethpandaops/ethereum-package --args-file ${REPO}/spartan/ethereum-testnet/network_params.yaml --image-download always

echo "Ethereum Testnet deployed successfully"
