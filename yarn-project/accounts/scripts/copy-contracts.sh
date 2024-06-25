#! /bin/bash
set -euo pipefail
mkdir -p ./src/artifacts

contracts=(schnorr_account_contract-SchnorrAccount ecdsa_account_contract-EcdsaAccount schnorr_single_key_account_contract-SchnorrSingleKeyAccount)

decl=$(cat <<EOF
import { type NoirCompiledContract } from '@aztec/types/noir';
const circuit: NoirCompiledContract;
export = circuit;
EOF
);

for contract in "${contracts[@]}"; do
  cp "../../noir-projects/noir-contracts/target/$contract.json" ./src/artifacts/${contract#*-}.json
  echo "$decl" > ./src/artifacts/${contract#*-}.d.json.ts
done