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

# Start sandbox and wait for port to open.
aztec start --sandbox &
sandbox_pid=$!
trap 'echo "Sending kill to pid $sandbox_pid"; kill $sandbox_pid &>/dev/null; wait $sandbox_pid' EXIT
while ! curl -fs localhost:8080/status &>/dev/null; do sleep 1; done

# Execute wallet commands as per: https://docs.aztec.network/guides/getting_started
aztec-wallet import-test-accounts

aztec-wallet \
  create-account \
  -a main \
  --register-only

aztec-wallet \
  bridge-fee-juice accounts:main \
  --no-wait

# We need to send these transactions to advance the chain to claim our bridged funds.
for i in $(seq 1 3); do
  aztec-wallet \
    --prover none \
    deploy Token \
    --args accounts:test0 TestToken TST 18 \
    -f accounts:test0
done

# We deploy this account and pay for it with the bridged fee juice.
aztec-wallet \
  --prover native \
  deploy-account \
  --payment method=fee_juice,claim \
  -f accounts:main

# We sanity check the account deployment worked and the fee juice was claimed by deploying a token
# with the new account.
aztec-wallet \
  --prover native \
  deploy Token \
  --args accounts:main TestToken TST 18 \
  -f accounts:main
