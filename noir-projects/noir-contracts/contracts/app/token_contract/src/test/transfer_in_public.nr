use crate::test::utils;
use crate::Token;
use aztec::{oracle::random::random, test::helpers::authwit::add_public_authwit_from_call_interface};

#[test]
unconstrained fn public_transfer() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = mint_amount / (10 as u128);
    Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 0).call(
        &mut env.public(),
    );

    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount - transfer_amount);
    utils::check_public_balance(token_contract_address, recipient, transfer_amount);
}

#[test]
unconstrained fn public_transfer_to_self() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = mint_amount / (10 as u128);
    // docs:start:call_public
    Token::at(token_contract_address).transfer_in_public(owner, owner, transfer_amount, 0).call(
        &mut env.public(),
    );
    // docs:end:call_public
    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount);
}

#[test]
unconstrained fn public_transfer_on_behalf_of_other() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);
    let transfer_amount = mint_amount / (10 as u128);
    let public_transfer_in_private_call_interface =
        Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 1);
    add_public_authwit_from_call_interface(
        owner,
        recipient,
        public_transfer_in_private_call_interface,
    );
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Transfer tokens
    public_transfer_in_private_call_interface.call(&mut env.public());
    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount - transfer_amount);
    utils::check_public_balance(token_contract_address, recipient, transfer_amount);
}

#[test(should_fail_with = "Assertion failed: attempt to subtract with overflow")]
unconstrained fn public_transfer_failure_more_than_balance() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = mint_amount + (1 as u128);
    let public_transfer_call_interface =
        Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 0);
    // Try to transfer tokens
    public_transfer_call_interface.call(&mut env.public());
}

#[test(should_fail_with = "invalid authwit nonce")]
unconstrained fn public_transfer_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = mint_amount / (10 as u128);
    let public_transfer_call_interface = Token::at(token_contract_address).transfer_in_public(
        owner,
        recipient,
        transfer_amount,
        random(),
    );
    add_public_authwit_from_call_interface(owner, recipient, public_transfer_call_interface);
    // Try to transfer tokens
    public_transfer_call_interface.call(&mut env.public());
}

#[test(should_fail_with = "unauthorized")]
unconstrained fn public_transfer_failure_on_behalf_of_other_without_approval() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);
    let transfer_amount = mint_amount / (10 as u128);
    let public_transfer_in_private_call_interface =
        Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 1);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Try to transfer tokens
    public_transfer_in_private_call_interface.call(&mut env.public());
}

#[test(should_fail_with = "Assertion failed: attempt to subtract with overflow")]
unconstrained fn public_transfer_failure_on_behalf_of_other_more_than_balance() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);
    let transfer_amount = mint_amount + (1 as u128);
    // docs:start:public_authwit
    let public_transfer_in_private_call_interface =
        Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 1);
    add_public_authwit_from_call_interface(
        owner,
        recipient,
        public_transfer_in_private_call_interface,
    );
    // docs:end:public_authwit
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Try to transfer tokens
    public_transfer_in_private_call_interface.call(&mut env.public());
}

#[test(should_fail_with = "unauthorized")]
unconstrained fn public_transfer_failure_on_behalf_of_other_wrong_caller() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);
    let transfer_amount = mint_amount / (10 as u128);
    let public_transfer_in_private_call_interface =
        Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 1);
    add_public_authwit_from_call_interface(owner, owner, public_transfer_in_private_call_interface);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Try to transfer tokens
    public_transfer_in_private_call_interface.call(&mut env.public());
}
