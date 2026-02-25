#!/usr/bin/env bash
set -euo pipefail

export LOG_LEVEL=silent

# Execute commands as per: https://docs.aztec.network/tutorials/codealong/contract_tutorials/counter_contract
aztec new counter_contract

# Verify workspace structure
if [ ! -f counter_contract/Nargo.toml ]; then
  echo "Failed to create workspace Nargo.toml."
  exit 1
fi
if [ ! -f counter_contract/contract/Nargo.toml ] || [ ! -f counter_contract/contract/src/main.nr ]; then
  echo "Failed to create contract crate."
  exit 1
fi
if [ ! -f counter_contract/test/Nargo.toml ] || [ ! -f counter_contract/test/src/lib.nr ]; then
  echo "Failed to create test crate."
  exit 1
fi

# Check counter_contract dir is owned by ubuntu.
if [ "$(stat -c %U counter_contract)" != "ubuntu" ]; then
  echo "counter_contract dir is not owned by ubuntu."
  exit 1
fi

# "Write" our contract over the scaffold.
cp -Rf ./aztec-packages/noir-projects/noir-contracts/contracts/test/counter_contract/* counter_contract/
cd counter_contract
sed -i 's|\.\./\.\./\.\./\.\./\.\./|/home/ubuntu/aztec-packages/noir-projects/|g' contract/Nargo.toml test/Nargo.toml

# Compile the contract.
aztec compile
# Codegen
aztec codegen -o contract/src/artifacts target
if [ ! -d contract/src/artifacts ]; then
  echo "Failed to codegen TypeScript."
  exit 1
fi

# Test
aztec test
