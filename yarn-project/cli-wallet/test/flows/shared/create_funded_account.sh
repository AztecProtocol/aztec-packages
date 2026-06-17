ALIAS=$1

section "Creating a funded account (alias: $ALIAS)"

aztec-wallet create-account -a $ALIAS --register-only
aztec-wallet bridge-fee-juice 1000000000000000000000 $ALIAS --mint --no-wait

# The following produces enough checkpoints for the L1 to L2 message to be ready.
source $flows/shared/deploy_token.sh tmp-token-$ALIAS $ALIAS

# Deploying the account, paying the fee via bridging fee juice from L1 using the claim created above.
aztec-wallet deploy-account $ALIAS --payment method=fee_juice,claim
