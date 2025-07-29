use crate::{test::utils, Token};

#[test]
unconstrained fn mint_to_public_success() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _) = utils::setup(/* with_account_contracts */ false);

    let mint_amount = 10_000 as u128;
    env.call_public(owner, Token::at(token_contract_address).mint_to_public(owner, mint_amount));

    utils::check_public_balance(env, token_contract_address, owner, mint_amount);

    let total_supply = env.view_public(Token::at(token_contract_address).total_supply());
    assert(total_supply == mint_amount);
}

#[test(should_fail_with = "caller is not minter")]
unconstrained fn mint_as_non_minter() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, _, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // As non-minter
    let mint_amount = 10_000 as u128;
    env.call_public(
        recipient,
        Token::at(token_contract_address).mint_to_public(recipient, mint_amount),
    );
}

#[test(should_fail)]
unconstrained fn mint_overflow() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // We mint twice because each mint amount must be a valid u128
    let amount_until_overflow = 1000 as u128;
    let mint_amount = (2.pow_32(128) - amount_until_overflow as Field) as u128;

    env.call_public(owner, Token::at(token_contract_address).mint_to_public(recipient, mint_amount));
    env.call_public(
        owner,
        Token::at(token_contract_address).mint_to_public(recipient, amount_until_overflow),
    );
}
