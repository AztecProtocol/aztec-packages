#!/usr/bin/env bash
set -euo pipefail

# Tests that `aztec init` scaffolds a Counter contract that compiles and passes tests,
# and that `aztec new` can add a blank contract to the same workspace.

export LOG_LEVEL=silent

mkdir my_workspace && cd my_workspace
aztec init

# Verify workspace structure with named crate directories.
if [ ! -f Nargo.toml ]; then
  echo "Failed to create workspace Nargo.toml."
  exit 1
fi
if [ ! -f my_workspace_contract/Nargo.toml ] || [ ! -f my_workspace_contract/src/main.nr ]; then
  echo "Failed to create contract crate."
  exit 1
fi
if [ ! -f my_workspace_test/Nargo.toml ] || [ ! -f my_workspace_test/src/lib.nr ]; then
  echo "Failed to create test crate."
  exit 1
fi

# Verify the Counter template was used.
if ! grep -q 'pub contract Counter' my_workspace_contract/src/main.nr; then
  echo "Expected Counter contract from aztec init."
  exit 1
fi

# This is unfortunate as it makes the test worse but in CI setting the aztec version is 0.0.1 which doesn't exist as
# a remote git tag, so we need to rewrite dependencies to use local aztec-nr.
sed -i \
  -e 's|aztec = .*git.*AztecProtocol/aztec-nr.*|aztec = { path="/home/ubuntu/aztec-packages/noir-projects/labs/aztec-nr/aztec" }|' \
  -e 's|balance_set = .*git.*AztecProtocol/aztec-nr.*|balance_set = { path="/home/ubuntu/aztec-packages/noir-projects/labs/aztec-nr/balance-set" }|' \
  my_workspace_contract/Nargo.toml my_workspace_test/Nargo.toml

# Compile the Counter contract.
aztec compile

# Run the Counter tests.
aztec test

# --- Test adding a blank contract to the workspace with `aztec new` ---
aztec new token

# Verify token crates were created.
if [ ! -f token_contract/Nargo.toml ] || [ ! -f token_contract/src/main.nr ]; then
  echo "Failed to create token contract crate."
  exit 1
fi
if [ ! -f token_test/Nargo.toml ] || [ ! -f token_test/src/lib.nr ]; then
  echo "Failed to create token test crate."
  exit 1
fi

# Verify workspace Nargo.toml contains all four members.
if ! grep -q '"my_workspace_contract"' Nargo.toml || \
   ! grep -q '"my_workspace_test"' Nargo.toml || \
   ! grep -q '"token_contract"' Nargo.toml || \
   ! grep -q '"token_test"' Nargo.toml; then
  echo "Workspace Nargo.toml does not contain all expected members."
  exit 1
fi

# Verify the blank template was used for the new contract.
if ! grep -q 'pub contract Main' token_contract/src/main.nr; then
  echo "Expected blank contract from aztec new."
  exit 1
fi

# Rewrite aztec deps for token crates too.
sed -i \
  's|aztec = .*git.*AztecProtocol/aztec-nr.*|aztec = { path="/home/ubuntu/aztec-packages/noir-projects/labs/aztec-nr/aztec" }|' \
  token_contract/Nargo.toml token_test/Nargo.toml

# Compile and test the full workspace (both contracts).
aztec compile
aztec test
