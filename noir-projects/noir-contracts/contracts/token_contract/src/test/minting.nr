use crate::test::utils;
use crate::{Token, types::transparent_note::TransparentNote};
use dep::aztec::{oracle::random::random, test::helpers::cheatcodes};

#[test]
unconstrained fn mint_public_success() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _) = utils::setup(/* with_account_contracts */ false);

    let mint_amount = 10000;
    Token::at(token_contract_address).mint_public(owner, mint_amount).call(&mut env.public());

    utils::check_public_balance(token_contract_address, owner, mint_amount);

    let total_supply = Token::at(token_contract_address).total_supply().view(&mut env.public());
    assert(total_supply == mint_amount);
}

#[test]
unconstrained fn mint_public_failures() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // As non-minter
    let mint_amount = 10000;
    env.impersonate(recipient);
    let mint_public_call_interface =
        Token::at(token_contract_address).mint_public(owner, mint_amount);
    env.assert_public_call_fails(mint_public_call_interface);

    utils::check_public_balance(token_contract_address, owner, 0);

    env.impersonate(owner);

    // Overflow recipient
    let mint_amount = 2.pow_32(128);
    let mint_public_call_interface =
        Token::at(token_contract_address).mint_public(owner, mint_amount);
    env.assert_public_call_fails(mint_public_call_interface);

    utils::check_public_balance(token_contract_address, owner, 0);

    // Overflow total supply
    let mint_for_recipient_amount = 1000;

    Token::at(token_contract_address).mint_public(recipient, mint_for_recipient_amount).call(
        &mut env.public(),
    );

    let mint_amount = 2.pow_32(128) - mint_for_recipient_amount;
    let mint_public_call_interface =
        Token::at(token_contract_address).mint_public(owner, mint_amount);
    env.assert_public_call_fails(mint_public_call_interface);

    utils::check_public_balance(token_contract_address, recipient, mint_for_recipient_amount);
    utils::check_public_balance(token_contract_address, owner, 0);
}
