ALIAS=$1

section "Creating a funded account (alias: $ALIAS)"

aztec-wallet create-account -a $ALIAS --register-only
aztec-wallet bridge-fee-juice 100000000000000000 $ALIAS --mint --no-wait

# The following produces two blocks, allowing the claim to be used in the next block.
source $TEST_FOLDER/shared/deploy_token.sh tmp-token-$ALIAS $ALIAS

# Deploying the account, paying the fee via bridging fee juice from L1 using the claim created above.
aztec-wallet deploy-account -f $ALIAS --payment method=fee_juice,claim
