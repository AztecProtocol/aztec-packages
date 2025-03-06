section "Minting tokens publicly"

aztec-wallet send mint_to_public -ca token --args accounts:main $1 -f main

RESULT_MAIN=$(aztec-wallet simulate balance_of_public -ca token --args accounts:main -f main | grep "Simulation result:" | awk '{print $3}')

if [ "${1}n" != "$RESULT_MAIN" ]; then
    echo
    err "Couldn't mint tokens"
    exit 1
fi
