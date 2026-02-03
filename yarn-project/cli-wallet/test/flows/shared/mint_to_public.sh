MINT_AMOUNT=$1
MINTER=$2

section "Minting $MINT_AMOUNT tokens to $MINTER publicly"

aztec-wallet send mint_to_public -ca token --args accounts:$MINTER $MINT_AMOUNT -f $MINTER
