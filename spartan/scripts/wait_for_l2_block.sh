#!/usr/bin/env bash
# Waits for at least one L2 block to be mined.
# Usage: wait_for_l2_block.sh <namespace>
#
# Required environment variables:
#   AZTEC_SLOT_DURATION - seconds per L2 slot
#   AZTEC_EPOCH_DURATION - slots per epoch
#   AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET - epochs to wait for validator set

set -euo pipefail

namespace="${1:?namespace is required}"

slot_duration="${AZTEC_SLOT_DURATION:?AZTEC_SLOT_DURATION must be set}"
epoch_duration="${AZTEC_EPOCH_DURATION:?AZTEC_EPOCH_DURATION must be set}"
lag_epochs="${AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET:?AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET must be set}"

# Time to first block = lag_epochs * epoch_duration * slot_duration + buffer
# Add 2x buffer for deployment overhead, validator registration, etc.
expected_wait=$((lag_epochs * epoch_duration * slot_duration))
max_wait=$((expected_wait * 2 + 120))  # 2x expected + 2min buffer
poll_interval=10

echo "Waiting for L2 blocks (slot=${slot_duration}s, epoch=${epoch_duration} slots, lag=${lag_epochs} epochs)"
echo "Expected first block in ~${expected_wait}s, max wait ${max_wait}s"

rpc_pod="${namespace}-rpc-aztec-node-0"
elapsed=0
while [ $elapsed -lt $max_wait ]; do
  block_number=$(kubectl exec -n "$namespace" "$rpc_pod" -- \
    curl -s -X POST http://localhost:8080 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"node_getBlockNumber","params":[],"id":1}' 2>/dev/null \
    | grep -o '"result":[0-9]*' | grep -o '[0-9]*' || echo "0")

  if [ "$block_number" -ge 1 ] 2>/dev/null; then
    echo "L2 block $block_number mined after ${elapsed}s"
    exit 0
  fi

  echo "Waiting for L2 blocks... (${elapsed}s/${max_wait}s, block: ${block_number:-0})"
  sleep $poll_interval
  elapsed=$((elapsed + poll_interval))
done

echo "Warning: No L2 blocks mined after ${max_wait}s"
exit 1
