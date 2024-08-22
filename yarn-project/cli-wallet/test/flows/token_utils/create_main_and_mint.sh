section "Deploying contracts and minting tokens"

aztec-wallet create-account -a main
aztec-wallet deploy token_contract@Token --args accounts:main Test TST 18 -f main -a token
aztec-wallet create-secret -a shield
aztec-wallet send mint_private -ca token --args $1 secrets:shield:hash -f main
aztec-wallet add-note TransparentNote pending_shields -ca token -t last -a main -b $1 secrets:shield:hash
aztec-wallet send redeem_shield -ca token --args accounts:main $1 secrets:shield -f main