#!/bin/bash

ENCLAVE_NAME=${ENCLAVE_NAME:-"ethereum-testnet"}

# Run the kurtosis gateway in the background
kurtosis gateway start &>/dev/null &

function cleanup() {
  # kill everything in our process group except our process
  trap - SIGTERM && kill -9 $(pgrep -g $$ | grep -v $$) $(jobs -p) $STERN_PID &>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

kurtosis enclave rm -f ${ENCLAVE_NAME}