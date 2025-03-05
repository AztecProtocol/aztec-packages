section "Deploying token contract and creating a funded main account"

aztec-wallet create-account -a main --register-only
aztec-wallet bridge-fee-juice 100000000000000000 main --mint --no-wait

# Deploy token contract and set the main account as a minter using the pre-funded test account.
# These two txs produce two blocks, allowing the claim to be used in the next block.
aztec-wallet import-test-accounts
aztec-wallet deploy token_contract@Token --args accounts:test0 Test TST 18 -f test0 -a token
aztec-wallet send set_minter -ca token --args accounts:main true -f test0

# Deploying the account, paying the fee via bridging fee juice from L1 using the claim created above.
aztec-wallet deploy-account -f main --payment method=fee_juice,claim
