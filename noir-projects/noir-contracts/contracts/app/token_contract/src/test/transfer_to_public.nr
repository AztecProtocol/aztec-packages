use crate::test::utils;
use crate::Token;
use aztec::{
    oracle::random::random, test::helpers::authwit::add_private_authwit_from_call_interface,
};

#[test]
unconstrained fn transfer_to_public_on_behalf_of_self() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    let transfer_to_public_amount = mint_amount / (10 as u128);
    Token::at(token_contract_address)
        .transfer_to_public(owner, owner, transfer_to_public_amount, 0)
        .call(&mut env.private());
    utils::check_private_balance(
        token_contract_address,
        owner,
        mint_amount - transfer_to_public_amount,
    );
    utils::check_public_balance(token_contract_address, owner, transfer_to_public_amount);
}

#[test]
unconstrained fn transfer_to_public_on_behalf_of_other() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);

    let transfer_to_public_amount = mint_amount / (10 as u128);
    let transfer_to_public_call_interface = Token::at(token_contract_address).transfer_to_public(
        owner,
        recipient,
        transfer_to_public_amount,
        0,
    );
    add_private_authwit_from_call_interface(owner, recipient, transfer_to_public_call_interface);
    // Impersonate recipient
    env.impersonate(recipient);
    // transfer_to_public tokens
    transfer_to_public_call_interface.call(&mut env.private());
    utils::check_private_balance(
        token_contract_address,
        owner,
        mint_amount - transfer_to_public_amount,
    );
    utils::check_public_balance(token_contract_address, recipient, transfer_to_public_amount);
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn transfer_to_public_failure_more_than_balance() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    let transfer_to_public_amount = mint_amount + (1 as u128);
    Token::at(token_contract_address)
        .transfer_to_public(owner, owner, transfer_to_public_amount, 0)
        .call(&mut env.private());
}

#[test(should_fail_with = "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero")]
unconstrained fn transfer_to_public_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    let transfer_to_public_amount = mint_amount + (1 as u128);
    Token::at(token_contract_address)
        .transfer_to_public(owner, owner, transfer_to_public_amount, random())
        .call(&mut env.private());
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn transfer_to_public_failure_on_behalf_of_other_more_than_balance() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);

    let transfer_to_public_amount = mint_amount + (1 as u128);
    let transfer_to_public_call_interface = Token::at(token_contract_address).transfer_to_public(
        owner,
        recipient,
        transfer_to_public_amount,
        0,
    );
    add_private_authwit_from_call_interface(owner, recipient, transfer_to_public_call_interface);
    // Impersonate recipient
    env.impersonate(recipient);
    // transfer_to_public tokens
    transfer_to_public_call_interface.call(&mut env.private());
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn transfer_to_public_failure_on_behalf_of_other_invalid_designated_caller() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);

    let transfer_to_public_amount = mint_amount + (1 as u128);
    let transfer_to_public_call_interface = Token::at(token_contract_address).transfer_to_public(
        owner,
        recipient,
        transfer_to_public_amount,
        0,
    );
    add_private_authwit_from_call_interface(owner, owner, transfer_to_public_call_interface);
    // Impersonate recipient
    env.impersonate(recipient);
    // transfer_to_public tokens
    transfer_to_public_call_interface.call(&mut env.private());
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn transfer_to_public_failure_on_behalf_of_other_no_approval() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);

    let transfer_to_public_amount = mint_amount + (1 as u128);
    let transfer_to_public_call_interface = Token::at(token_contract_address).transfer_to_public(
        owner,
        recipient,
        transfer_to_public_amount,
        0,
    );
    // Impersonate recipient
    env.impersonate(recipient);
    // transfer_to_public tokens
    transfer_to_public_call_interface.call(&mut env.private());
}
