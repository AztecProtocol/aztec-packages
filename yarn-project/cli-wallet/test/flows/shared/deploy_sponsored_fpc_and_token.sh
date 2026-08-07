TOKEN_ALIAS=token
FPC_ALIAS=sponsoredFPC

section "Deploying token contract (alias: $TOKEN_ALIAS) and creating a sponsored fpc (alias: $FPC_ALIAS)"

aztec-wallet import-test-accounts
aztec-wallet deploy sponsored_fpc_contract@SponsoredFPC -f test0 -a $FPC_ALIAS --no-init

CLAIM=$(aztec-wallet bridge-fee-juice 1000000000000000000000 contracts:$FPC_ALIAS --mint --no-wait --json)

retrieve () {
  echo "$CLAIM" | grep "\"$1\"" | awk -F ': ' '{print $2}' | tr -d '",'
}

claimAmount=$(retrieve claimAmount)
claimSecret=$(retrieve claimSecret)
messageLeafIndex=$(retrieve messageLeafIndex)

# The bridged claim is only consumable inboxLag (2) checkpoints after the L1->L2 message is inserted.
# deploy_token.sh produces two blocks; the extra set_minter below produces a third, so the claim is
# available by the time we consume it.
source $flows/shared/deploy_token.sh $TOKEN_ALIAS test1
aztec-wallet send set_minter -ca $TOKEN_ALIAS --args accounts:test0 true -f test0

# Claim the fee juice by calling the fee juice contract directly. Reference it via the registered
# protocol-contract alias rather than a hardcoded address, which moves when protocol addresses are renumbered.
# Using a pre-funded test account because SponsoredFPC is not an account contract and can't be used to send a tx.
aztec-wallet send claim -ca contracts:FeeJuice -c ../../../yarn-project/protocol-contracts/artifacts/FeeJuice.json --args contracts:$FPC_ALIAS $claimAmount $claimSecret $messageLeafIndex -f test0
