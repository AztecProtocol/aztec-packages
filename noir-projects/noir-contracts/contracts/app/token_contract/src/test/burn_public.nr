use crate::test::utils;
use crate::Token;
use aztec::{oracle::random::random, test::helpers::authwit::add_public_authwit_from_call_interface};

#[test]
unconstrained fn burn_public_success() {
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);
    let burn_amount = mint_amount / (10 as u128);

    // Burn less than balance
    let _ = env.call_public(
        owner,
        Token::at(token_contract_address).burn_public(owner, burn_amount, 0),
    );
    utils::check_public_balance(
        env,
        token_contract_address,
        owner,
        mint_amount - burn_amount,
    );
}

#[test]
unconstrained fn burn_public_on_behalf_of_other() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);
    let burn_amount = mint_amount / (10 as u128);

    // Burn on behalf of other
    let burn_call_interface =
        Token::at(token_contract_address).burn_public(owner, burn_amount, random());
    add_public_authwit_from_call_interface(env, owner, recipient, burn_call_interface);

    // Burn tokens
    let _ = env.call_public(recipient, burn_call_interface);

    utils::check_public_balance(
        env,
        token_contract_address,
        owner,
        mint_amount - burn_amount,
    );
}

#[test(should_fail)] // should_fail_with = "Assertion failed: attempt to subtract with overflow"
unconstrained fn burn_public_failure_more_than_balance() {
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // Burn more than balance
    let burn_amount = mint_amount * (10 as u128);
    // Try to burn
    let _ = env.call_public(
        owner,
        Token::at(token_contract_address).burn_public(owner, burn_amount, 0),
    );
}

#[test(should_fail)] // should_fail_with = "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero"
unconstrained fn burn_public_failure_on_behalf_of_self_non_zero_nonce() {
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // Burn on behalf of self with non-zero nonce
    let burn_amount = mint_amount / (10 as u128);
    // Try to burn
    let _ = env.call_public(
        owner,
        Token::at(token_contract_address).burn_public(owner, burn_amount, random()),
    );
}

#[test(should_fail)] // should_fail_with = "unauthorized"
unconstrained fn burn_public_failure_on_behalf_of_other_without_approval() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);

    // Burn on behalf of other without approval
    let burn_amount = mint_amount / (10 as u128);
    let burn_call_interface =
        Token::at(token_contract_address).burn_public(owner, burn_amount, random());

    let _ = env.call_public(recipient, burn_call_interface);
}

#[test(should_fail)] // should_fail_with = "unauthorized"
unconstrained fn burn_public_failure_on_behalf_of_other_wrong_caller() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);

    // Burn on behalf of other, wrong designated caller
    let burn_amount = mint_amount / (10 as u128);
    let burn_call_interface =
        Token::at(token_contract_address).burn_public(owner, burn_amount, random());
    add_public_authwit_from_call_interface(env, owner, owner, burn_call_interface);

    let _ = env.call_public(recipient, burn_call_interface);
}
