use crate::{test::utils, Token};

#[test]
unconstrained fn mint_to_public_success() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _) = utils::setup(/* with_account_contracts */ false);

    let mint_amount = U128::from_integer(10_000);
    Token::at(token_contract_address).mint_to_public(owner, mint_amount).call(&mut env.public());

    utils::check_public_balance(token_contract_address, owner, mint_amount);

    let total_supply = Token::at(token_contract_address).total_supply().view(&mut env.public());
    assert(total_supply == mint_amount);
}

#[test]
unconstrained fn mint_to_public_failures() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // As non-minter
    let mint_amount = U128::from_integer(10_000);
    env.impersonate(recipient);
    let mint_to_public_call_interface =
        Token::at(token_contract_address).mint_to_public(owner, mint_amount);
    env.assert_public_call_fails(mint_to_public_call_interface);

    utils::check_public_balance(token_contract_address, owner, U128::zero());

    env.impersonate(owner);

    // Overflow recipient

    // We have to do this in 2 steps because we have to pass in a valid U128
    let amount_until_overflow = U128::from_integer(1000);
    let mint_amount = U128::from_integer(2.pow_32(128) - amount_until_overflow.to_integer());

    Token::at(token_contract_address).mint_to_public(recipient, mint_amount).call(&mut env.public());

    let mint_to_public_call_interface =
        Token::at(token_contract_address).mint_to_public(owner, amount_until_overflow);
    env.assert_public_call_fails(mint_to_public_call_interface);

    utils::check_public_balance(token_contract_address, owner, U128::zero());
    utils::check_total_supply(token_contract_address, mint_amount);

    // Overflow total supply
    let mint_to_public_call_interface =
        Token::at(token_contract_address).mint_to_public(owner, mint_amount);
    env.assert_public_call_fails(mint_to_public_call_interface);

    utils::check_public_balance(token_contract_address, owner, U128::zero());
}
