MINT_AMOUNT=$1
MINTER=$2

section "Minting $MINT_AMOUNT tokens to $MINTER privately"

aztec-wallet send mint_to_private -ca token --args accounts:$MINTER $MINT_AMOUNT -f $MINTER
