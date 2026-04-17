#!/usr/bin/env bash
# Generates l1-contracts-defaults.ts from common.env.
#
# Source: spartan/environments/common.env (protocol parameters)
# Output: yarn-project/ethereum/src/generated/l1-contracts-defaults.ts
set -euo pipefail

cd $(git rev-parse --show-toplevel)
source spartan/scripts/codegen_helper.sh

L1_CONTRACT_KEYS="
  ETHEREUM_SLOT_DURATION
  AZTEC_SLOT_DURATION
  AZTEC_EPOCH_DURATION
  AZTEC_TARGET_COMMITTEE_SIZE
  AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET
  AZTEC_LAG_IN_EPOCHS_FOR_RANDAO
  AZTEC_ACTIVATION_THRESHOLD
  AZTEC_EJECTION_THRESHOLD
  AZTEC_LOCAL_EJECTION_THRESHOLD
  AZTEC_EXIT_DELAY_SECONDS
  AZTEC_INBOX_LAG
  AZTEC_PROOF_SUBMISSION_EPOCHS
  AZTEC_MANA_TARGET
  AZTEC_PROVING_COST_PER_MANA
  AZTEC_INITIAL_ETH_PER_FEE_ASSET
  AZTEC_SLASHER_ENABLED
  AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS
  AZTEC_SLASHING_LIFETIME_IN_ROUNDS
  AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS
  AZTEC_SLASHING_OFFSET_IN_ROUNDS
  AZTEC_SLASHING_VETOER
  AZTEC_SLASHING_DISABLE_DURATION
  AZTEC_SLASH_AMOUNT_SMALL
  AZTEC_SLASH_AMOUNT_MEDIUM
  AZTEC_SLASH_AMOUNT_LARGE
  AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE
"

mkdir -p yarn-project/ethereum/src/generated

echo "Generating l1-contracts-defaults.ts from spartan/environments/common.env..."

{
  cat << 'HEADER'
// Auto-generated from spartan/environments/common.env
// Do not edit manually - run yarn generate to regenerate

/** Default L1 contracts configuration values from common.env */
export const l1ContractsDefaultEnv = {
HEADER

  extract_keys "$L1_CONTRACT_KEYS" spartan/environments/common.env | format_ts_properties

  echo "} as const;"
} > yarn-project/ethereum/src/generated/l1-contracts-defaults.ts

echo "Done!"
