#!/usr/bin/env bash
set -euo pipefail

nargo --version
bb --version
aztec -V
aztec-wallet -V

export LOG_LEVEL=silent
export PXE_PROVER=none

# Start local network and wait for port to open.
aztec start --local-network &
local_network_pid=$!
trap 'echo "Sending kill to pid $local_network_pid"; kill $local_network_pid &>/dev/null; wait $local_network_pid' EXIT
while ! curl -fs localhost:8080/status &>/dev/null; do sleep 1; done

# Execute wallet commands as per: https://docs.aztec.network/guides/getting_started
aztec-wallet import-test-accounts

# Deploying a contract.
aztec-wallet deploy TokenContractArtifact \
  --from accounts:test0 \
  --args accounts:test0 TestToken TST 18 -a testtoken

# Minting public tokens.
aztec-wallet send mint_to_public \
  --from accounts:test0 \
  --contract-address contracts:testtoken \
  --args accounts:test0 100
aztec-wallet simulate balance_of_public \
  --from test0 \
  --contract-address testtoken \
  --args accounts:test0 | grep 100n

# Hybrid state and private functions.
aztec-wallet send transfer_to_private \
  --from accounts:test0 \
  --contract-address testtoken \
  --args accounts:test0 25
aztec-wallet simulate balance_of_public \
  --from test0 \
  --contract-address testtoken \
  --args accounts:test0
aztec-wallet simulate balance_of_private \
  --from test0 \
  --contract-address testtoken \
  --args accounts:test0 | grep 25n
