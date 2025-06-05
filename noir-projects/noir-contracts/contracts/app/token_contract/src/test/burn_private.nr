use crate::test::utils;
use crate::Token;
use dep::authwit::cheatcodes as authwit_cheatcodes;
use dep::aztec::oracle::random::random;

#[test]
unconstrained fn burn_private_on_behalf_of_self() {
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    let burn_amount = mint_amount / (10 as u128);

    // Burn less than balance
    Token::at(token_contract_address).burn_private(owner, burn_amount, 0).call(&mut env.private());
    utils::check_private_balance(token_contract_address, owner, mint_amount - burn_amount);
}

#[test]
unconstrained fn burn_private_on_behalf_of_other() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);
    let burn_amount = mint_amount / (10 as u128);

    // Burn on behalf of other
    let burn_call_interface =
        Token::at(token_contract_address).burn_private(owner, burn_amount, random());
    authwit_cheatcodes::add_private_authwit_from_call_interface(
        owner,
        recipient,
        burn_call_interface,
    );
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Burn tokens
    burn_call_interface.call(&mut env.private());
    utils::check_private_balance(token_contract_address, owner, mint_amount - burn_amount);
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn burn_private_failure_more_than_balance() {
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // Burn more than balance
    let burn_amount = mint_amount * (10 as u128);
    Token::at(token_contract_address).burn_private(owner, burn_amount, 0).call(&mut env.private());
}

#[test(should_fail_with = "invalid authwit nonce")]
unconstrained fn burn_private_failure_on_behalf_of_self_non_zero_nonce() {
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // Burn more than balance
    let burn_amount = mint_amount / (10 as u128);
    Token::at(token_contract_address).burn_private(owner, burn_amount, random()).call(
        &mut env.private(),
    );
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn burn_private_failure_on_behalf_of_other_more_than_balance() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);

    // Burn more than balance
    let burn_amount = mint_amount * (10 as u128);
    // Burn on behalf of other
    let burn_call_interface =
        Token::at(token_contract_address).burn_private(owner, burn_amount, random());
    authwit_cheatcodes::add_private_authwit_from_call_interface(
        owner,
        recipient,
        burn_call_interface,
    );
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    burn_call_interface.call(&mut env.private());
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn burn_private_failure_on_behalf_of_other_without_approval() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);

    // Burn more than balance
    let burn_amount = mint_amount / (10 as u128);
    // Burn on behalf of other
    let burn_call_interface = Token::at(token_contract_address).burn_private(owner, burn_amount, 3);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    burn_call_interface.call(&mut env.private());
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn burn_private_failure_on_behalf_of_other_wrong_designated_caller() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);

    // Burn more than balance
    let burn_amount = mint_amount / (10 as u128);
    // Burn on behalf of other
    let burn_call_interface = Token::at(token_contract_address).burn_private(owner, burn_amount, 3);
    authwit_cheatcodes::add_private_authwit_from_call_interface(owner, owner, burn_call_interface);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    burn_call_interface.call(&mut env.private());
}
