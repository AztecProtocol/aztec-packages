#!/usr/bin/env bash
# Generates slasher-defaults.ts from common.env.
#
# Source: spartan/environments/common.env (slasher node defaults)
# Output: yarn-project/slasher/src/generated/slasher-defaults.ts
set -euo pipefail

cd $(git rev-parse --show-toplevel)
source spartan/scripts/codegen_helper.sh

SLASHER_KEYS="
  SLASH_OFFENSE_EXPIRATION_ROUNDS
  SLASH_MAX_PAYLOAD_SIZE
  SLASH_EXECUTE_ROUNDS_LOOK_BACK
  SLASH_PRUNE_PENALTY
  SLASH_DATA_WITHHOLDING_PENALTY
  SLASH_INACTIVITY_TARGET_PERCENTAGE
  SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD
  SLASH_INACTIVITY_PENALTY
  SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY
  SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY
  SLASH_DUPLICATE_PROPOSAL_PENALTY
  SLASH_DUPLICATE_ATTESTATION_PENALTY
  SLASH_UNKNOWN_PENALTY
  SLASH_INVALID_BLOCK_PENALTY
  SLASH_GRACE_PERIOD_L2_SLOTS
"

mkdir -p yarn-project/slasher/src/generated

echo "Generating slasher-defaults.ts from spartan/environments/common.env..."

{
  cat << 'HEADER'
// Auto-generated from spartan/environments/common.env
// Do not edit manually - run yarn generate to regenerate

/** Default slasher configuration values from common.env */
export const slasherDefaultEnv = {
HEADER

  extract_keys "$SLASHER_KEYS" spartan/environments/common.env | format_ts_properties

  echo "} as const;"
} > yarn-project/slasher/src/generated/slasher-defaults.ts

echo "Done!"
