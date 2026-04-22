#!/usr/bin/env bash
# Generates l1-contracts-defaults.ts from common.env.
#
# Source: spartan/environments/common.env (codegen:l1-contracts section)
# Output: yarn-project/ethereum/src/generated/l1-contracts-defaults.ts
set -euo pipefail

cd $(git rev-parse --show-toplevel)
source spartan/scripts/codegen_helper.sh

mkdir -p yarn-project/ethereum/src/generated

echo "Generating l1-contracts-defaults.ts from spartan/environments/common.env..."

{
  cat << 'HEADER'
// Auto-generated from spartan/environments/common.env
// Do not edit manually - run yarn generate to regenerate

/** Default L1 contracts configuration values from common.env */
export const l1ContractsDefaultEnv = {
HEADER

  extract_codegen_keys "l1-contracts" spartan/environments/common.env | format_ts_properties

  echo "} as const;"
} > yarn-project/ethereum/src/generated/l1-contracts-defaults.ts

echo "Done!"
