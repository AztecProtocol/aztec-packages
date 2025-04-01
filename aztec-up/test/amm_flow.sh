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

FPC_ALIAS=sponsoredFPC

# Execute wallet commands as per: https://docs.aztec.network/guides/getting_started
aztec-wallet import-test-accounts

# We deploy a SponsoredFPC instance, note that we could reuse the "canonical" instance already deployed, but it is easier to re-deploy it to access its address.
# Also, we are able to test the bridging and claim flow here.
aztec-wallet --prover none deploy SponsoredFPC -f test0 -a $FPC_ALIAS --no-init
CLAIM=$(aztec-wallet bridge-fee-juice 1000000000000000000 contracts:$FPC_ALIAS --mint --no-wait --json)

retrieve () {
  echo "$CLAIM" | grep "\"$1\"" | awk -F ': ' '{print $2}' | tr -d '",'
}

claimAmount=$(retrieve claimAmount)
claimSecret=$(retrieve claimSecret)
messageLeafIndex=$(retrieve messageLeafIndex)

# We need to send these transactions to advance the chain to claim our bridged funds
for i in $(seq 1 2); do
  aztec-wallet --prover none deploy Token \
    --from accounts:test0 \
    --args accounts:test0 TestToken TST 18
done

# Claim the fee juice by calling the fee juice contract directly (address = 5).
feeJuice=0x0000000000000000000000000000000000000000000000000000000000000005
# Using a pre-funded test account because SponsoredFPC is not an account contract and can't be used to send a tx.
aztec-wallet --prover native send claim -ca $feeJuice -c FeeJuice --args contracts:$FPC_ALIAS $claimAmount $claimSecret $messageLeafIndex -f test0

SPONSORED_FPC_PAYMENT_METHOD="--payment method=fpc-sponsored,fpc=contracts:sponsoredFPC"

aztec-wallet --prover native create-account -a main $SPONSORED_FPC_PAYMENT_METHOD

aztec-wallet --prover native create-account -a account2 $SPONSORED_FPC_PAYMENT_METHOD

# We only prove one of the three token deploys, because we do not want to duplicate proving effort for similar actions
# We use this philosophy to dictate what we prove here and below.
token_0_address=$(aztec-wallet --prover native deploy Token --args accounts:test0 Test TST 18 -f test0 --node-url http://104.198.9.16:8080 -a token_0 | grep "Contract deployed at" | awk '{print $4}')
token_1_address=$(aztec-wallet --prover none deploy Token --args accounts:test0 Test TST 18 -f test0 --node-url http://104.198.9.16:8080 -a token_1 | grep "Contract deployed at" | awk '{print $4}')
token_liquidity_address=$(aztec-wallet --prover none deploy Token --args accounts:test0 Test TST 18 -f test0 --node-url http://104.198.9.16:8080 -a token_liquidity | grep "Contract deployed at" | awk '{print $4}')
amm_address=$(aztec-wallet --prover native deploy AMM --args "$token_0_address" "$token_1_address" "$token_liquidity_address" -f test0 --node-url http://104.198.9.16:8080 -a amm | grep "Contract deployed at" | awk '{print $4}')

### mint_to_private

# We mint both tokens to our user
aztec-wallet --prover native send mint_to_private -ca "$token_0_address" --args test0 "$current_user_address" "$AMOUNT" -f test0 --node-url http://104.198.9.16:8080 $SPONSORED_FPC_PAYMENT_METHOD
aztec-wallet --prover none send mint_to_private -ca "$token_1_address" --args test0 "$current_user_address" "$AMOUNT" -f test0 --node-url http://104.198.9.16:8080 $SPONSORED_FPC_PAYMENT_METHOD

### add_liquidity

# We craft our authwits for sending add_liquidity
aztec-wallet create-secret -a add-liquidity-nonce
aztec-wallet create-authwit transfer_to_public "$amm_address" -ca "$token_0_address" --args "$current_user_address" "$amm_address" "$amount_0_max" secrets:add-liquidity-nonce -f "$current_user_address" -a amm-lp-token-0
aztec-wallet create-authwit transfer_to_public "$amm_address" -ca "$token_1_address" --args "$current_user_address" "$amm_address" "$amount_1_max" secrets:add-liquidity-nonce -f "$current_user_address" -a amm-lp-token-1

amount_0_max=$((private_balance_token_0/4))
amount_1_max=$((private_balance_token_1/4))
amount_0_min=1
amount_1_min=1

aztec-wallet --prover native send add_liquidity -ca "$amm_address" --args "$amount_0_max" "$amount_1_max" "$amount_0_min" "$amount_1_min" secrets:add-liquidity-nonce -aw amm-lp-token-0 -aw amm-lp-token-1 -f "$liquidity_provider" $SPONSORED_FPC_PAYMENT_METHOD

### swap

amount_in=$((private_balance_token_0/88))

aztec-wallet create-secret -a swap-nonce
aztec-wallet create-authwit transfer_to_public "$amm_address" -ca "$token_0_address" --args "$current_user_address" "$amm_address" "$amount_in" secrets:swap-nonce -f "$current_user_address" -a amm-swapper-token-0

amount_out_min=$(aztec-wallet simulate get_amount_out_for_exact_in -ca "$amm_address" --args "$balance_of_public_token_0_amm" "$balance_of_public_token_1_amm" "$amount_in" -f "$swapper")
echo "Amount out min for swap: $amount_out_min"

aztec-wallet --prover native send swap_exact_tokens_for_tokens --ca "$amm_address" --args "$token_0_address" "$token_1_address" "$amount_in" 0 secrets:swap-nonce -aw amm-swapper-token-0 -f "$current_user_address" $SPONSORED_FPC_PAYMENT_METHOD

### remove_liquidity

liquidity_token_balance=$(aztec-wallet simulate balance_of_private -ca "$token_liquidity_address" --args "$other_liquidity_provider" -f "$other_liquidity_provider" --node-url http://104.198.9.16:8080 | grep "Simulation result:" | awk '{print $3}')
echo "Liquidity token balance: $liquidity_token_balance"

aztec-wallet create-secret -a burn-nonce
aztec-wallet create-authwit transfer_to_public "$amm_address" -ca "$token_liquidity_address" --args "$current_user_address" "$amm_address" "$liquidity_token_balance" secrets:burn-nonce -f "$current_user_address" -a amm-burn-token-liquidity

amount_0_min=1
amount_1_min=1

aztec-wallet --prover native send remove_liquidity --ca "$amm_address" --args $((liquidity_token_balance/8)) "$amount_0_min" "$amount_1_min" secrets:burn-nonce -aw amm-burn-token-liquidity -f "$current_user_address" $SPONSORED_FPC_PAYMENT_METHOD
