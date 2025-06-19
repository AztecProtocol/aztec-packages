#!/usr/bin/env bash
set -euo pipefail

# Working directory independent.
cd $(git rev-parse --show-toplevel)/yarn-project/l1-artifacts

# Contracts name list (all assumed to be in l1-contracts).
# This script writes into the src/ folder:
# - index.ts: entrypoint
# - {name}Abi.ts: contains the ABI
# - {name}Bytecode.ts: contains the bytecode and link references

contracts=(
  "CoinIssuer"
  "EmpireBase"
  "ExtRollupLib"
  "ExtRollupLib2"
  "FeeJuicePortal"
  "Governance"
  "GovernanceProposer"
  "FeeAssetHandler"
  "HonkVerifier"
  "IERC20"
  "Inbox"
  "IVerifier"
  "MockVerifier"
  "NewGovernanceProposerPayload"
  "Outbox"
  "RegisterNewRollupVersionPayload"
  "Registry"
  "RewardDistributor"
  "Rollup"
  "Slasher"
  "SlashFactory"
  "SlashingProposer"
  "StakingAssetHandler"
  "TestERC20"
  "TokenPortal"
  "UniswapPortal"
  "ValidatorSelectionLib"
  "MultiAdder"
  "GSE"
  "MockZKPassportVerifier"
)

# Combine error ABIs once, removing duplicates by {type, name}.
combined_errors_abi=$(
  jq -s '
    .[0].abi + .[1].abi
    | unique_by({type: .type, name: .name})
  ' \
    ../../l1-contracts/out/Errors.sol/Errors.json \
    ../../l1-contracts/out/libraries/Errors.sol/Errors.json
)

# Start from clean.
rm -rf src && mkdir src

echo "// Auto-generated module" >"src/index.ts"

# Generate ErrorsAbi.ts
(
  echo "/**"
  echo " * Combined Errors ABI."
  echo " */"
  echo -n "export const ErrorsAbi = "
  echo -n "$combined_errors_abi"
  echo " as const;"
) >"src/ErrorsAbi.ts"

# Add Errors export to index.ts
echo "export * from './ErrorsAbi.js';" >>"src/index.ts"

# Collect all compressed abis
abis=""

for contract_name in "${contracts[@]}"; do
  # Append compressed abi to abis collection
  abis="$abis:$(jq -c '.abi' "../../l1-contracts/out/${contract_name}.sol/${contract_name}.json")"

  # Generate <ContractName>Abi.ts
  (
    echo "/**"
    echo " * ${contract_name} ABI."
    echo " */"
    echo -n "export const ${contract_name}Abi = "
    # Merge contract abi and errors abi while removing duplicates based on both type and name
    # Just merging it into all, it is not the cleanest, but it does the job.
    jq -j --argjson errs "$combined_errors_abi" '
      .abi + $errs
      | unique_by({type: .type, name: .name})
    ' \
      "../../l1-contracts/out/${contract_name}.sol/${contract_name}.json"
    echo " as const;"
  ) >"src/${contract_name}Abi.ts"

  # Generate <ContractName>Bytecode.ts
  (
    echo "/**"
    echo " * ${contract_name} bytecode."
    echo " */"
    echo -n "export const ${contract_name}Bytecode = \""
    jq -j '.bytecode.object' \
      "../../l1-contracts/out/${contract_name}.sol/${contract_name}.json"
    echo "\";"

    echo "/**"
    echo " * ${contract_name} link references."
    echo " */"
    echo -n "export const ${contract_name}LinkReferences = "
    jq -j '.bytecode.linkReferences' \
      "../../l1-contracts/out/${contract_name}.sol/${contract_name}.json"
    echo " as const;"
  ) >"src/${contract_name}Bytecode.ts"

  # Update index.ts exports
  echo "export * from './${contract_name}Abi.js';" >>"src/index.ts"
  echo "export * from './${contract_name}Bytecode.js';" >>"src/index.ts"
done

# Generate RollupStorage.ts
(
  echo "/**"
  echo " * Rollup storage."
  echo " */"
  echo -n "export const RollupStorage = "
  jq -j '.storage' "../../l1-contracts/out/Rollup.sol/storage.json"
  echo " as const;"
) >"src/RollupStorage.ts"

# Update index.ts exports
echo "export * from './RollupStorage.js';" >>"src/index.ts"

# Write abis hash. Consider excluding some contracts from this hash if
# we don't want to consider them as breaking for the interfaces.
echo "export const AbisChecksum = \"$(echo -n "$abis" | sha256sum | cut -d' ' -f1)\";" >"src/checksum.ts"
echo "export * from './checksum.js';" >>"src/index.ts"

echo "Successfully generated TS artifacts"
