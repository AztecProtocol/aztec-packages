use crate::test::utils;
use crate::Token;

// It is not possible to deserialize strings in Noir ATM, so name and symbol cannot be checked yet.

#[test]
unconstrained fn check_decimals_private() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, _, _) = utils::setup(/* with_account_contracts */ false);

    let result = env.view_private(Token::at(token_contract_address).private_get_decimals());

    assert(result == 18);
}

#[test]
unconstrained fn check_decimals_public() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, _, _) = utils::setup(/* with_account_contracts */ false);

    // Check decimals
    let result = env.view_public(Token::at(token_contract_address).public_get_decimals());

    assert(result == 18);
}
