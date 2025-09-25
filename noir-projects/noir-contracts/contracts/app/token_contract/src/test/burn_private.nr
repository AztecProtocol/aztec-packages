use crate::test::utils;
use crate::Token;
use aztec::test::helpers::authwit::add_private_authwit_from_call_interface;

global AUTHWIT_NONCE: Field = 7;

#[test]
unconstrained fn burn_private_on_behalf_of_self() {
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    let burn_amount = mint_amount / (10 as u128);

    // Burn less than balance
    env.call_private(owner, Token::at(token_contract_address).burn_private(owner, burn_amount, 0));
    utils::check_private_balance(
        env,
        token_contract_address,
        owner,
        mint_amount - burn_amount,
    );
}

#[test]
unconstrained fn burn_private_on_behalf_of_other() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);
    let burn_amount = mint_amount / (10 as u128);

    // Burn on behalf of other
    let burn_call_interface =
        Token::at(token_contract_address).burn_private(owner, burn_amount, AUTHWIT_NONCE);
    add_private_authwit_from_call_interface(env, owner, recipient, burn_call_interface);
    // Burn tokens
    env.call_private(recipient, burn_call_interface);
    utils::check_private_balance(
        env,
        token_contract_address,
        owner,
        mint_amount - burn_amount,
    );
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn burn_private_failure_more_than_balance() {
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // Burn more than balance
    let burn_amount = mint_amount * (10 as u128);
    env.call_private(owner, Token::at(token_contract_address).burn_private(owner, burn_amount, 0));
}

#[test(should_fail_with = "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero")]
unconstrained fn burn_private_failure_on_behalf_of_self_non_zero_nonce() {
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    let burn_amount = mint_amount;
    env.call_private(owner, Token::at(token_contract_address).burn_private(owner, burn_amount, 1));
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn burn_private_failure_on_behalf_of_other_more_than_balance() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);

    // Burn more than balance
    let burn_amount = mint_amount * (10 as u128);
    // Burn on behalf of other
    let burn_call_interface =
        Token::at(token_contract_address).burn_private(owner, burn_amount, AUTHWIT_NONCE);
    add_private_authwit_from_call_interface(env, owner, recipient, burn_call_interface);

    env.call_private(recipient, burn_call_interface);
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn burn_private_failure_on_behalf_of_other_without_approval() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);

    // Burn more than balance
    let burn_amount = mint_amount / (10 as u128);
    // Burn on behalf of other
    let burn_call_interface =
        Token::at(token_contract_address).burn_private(owner, burn_amount, AUTHWIT_NONCE);

    env.call_private(recipient, burn_call_interface);
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn burn_private_failure_on_behalf_of_other_wrong_designated_caller() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);

    // Burn more than balance
    let burn_amount = mint_amount / (10 as u128);
    // Burn on behalf of other
    let burn_call_interface =
        Token::at(token_contract_address).burn_private(owner, burn_amount, AUTHWIT_NONCE);
    add_private_authwit_from_call_interface(env, owner, owner, burn_call_interface);

    env.call_private(recipient, burn_call_interface);
}
