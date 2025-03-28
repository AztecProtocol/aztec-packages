#!/usr/bin/env bash
set -eu

# Check we're in the test container.
if [ ! -f /aztec_release_test_container ]; then
  echo "Not running inside the aztec release test container. Exiting."
  exit 1
fi

if [ "$(whoami)" != "ubuntu" ]; then
  echo "Not running as ubuntu. Exiting."
  exit 1
fi

export SKIP_PULL=1
export NO_NEW_SHELL=1
export INSTALL_URI=file:///home/ubuntu/aztec-packages/aztec-up/bin

if [ -t 0 ]; then
  bash_args="-i"
else
  export NON_INTERACTIVE=1
fi

bash ${bash_args:-} <(curl -s $INSTALL_URI/aztec-install)

# We can't create a new shell for this test, so just re-source our modified .bashrc to get updated PATH.
PS1=" " source ~/.bash_profile

# Sanity check lsp.
echo "Checking LSP..."
echo -ne 'Content-Length: 100\r\n\r\n{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"rootUri": null, "capabilities": {}}}' \
  | aztec-nargo lsp \
  | grep -q '"jsonrpc":"2.0"'
echo "LSP check passed."

# aztec-nargo -V
# aztec -V
# aztec-wallet -V

# aztec-up

# aztec-nargo -V
# aztec -V
# aztec-wallet -V

export LOG_LEVEL=silent
export PXE_PROVER=none

# Start sandbox and wait for port to open.
aztec start --sandbox &
sandbox_pid=$!
trap 'echo "Sending kill to pid $sandbox_pid"; kill $sandbox_pid &>/dev/null; wait $sandbox_pid' EXIT
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
