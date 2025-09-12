#! /bin/bash
set -euo pipefail
mkdir -p ./artifacts

contracts=(schnorr_account_contract-SchnorrAccount ecdsa_k_account_contract-EcdsaKAccount ecdsa_r_account_contract-EcdsaRAccount schnorr_single_key_account_contract-SchnorrSingleKeyAccount simulated_account_contract-SimulatedAccount )

decl=$(cat <<EOF
import { type NoirCompiledContract } from '@aztec/stdlib/noir';
const circuit: NoirCompiledContract;
export = circuit;
EOF
);

for contract in "${contracts[@]}"; do
  cp "../../noir-projects/noir-contracts/target/$contract.json" ./artifacts/${contract#*-}.json
  echo "$decl" > ./artifacts/${contract#*-}.d.json.ts
done
