use crate::{test::utils, Token};

#[test]
unconstrained fn mint_to_public_success() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _) = utils::setup(/* with_account_contracts */ false);

    let mint_amount = 10_000 as u128;
    let _ = env.call_public_test(
        owner,
        Token::at(token_contract_address).mint_to_public(owner, mint_amount),
    );

    utils::check_public_balance(env, token_contract_address, owner, mint_amount);
    utils::check_total_supply(env, token_contract_address, mint_amount);
}

#[test]
unconstrained fn mint_to_public_failures() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // As non-minter
    let mint_amount = 10_000 as u128;
    let mint_to_public_call_interface =
        Token::at(token_contract_address).mint_to_public(owner, mint_amount);
    env.assert_public_call_fails(recipient, mint_to_public_call_interface);

    utils::check_public_balance(env, token_contract_address, owner, 0 as u128);

    // Overflow recipient

    // We have to do this in 2 steps because we have to pass in a valid u128
    let amount_until_overflow = 1000 as u128;
    let mint_amount = (2.pow_32(128) - amount_until_overflow as Field) as u128;

    let _ = env.call_public_test(
        owner,
        Token::at(token_contract_address).mint_to_public(recipient, mint_amount),
    );

    let mint_to_public_call_interface =
        Token::at(token_contract_address).mint_to_public(owner, amount_until_overflow);
    env.assert_public_call_fails(owner, mint_to_public_call_interface);

    utils::check_public_balance(env, token_contract_address, owner, 0 as u128);
    utils::check_total_supply(env, token_contract_address, mint_amount);

    // Overflow total supply
    let mint_to_public_call_interface =
        Token::at(token_contract_address).mint_to_public(owner, mint_amount);
    env.assert_public_call_fails(owner, mint_to_public_call_interface);

    utils::check_public_balance(env, token_contract_address, owner, 0 as u128);
}
