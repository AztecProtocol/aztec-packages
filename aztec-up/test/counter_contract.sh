#!/usr/bin/env bash
set -euo pipefail

export LOG_LEVEL=silent

# Execute commands as per: https://docs.aztec.network/tutorials/codealong/contract_tutorials/counter_contract
aztec new --contract counter_contract
if [ ! -f counter_contract/Nargo.toml ] || [ ! -f counter_contract/src/main.nr ]; then
  echo "Failed to create contract."
  exit 1
fi

# Check counter_contract dir is owned by aztec-dev.
if [ "$(stat -c %U counter_contract)" != "ubuntu" ]; then
  echo "counter_contract dir is not owned by ubuntu."
  exit 1
fi

# "Write" our contract.
cp -Rf ./aztec-packages/noir-projects/noir-contracts/contracts/test/counter_contract .
cd counter_contract
sed -i 's|\.\./\.\./\.\./\.\./|/home/ubuntu/aztec-packages/noir-projects/|g' Nargo.toml

# Compile the contract.
aztec compile
# Codegen
aztec codegen -o src/artifacts target
if [ ! -d src/artifacts ]; then
  echo "Failed to codegen TypeScript."
  exit 1
fi

# Test
aztec test
