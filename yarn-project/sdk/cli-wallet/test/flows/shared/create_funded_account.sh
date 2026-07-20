ALIAS=$1

section "Creating a funded account (alias: $ALIAS)"

aztec-wallet create-account -a $ALIAS --register-only
aztec-wallet bridge-fee-juice 1000000000000000000000 $ALIAS --mint --no-wait

# The bridged claim is only consumable inboxLag (2) checkpoints after the L1->L2 message is inserted.
# deploy_token.sh produces two blocks; the extra set_minter below produces a third, so the claim is
# available by the time we deploy the account with it.
source $flows/shared/deploy_token.sh tmp-token-$ALIAS $ALIAS
aztec-wallet send set_minter -ca tmp-token-$ALIAS --args accounts:test0 true -f test0

# Deploying the account, paying the fee via bridging fee juice from L1 using the claim created above.
aztec-wallet deploy-account $ALIAS --payment method=fee_juice,claim
