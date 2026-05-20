#!/usr/bin/env bash
# Waits for at least one L2 block to be mined.
# Usage: wait_for_l2_block.sh <namespace>
#
# Required environment variables:
#   AZTEC_SLOT_DURATION - seconds per L2 slot
#   AZTEC_EPOCH_DURATION - slots per epoch
#   AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET - epochs to wait for validator set
#   AZTEC_LAG_IN_EPOCHS_FOR_RANDAO - epochs to wait for RANDAO seed

set -euo pipefail

namespace="${1:?namespace is required}"

slot_duration="${AZTEC_SLOT_DURATION:?AZTEC_SLOT_DURATION must be set}"
epoch_duration="${AZTEC_EPOCH_DURATION:?AZTEC_EPOCH_DURATION must be set}"
validator_lag_epochs="${AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET:?AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET must be set}"
randao_lag_epochs="${AZTEC_LAG_IN_EPOCHS_FOR_RANDAO:-$validator_lag_epochs}"

if [ "$validator_lag_epochs" -gt "$randao_lag_epochs" ]; then
  lag_epochs="$validator_lag_epochs"
else
  lag_epochs="$randao_lag_epochs"
fi

# A fresh rollup needs lag + 1 complete epochs before the first committee-backed
# block can be proposed. Add half an epoch plus 5m for deployment and RPC jitter.
warmup_epochs=$((lag_epochs + 1))
expected_wait=$((warmup_epochs * epoch_duration * slot_duration))
buffer=$((epoch_duration * slot_duration / 2 + 300))
max_wait="${L2_BLOCK_WAIT_TIMEOUT_SECONDS:-$((expected_wait + buffer))}"
poll_interval=10

echo "Waiting for L2 blocks (slot=${slot_duration}s, epoch=${epoch_duration} slots, validator_lag=${validator_lag_epochs}, randao_lag=${randao_lag_epochs})"
echo "Expected first block after ~${expected_wait}s from genesis, max wait ${max_wait}s from now"

rpc_pod="${namespace}-rpc-aztec-node-0"
block_number_request="{\"jsonrpc\":\"2.0\",\"method\":\"node_getBlockNumber\",\"params\":[],\"id\":1}"
elapsed=0
while [ $elapsed -lt $max_wait ]; do
  block_number=$(kubectl --request-timeout=10s exec -n "$namespace" "$rpc_pod" -- \
    sh -c "curl --max-time 5 -s -X POST http://localhost:8080 \
      -H \"Content-Type: application/json\" \
      -d \"\$1\" \
      | jq -r \".result // 0\"" \
    sh "$block_number_request" 2>/dev/null || echo "0")

  if [ "$block_number" -ge 1 ] 2>/dev/null; then
    echo "L2 block $block_number mined after ${elapsed}s"
    exit 0
  fi

  echo "Waiting for L2 blocks... (${elapsed}s/${max_wait}s, block: ${block_number:-0})"
  sleep_for=$poll_interval
  remaining=$((max_wait - elapsed))
  if [ "$remaining" -lt "$sleep_for" ]; then
    sleep_for=$remaining
  fi
  if [ "$sleep_for" -le 0 ]; then
    break
  fi
  sleep "$sleep_for"
  elapsed=$((elapsed + sleep_for))
done

echo "Warning: No L2 blocks mined after ${max_wait}s"
exit 1
