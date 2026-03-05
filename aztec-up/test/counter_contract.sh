#!/usr/bin/env bash
set -euo pipefail

export LOG_LEVEL=silent

# Execute commands as per: https://docs.aztec.network/tutorials/codealong/contract_tutorials/counter_contract
aztec new counter

# Verify workspace structure
if [ ! -f counter/Nargo.toml ]; then
  echo "Failed to create workspace Nargo.toml."
  exit 1
fi
if [ ! -f counter/counter_contract/Nargo.toml ] || [ ! -f counter/counter_contract/src/main.nr ]; then
  echo "Failed to create contract crate."
  exit 1
fi
if [ ! -f counter/counter_test/Nargo.toml ] || [ ! -f counter/counter_test/src/lib.nr ]; then
  echo "Failed to create test crate."
  exit 1
fi

# Check counter dir is owned by ubuntu.
if [ "$(stat -c %U counter)" != "ubuntu" ]; then
  echo "counter dir is not owned by ubuntu."
  exit 1
fi

# "Write" our contract over the scaffold.
cp -Rf ./aztec-packages/noir-projects/noir-contracts/contracts/test/counter/* counter/
cd counter
sed -i 's|\.\./\.\./\.\./\.\./\.\./|/home/ubuntu/aztec-packages/noir-projects/|g' counter_contract/Nargo.toml counter_test/Nargo.toml

# Compile the contract.
aztec compile
# Codegen
aztec codegen -o counter_contract/src/artifacts target
if [ ! -d counter_contract/src/artifacts ]; then
  echo "Failed to codegen TypeScript."
  exit 1
fi

# Test
aztec test
