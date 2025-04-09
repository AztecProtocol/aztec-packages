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

export LOG_LEVEL=debug

# Start sandbox and wait for port to open.
aztec start --sandbox &
sandbox_pid=$!
trap 'echo "Sending kill to pid $sandbox_pid"; kill $sandbox_pid &>/dev/null; wait $sandbox_pid' EXIT
while ! curl -fs localhost:8080/status &>/dev/null; do sleep 1; done

function get_contract_address() {
  grep "Contract deployed at" | awk '{print $4}'
}

canonical_sponsored_fpc_address=$(aztec \
  get-canonical-sponsored-fpc-address \
  | awk '{print $NF}')

SPONSORED_FPC_PAYMENT_METHOD="--payment method=fpc-sponsored,fpc=${canonical_sponsored_fpc_address}"

aztec-wallet import-test-accounts

# Execute wallet commands as per: https://docs.aztec.network/guides/getting_started

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
  --prover native \
  deploy-account \
  -f accounts:main \
  $SPONSORED_FPC_PAYMENT_METHOD

# We only prove one of the three token deploys, because we do not want to duplicate proving effort for similar actions
# We use this philosophy to dictate what we prove here and below.

echo "Deploying AMM setup"
token_0_address=$(aztec-wallet \
  --prover native \
  deploy Token \
  --args accounts:main Test TST 18 \
  -f accounts:main \
  -a token_0 \
  $SPONSORED_FPC_PAYMENT_METHOD \
  | get_contract_address)

token_1_address=$(aztec-wallet \
  --prover none \
  deploy Token \
  --args accounts:main Test TST 18 \
  -f accounts:main \
  -a token_1 \
  $SPONSORED_FPC_PAYMENT_METHOD \
  | get_contract_address)

token_liquidity_address=$(aztec-wallet \
  --prover none \
  deploy Token \
  --args accounts:main Test TST 18 \
  -f accounts:main \
  -a token_liquidity \
  $SPONSORED_FPC_PAYMENT_METHOD \
  | get_contract_address)

amm_address=$(aztec-wallet \
  --prover native \
  deploy AMM \
  --args $token_0_address $token_1_address $token_liquidity_address \
  -f accounts:main \
  -a amm \
  $SPONSORED_FPC_PAYMENT_METHOD \
  | get_contract_address)

### mint_to_private

AMOUNT=420000000000

# We mint both tokens to our user
echo "Minting token_0 and token_1 to private"

aztec-wallet \
  --prover native \
  send mint_to_private \
  -ca $token_0_address \
  --args accounts:main accounts:main $AMOUNT \
  $SPONSORED_FPC_PAYMENT_METHOD \
  -f accounts:main

aztec-wallet \
  --prover none \
  send mint_to_private \
  -ca $token_1_address \
  --args accounts:main accounts:main $AMOUNT \
  $SPONSORED_FPC_PAYMENT_METHOD \
  -f accounts:main

### add_liquidity

amount_0_max=$((AMOUNT/4))
amount_1_max=$((AMOUNT/4))
amount_0_min=1
amount_1_min=1

# We craft our authwits for sending add_liquidity
aztec-wallet \
  create-secret \
  -a add-liquidity-nonce

aztec-wallet \
  create-authwit transfer_to_public $amm_address \
  -ca $token_0_address \
  --args accounts:main $amm_address $amount_0_max secrets:add-liquidity-nonce \
  -f accounts:main \
  -a amm-lp-token-0

aztec-wallet \
  create-authwit transfer_to_public $amm_address \
  -ca $token_1_address \
  --args accounts:main $amm_address $amount_1_max secrets:add-liquidity-nonce \
  -f accounts:main \
  -a amm-lp-token-1

echo "Adding liquidity"

aztec-wallet \
  --prover native \
  send add_liquidity \
  -ca $amm_address \
  --args $amount_0_max $amount_1_max $amount_0_min $amount_1_min secrets:add-liquidity-nonce \
  -aw amm-lp-token-0 \
  -aw amm-lp-token-1 \
  -f accounts:main \
  $SPONSORED_FPC_PAYMENT_METHOD

### swap

amount_in=$((AMOUNT/88))

aztec-wallet \
  create-secret \
  -a swap-nonce

aztec-wallet \
  create-authwit transfer_to_public $amm_address \
  -ca $token_0_address \
  --args accounts:main $amm_address $amount_in secrets:swap-nonce \
  -f accounts:main \
  -a amm-swapper-token-0

echo "Swapping"

aztec-wallet \
  --prover native \
  send swap_exact_tokens_for_tokens \
  --ca $amm_address \
  --args $token_0_address $token_1_address $amount_in 0 secrets:swap-nonce \
  -aw amm-swapper-token-0 \
  -f accounts:main \
  $SPONSORED_FPC_PAYMENT_METHOD

### remove_liquidity

liquidity_token_balance=$(aztec-wallet \
  simulate balance_of_private \
  -ca $token_liquidity_address \
  --args accounts:main \
  -f accounts:main \
  | grep "Simulation result:" \
  | awk '{print $3}' \
  | sed 's/n$//')

echo "Liquidity token balance: $liquidity_token_balance"

aztec-wallet \
  create-secret \
  -a burn-nonce

aztec-wallet \
  create-authwit transfer_to_public $amm_address \
  -ca $token_liquidity_address \
  --args $current_user_address $amm_address $liquidity_token_balance secrets:burn-nonce \
  -f $current_user_address \
  -a amm-burn-token-liquidity

amount_0_min=1
amount_1_min=1

echo "Removing liquidity"

aztec-wallet \
  --prover native \
  send remove_liquidity \
  --ca "amm_address \
  --args $((liquidity_token_balance/8)) $amount_0_min $amount_1_min secrets:burn-nonce \
  -aw amm-burn-token-liquidity \
  -f accounts:main \
  $SPONSORED_FPC_PAYMENT_METHOD
