TOKEN_ALIAS=$1
MINTER=$2

section "Deploying token contract (alias: $TOKEN_ALIAS) and setting '$MINTER' as a minter"

aztec-wallet import-test-accounts
aztec-wallet deploy token_contract@Token --args accounts:test0 Test TST 18 -f test0 -a $TOKEN_ALIAS
aztec-wallet send set_minter -ca $TOKEN_ALIAS --args accounts:$MINTER true -f test0
