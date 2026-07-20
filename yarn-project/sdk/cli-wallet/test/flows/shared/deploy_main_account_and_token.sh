TOKEN_ALIAS=token
ACCOUNT_ALIAS=main

section "Deploying token contract (alias: $TOKEN_ALIAS) and creating a funded account (alias: $ACCOUNT_ALIAS)"

aztec-wallet create-account -a $ACCOUNT_ALIAS --register-only
aztec-wallet bridge-fee-juice 1000000000000000000000 $ACCOUNT_ALIAS --mint --no-wait

# Deploy token contract and set the main account as a minter.
# The bridged claim is only consumable inboxLag (2) checkpoints after the L1->L2 message is inserted.
# deploy_token.sh produces two blocks; the extra set_minter below produces a third, so the claim is
# available by the time we deploy the account with it.
source $flows/shared/deploy_token.sh $TOKEN_ALIAS $ACCOUNT_ALIAS
aztec-wallet send set_minter -ca $TOKEN_ALIAS --args accounts:test0 true -f test0

# Deploying the account, paying the fee via bridging fee juice from L1 using the claim created above.
aztec-wallet deploy-account $ACCOUNT_ALIAS --payment method=fee_juice,claim
