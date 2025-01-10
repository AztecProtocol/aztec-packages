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
    let mint_amount = U128::from_integer(2.pow_32(128));
    let mint_to_public_call_interface =
        Token::at(token_contract_address).mint_to_public(owner, mint_amount);
    env.assert_public_call_fails(mint_to_public_call_interface);

    utils::check_public_balance(token_contract_address, owner, U128::zero());

    // Overflow total supply
    let mint_for_recipient_amount = U128::from_integer(1_000);

    Token::at(token_contract_address).mint_to_public(recipient, mint_for_recipient_amount).call(
        &mut env.public(),
    );

    let mint_amount = U128::from_integer(2.pow_32(128)) - mint_for_recipient_amount;
    let mint_to_public_call_interface =
        Token::at(token_contract_address).mint_to_public(owner, mint_amount);
    env.assert_public_call_fails(mint_to_public_call_interface);

    utils::check_public_balance(token_contract_address, recipient, mint_for_recipient_amount);
    utils::check_public_balance(token_contract_address, owner, U128::zero());
}
