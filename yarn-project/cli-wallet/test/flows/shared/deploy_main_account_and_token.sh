TOKEN_ALIAS=token
ACCOUNT_ALIAS=main

section "Deploying token contract (alias: $TOKEN_ALIAS) and creating a funded account (alias: $ACCOUNT_ALIAS)"

aztec-wallet create-account -a $ACCOUNT_ALIAS --register-only
aztec-wallet bridge-fee-juice 1000000000000000000000 $ACCOUNT_ALIAS --mint --no-wait

# Deploy token contract and set the main account as a minter.
# The following produces enough checkpoints for the L1 to L2 message to be ready.
source $flows/shared/deploy_token.sh $TOKEN_ALIAS $ACCOUNT_ALIAS

# Deploying the account, paying the fee via bridging fee juice from L1 using the claim created above.
aztec-wallet deploy-account $ACCOUNT_ALIAS --payment method=fee_juice,claim
