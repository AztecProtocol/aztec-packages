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
  "l1-contracts:Nomismatokopio"
  "l1-contracts:Sysstia"
  "l1-contracts:Gerousia"
  "l1-contracts:Apella"
  "l1-contracts:NewGerousiaPayload"
  "l1-contracts:TxsDecoder"
)


# create target dir if it doesn't exist
mkdir -p "$target_dir";

echo -ne "// Auto generated module\n" > "$target_dir/index.ts";

for E in "${CONTRACTS[@]}"; do
    ARR=(${E//:/ })
    ROOT="${ARR[0]}";
    CONTRACT_NAME="${ARR[1]}";

    echo -ne "/**\n * $CONTRACT_NAME ABI.\n */\nexport const ${CONTRACT_NAME}Abi = " > "$target_dir/${CONTRACT_NAME}Abi.ts";
    jq -j '.abi' ../../$ROOT/out/$CONTRACT_NAME.sol/$CONTRACT_NAME.json >> "$target_dir/${CONTRACT_NAME}Abi.ts";
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
