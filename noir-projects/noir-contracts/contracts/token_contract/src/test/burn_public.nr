use crate::test::utils;
use crate::Token;
use dep::authwit::cheatcodes as authwit_cheatcodes;
use dep::aztec::oracle::random::random;

#[test]
unconstrained fn burn_public_success() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);
    let burn_amount = mint_amount / 10;

    // Burn less than balance
    Token::at(token_contract_address).burn_public(owner, burn_amount, 0).call(&mut env.public());
    utils::check_public_balance(token_contract_address, owner, mint_amount - burn_amount);
}

#[test]
unconstrained fn burn_public_on_behalf_of_other() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);
    let burn_amount = mint_amount / 10;

    // Burn on behalf of other
    let burn_call_interface =
        Token::at(token_contract_address).burn_public(owner, burn_amount, random());
    authwit_cheatcodes::add_public_authwit_from_call_interface(
        owner,
        recipient,
        burn_call_interface,
    );
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Burn tokens
    burn_call_interface.call(&mut env.public());
    utils::check_public_balance(token_contract_address, owner, mint_amount - burn_amount);
}

#[test(should_fail_with = "attempt to subtract with underflow")]
unconstrained fn burn_public_failure_more_than_balance() {
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // Burn more than balance
    let burn_amount = mint_amount * 10;
    // Try to burn
    Token::at(token_contract_address).burn_public(owner, burn_amount, 0).call(&mut env.public());
}

#[test(should_fail_with = "invalid nonce")]
unconstrained fn burn_public_failure_on_behalf_of_self_non_zero_nonce() {
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // Burn on behalf of self with non-zero nonce
    let burn_amount = mint_amount / 10;
    // Try to burn
    Token::at(token_contract_address).burn_public(owner, burn_amount, random()).call(
        &mut env.public(),
    );
}

#[test(should_fail_with = "unauthorized")]
unconstrained fn burn_public_failure_on_behalf_of_other_without_approval() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);

    // Burn on behalf of other without approval
    let burn_amount = mint_amount / 10;
    let burn_call_interface =
        Token::at(token_contract_address).burn_public(owner, burn_amount, random());
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    burn_call_interface.call(&mut env.public());
}

#[test(should_fail_with = "unauthorized")]
unconstrained fn burn_public_failure_on_behalf_of_other_wrong_caller() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);

    // Burn on behalf of other, wrong designated caller
    let burn_amount = mint_amount / 10;
    let burn_call_interface =
        Token::at(token_contract_address).burn_public(owner, burn_amount, random());
    authwit_cheatcodes::add_public_authwit_from_call_interface(owner, owner, burn_call_interface);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    burn_call_interface.call(&mut env.public());
}
