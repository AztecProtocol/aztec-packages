#!/usr/bin/env bash
set -euo pipefail;

target_dir=./generated


# CONTRACT elements have structure PROJECT_DIR_NAME:CONTRACT_NAME.
#   This will generate the following artifacts for the contracts within the target_dir{./generated} directory.
#   - a .{CONTRACT_NAME}Bytecode.ts containing the contract bytecode.
#   - a .{CONTRACT_NAME}Abi.ts containing the contract ABI.

CONTRACTS=(
  "l1-contracts:Registry"
  "l1-contracts:Inbox"
  "l1-contracts:Outbox"
  "l1-contracts:Rollup"
  "l1-contracts:TokenPortal"
  "l1-contracts:TestERC20"
  "l1-contracts:UniswapPortal"
  "l1-contracts:IERC20"
  "l1-contracts:FeeJuicePortal"
  "l1-contracts:MockVerifier"
  "l1-contracts:IVerifier"
  "l1-contracts:IProofCommitmentEscrow"
  "l1-contracts:ProofCommitmentEscrow"
  "l1-contracts:CoinIssuer"
  "l1-contracts:RewardDistributor"
  "l1-contracts:GovernanceProposer"
  "l1-contracts:Governance"
  "l1-contracts:NewGovernanceProposerPayload"
  "l1-contracts:LeonidasLib"
  "l1-contracts:ExtRollupLib"
  "l1-contracts:SlashingProposer"
  "l1-contracts:Slasher"
  "l1-contracts:EmpireBase"
  "l1-contracts:SlashFactory"
)

# Read the error ABI's once and store it in COMBINED_ERRORS variable
COMBINED_ERRORS=$(jq -s '
    .[0].abi + .[1].abi |
    unique_by({type: .type, name: .name})
' \
    ../../l1-contracts/out/Errors.sol/Errors.json \
    ../../l1-contracts/out/libraries/Errors.sol/Errors.json)

# create target dir if it doesn't exist
mkdir -p "$target_dir";

echo -ne "// Auto generated module\n" > "$target_dir/index.ts";

for E in "${CONTRACTS[@]}"; do
    ARR=(${E//:/ })
    ROOT="${ARR[0]}";
    CONTRACT_NAME="${ARR[1]}";

    echo -ne "/**\n * $CONTRACT_NAME ABI.\n */\nexport const ${CONTRACT_NAME}Abi = " > "$target_dir/${CONTRACT_NAME}Abi.ts";

    # Merge contract abi and errors abi while removing duplicates based on both type and name
    # Just merging it into all, it is not the cleanest, but it does the job.
    jq -j --argjson errors "$COMBINED_ERRORS" '
        .abi + $errors |
        unique_by({type: .type, name: .name})
    ' ../../$ROOT/out/$CONTRACT_NAME.sol/$CONTRACT_NAME.json >> "$target_dir/${CONTRACT_NAME}Abi.ts";

    echo " as const;" >> "$target_dir/${CONTRACT_NAME}Abi.ts";

    echo -ne "/**\n * $CONTRACT_NAME bytecode.\n */\nexport const ${CONTRACT_NAME}Bytecode = \"" > "$target_dir/${CONTRACT_NAME}Bytecode.ts";
    jq -j '.bytecode.object' ../../$ROOT/out/$CONTRACT_NAME.sol/$CONTRACT_NAME.json >> "$target_dir/${CONTRACT_NAME}Bytecode.ts";
    echo "\";" >> "$target_dir/${CONTRACT_NAME}Bytecode.ts";
    echo -ne "/**\n * $CONTRACT_NAME link references.\n */\nexport const ${CONTRACT_NAME}LinkReferences = " >> "$target_dir/${CONTRACT_NAME}Bytecode.ts";
    jq -j '.bytecode.linkReferences' ../../$ROOT/out/$CONTRACT_NAME.sol/$CONTRACT_NAME.json >> "$target_dir/${CONTRACT_NAME}Bytecode.ts";
    echo " as const;" >> "$target_dir/${CONTRACT_NAME}Bytecode.ts";

    echo -ne "export * from './${CONTRACT_NAME}Abi.js';\nexport * from './${CONTRACT_NAME}Bytecode.js';\n" >> "$target_dir/index.ts";
done;

echo "Successfully generated TS artifacts!";
