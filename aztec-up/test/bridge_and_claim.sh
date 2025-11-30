#!/usr/bin/env bash
set -euo pipefail

# Start local network and wait for port to open.
aztec start --local-network &
local_network=$!
trap 'set +e; kill $local_network_pid &>/dev/null; wait $local_network_pid' EXIT
while ! curl -fs localhost:8080/status &>/dev/null; do sleep 1; done

# Execute wallet commands as per: https://docs.aztec.network/guides/getting_started
aztec-wallet import-test-accounts

aztec-wallet \
  create-account \
  -a main \
  --register-only

aztec-wallet \
  bridge-fee-juice 1000000000000000000000 accounts:main \
  --mint \
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
  accounts:main \
  --payment method=fee_juice,claim \

# We sanity check the account deployment worked and the fee juice was claimed by deploying a token
# with the new account.
aztec-wallet \
  --prover native \
  deploy Token \
  --args accounts:main TestToken TST 18 \
  -f accounts:main
