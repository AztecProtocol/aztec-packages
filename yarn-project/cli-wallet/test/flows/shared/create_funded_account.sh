ALIAS=$1

section "Creating a funded account. Alias: $ALIAS"

aztec-wallet create-account -a $ALIAS --register-only
aztec-wallet bridge-fee-juice 100000000000000000 $ALIAS --mint --no-wait

# These two txs produce two blocks, allowing the claim to be used in the next block.
aztec-wallet import-test-accounts
TMP_ALIAS="tmp-$ALIAS"
aztec-wallet deploy counter_contract@Counter --init initialize --args 0 accounts:test0 -f test0 -a $TMP_ALIAS
aztec-wallet send increment -ca $TMP_ALIAS --args accounts:test0 accounts:test0 -f test0

# Deploying the account, paying the fee via bridging fee juice from L1 using the claim created above.
# aztec-wallet deploy-account -f $ALIAS --payment method=fee_juice,claim
aztec-wallet deploy-account -f $ALIAS --payment method=fee_juice,claim
