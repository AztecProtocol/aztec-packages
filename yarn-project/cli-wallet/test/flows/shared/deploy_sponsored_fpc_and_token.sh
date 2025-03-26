TOKEN_ALIAS=token
FPC_ALIAS=sponsoredFPC

section "Deploying token contract (alias: $TOKEN_ALIAS) and creating a sponsored fpc (alias: $FPC_ALIAS)"

aztec-wallet import-test-accounts
aztec-wallet deploy sponsored_fpc_contract@SponsoredFPC -f test0 -a $FPC_ALIAS --no-init

CLAIM=$(aztec-wallet bridge-fee-juice contracts:$FPC_ALIAS --no-wait --json)

retrieve () {
  echo "$CLAIM" | grep "\"$1\"" | awk -F ': ' '{print $2}' | tr -d '",'
}

claimAmount=$(retrieve claimAmount)
claimSecret=$(retrieve claimSecret)
messageLeafIndex=$(retrieve messageLeafIndex)

# The following produces two blocks, allowing the claim to be used in the next block.
source $flows/shared/deploy_token.sh $TOKEN_ALIAS test1

# Claim the fee juice by calling the fee juice contract directly (address = 5).
feeJuice=0x0000000000000000000000000000000000000000000000000000000000000005
# Using a pre-funded test account because SponsoredFPC is not an account contract and can't be used to send a tx.
aztec-wallet send claim -ca $feeJuice -c fee_juice_contract@FeeJuice --args contracts:$FPC_ALIAS $claimAmount $claimSecret $messageLeafIndex -f test0
