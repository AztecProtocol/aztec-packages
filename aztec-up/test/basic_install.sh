#!/bin/bash
set -euo pipefail

# Check we're in the test container.
if [ ! -f /aztec_release_test_container ]; then
  echo "Not running inside the aztec release test container. Exiting."
  exit 1
fi

export SKIP_PULL=1
export NO_NEW_SHELL=1
export INSTALL_URI=file:///root/aztec-packages/aztec-up/bin

if [ -t 0 ]; then
  bash_args="-i"
else
  export NON_INTERACTIVE=1
fi

bash ${bash_args:-} <(curl -s $INSTALL_URI/aztec-install)

# We can't create a new shell for this test, so just re-source our modified .bashrc to get updated PATH.
set +eu
PS1=" " source ~/.bashrc
set -eu

# aztec-nargo -V
# aztec -V
# aztec-wallet -V

# aztec-up

# aztec-nargo -V
# aztec -V
# aztec-wallet -V

export LOG_LEVEL=silent

# Start sandbox and wait for port to open.
aztec start --sandbox &
sandbox_pid=$!
trap 'echo "Sending kill to pid $sandbox_pid"; kill $sandbox_pid &>/dev/null; wait $sandbox_pid' EXIT
while ! curl -fs localhost:8080/status &>/dev/null; do sleep 1; done

# Execute wallet commands as per: https://docs.aztec.network/guides/getting_started
aztec-wallet create-account -a my-wallet

# Deploying a contract.
aztec-wallet deploy TokenContractArtifact \
  --from accounts:my-wallet \
  --args accounts:my-wallet TestToken TST 18 -a testtoken

# Minting public tokens.
aztec-wallet send mint_to_public \
  --from accounts:my-wallet \
  --contract-address contracts:testtoken \
  --args accounts:my-wallet 100
aztec-wallet simulate balance_of_public \
  --from my-wallet \
  --contract-address testtoken \
  --args accounts:my-wallet | grep 100n

# Hybrid state and private functions.
aztec-wallet send transfer_to_private \
  --from accounts:my-wallet \
  --contract-address testtoken \
  --args accounts:my-wallet 25
aztec-wallet simulate balance_of_public \
  --from my-wallet \
  --contract-address testtoken \
  --args accounts:my-wallet
aztec-wallet simulate balance_of_private \
  --from my-wallet \
  --contract-address testtoken \
  --args accounts:my-wallet | grep 25n
