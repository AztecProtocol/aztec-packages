#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"

echo
echo "nargo version: $(aztec-nargo --version | head -1 | cut -d' ' -f4)"
echo "bb version: $(aztec-bb --version)"
echo "aztec version: $(aztec --version)"
echo "aztec-wallet version: $(aztec-wallet --version)"
echo

export LOG_LEVEL=silent
export PXE_PROVER=none

# Start local network and wait for port to open.
aztec start --local-network &
local_network_pid=$!
trap 'set +e; kill $local_network_pid &>/dev/null; wait $local_network_pid' EXIT
wait_for_local_network $local_network_pid

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
