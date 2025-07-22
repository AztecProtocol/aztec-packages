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

canonical_sponsored_fpc_address=$(aztec \
  get-canonical-sponsored-fpc-address \
  | awk '{print $NF}')

SPONSORED_FPC_PAYMENT_METHOD="--payment method=fpc-sponsored,fpc=${canonical_sponsored_fpc_address}"

# Execute wallet commands as per: https://docs.aztec.network/guides/getting_started
# Note that we are only proving the AMM specific transactions due to the test being lengthy if any other
# transactions are proven.

echo "Creating account"

aztec-wallet \
  create-account \
  -a main \
  --register-only

aztec-wallet \
  register-contract $canonical_sponsored_fpc_address SponsoredFPC \
  -f accounts:main \
  --salt 0

aztec-wallet \
  --prover none \
  deploy-account \
  -f accounts:main \
  $SPONSORED_FPC_PAYMENT_METHOD

echo "Deploying AMM setup"
aztec-wallet \
  --prover none \
  deploy Token \
  --args accounts:main Token0 TKN0 18 \
  -f accounts:main \
  -a token_0 \
  $SPONSORED_FPC_PAYMENT_METHOD

aztec-wallet \
  --prover none \
  deploy Token \
  --args accounts:main Token1 TKN1 18 \
  -f accounts:main \
  -a token_1 \
  $SPONSORED_FPC_PAYMENT_METHOD

aztec-wallet \
  --prover none \
  deploy Token \
  --args accounts:main lToken lTKN 18 \
  -f accounts:main \
  -a token_liquidity \
  $SPONSORED_FPC_PAYMENT_METHOD

aztec-wallet \
  --prover none \
  deploy AMM \
  --args contracts:token_0 contracts:token_1 contracts:token_liquidity \
  -f accounts:main \
  -a amm \
  $SPONSORED_FPC_PAYMENT_METHOD

aztec-wallet \
  --prover none \
  send set_minter \
  -ca contracts:token_liquidity \
  --args contracts:amm true \
  $SPONSORED_FPC_PAYMENT_METHOD \
  -f accounts:main

### mint_to_private

AMOUNT=420000000000

echo "Minting token_0 and token_1 to private"

aztec-wallet \
  --prover none \
  send mint_to_private \
  -ca contracts:token_0 \
  --args accounts:main $AMOUNT \
  $SPONSORED_FPC_PAYMENT_METHOD \
  -f accounts:main

aztec-wallet \
  --prover none \
  send mint_to_private \
  -ca contracts:token_1 \
  --args accounts:main $AMOUNT \
  $SPONSORED_FPC_PAYMENT_METHOD \
  -f accounts:main

### add_liquidity

amount_0_max=$((AMOUNT/4))
amount_1_max=$((AMOUNT/4))
amount_0_min=1
amount_1_min=1

aztec-wallet \
  create-secret \
  -a add-liquidity-nonce

aztec-wallet \
  create-authwit transfer_to_public_and_prepare_private_balance_increase contracts:amm \
  -ca contracts:token_0 \
  --args accounts:main contracts:amm $amount_0_max secrets:add-liquidity-nonce \
  -f accounts:main \
  -a add_liquidity_token_0

aztec-wallet \
  create-authwit transfer_to_public_and_prepare_private_balance_increase contracts:amm \
  -ca contracts:token_1 \
  --args accounts:main contracts:amm $amount_1_max secrets:add-liquidity-nonce \
  -f accounts:main \
  -a add_liquidity_token_1

echo "Adding liquidity"

aztec-wallet \
  --prover native \
  send add_liquidity \
  -ca contracts:amm \
  --args $amount_0_max $amount_1_max $amount_0_min $amount_1_min secrets:add-liquidity-nonce \
  -aw authwits:add_liquidity_token_0,authwits:add_liquidity_token_1 \
  -f accounts:main \
  $SPONSORED_FPC_PAYMENT_METHOD

### swap

amount_in=$((AMOUNT/88))

aztec-wallet \
  create-secret \
  -a swap-nonce

aztec-wallet \
  create-authwit transfer_to_public contracts:amm \
  -ca contracts:token_0 \
  --args accounts:main contracts:amm $amount_in secrets:swap-nonce \
  -f accounts:main \
  -a swap_token_0

echo "Swapping"

aztec-wallet \
  --prover native \
  send swap_exact_tokens_for_tokens \
  -ca contracts:amm \
  --args contracts:token_0 contracts:token_1 $amount_in 0 secrets:swap-nonce \
  -aw authwits:swap_token_0 \
  -f accounts:main \
  $SPONSORED_FPC_PAYMENT_METHOD

### remove_liquidity

liquidity_token_balance=$(aztec-wallet \
  simulate balance_of_private \
  -ca contracts:token_liquidity \
  --args accounts:main \
  -f accounts:main \
  | grep "Simulation result:" \
  | awk '{print $3}' \
  | sed 's/n$//')

echo "Liquidity token balance: $liquidity_token_balance"

aztec-wallet \
  create-secret \
  -a burn-nonce

liquidity_to_remove=$((liquidity_token_balance/8))

aztec-wallet \
  create-authwit transfer_to_public contracts:amm \
  -ca contracts:token_liquidity \
  --args accounts:main contracts:amm $liquidity_to_remove secrets:burn-nonce \
  -f accounts:main \
  -a remove_liquidity

amount_0_min=1
amount_1_min=1

echo "Removing liquidity"

aztec-wallet \
  --prover native \
  send remove_liquidity \
  -ca contracts:amm \
  --args $liquidity_to_remove $amount_0_min $amount_1_min secrets:burn-nonce \
  -aw authwits:remove_liquidity \
  -f accounts:main \
  $SPONSORED_FPC_PAYMENT_METHOD
