#!/usr/bin/env bash
# Generates slasher-defaults.ts from common.env.
#
# Source: spartan/environments/common.env (codegen:slasher section)
# Output: yarn-project/slasher/src/generated/slasher-defaults.ts
set -euo pipefail

cd $(git rev-parse --show-toplevel)
source spartan/scripts/codegen_helper.sh

mkdir -p yarn-project/slasher/src/generated

echo "Generating slasher-defaults.ts from spartan/environments/common.env..."

{
  cat << 'HEADER'
// Auto-generated from spartan/environments/common.env
// Do not edit manually - run yarn generate to regenerate

/** Default slasher configuration values from common.env */
export const slasherDefaultEnv = {
HEADER

  extract_codegen_keys "slasher" spartan/environments/common.env | format_ts_properties

  echo "} as const;"
} > yarn-project/slasher/src/generated/slasher-defaults.ts

echo "Done!"
