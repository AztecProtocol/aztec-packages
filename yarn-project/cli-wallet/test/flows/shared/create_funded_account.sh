ALIAS=$1

section "Creating a funded account (alias: $ALIAS)"

aztec-wallet create-account -a $ALIAS --register-only
aztec-wallet bridge-fee-juice $ALIAS --no-wait

# The following produces two blocks, allowing the claim to be used in the next block.
source $flows/shared/deploy_token.sh tmp-token-$ALIAS $ALIAS

# Deploying the account, paying the fee via bridging fee juice from L1 using the claim created above.
# docs:start:deploy-with-bridged-claim
aztec-wallet deploy-account -f $ALIAS --payment method=fee_juice,claim
# docs:end:deploy-with-bridged-claim
