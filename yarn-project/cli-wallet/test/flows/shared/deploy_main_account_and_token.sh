TOKEN_ALIAS=token
ACCOUNT_ALIAS=main

section "Deploying token contract (alias: $TOKEN_ALIAS) and creating a funded account (alias: $ACCOUNT_ALIAS)"

aztec-wallet create-account -a $ACCOUNT_ALIAS --register-only
aztec-wallet bridge-fee-juice $ACCOUNT_ALIAS --no-wait

# Deploy token contract and set the main account as a minter.
# The following produces two blocks, allowing the claim to be used in the next block.
source $flows/shared/deploy_token.sh $TOKEN_ALIAS $ACCOUNT_ALIAS

# Deploying the account, paying the fee via bridging fee juice from L1 using the claim created above.
aztec-wallet deploy-account -f $ACCOUNT_ALIAS --payment method=fee_juice,claim
