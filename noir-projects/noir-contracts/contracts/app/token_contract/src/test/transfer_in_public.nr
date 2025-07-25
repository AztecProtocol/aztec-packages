use crate::test::utils;
use crate::Token;
use aztec::test::helpers::authwit::add_public_authwit_from_call_interface;

#[test]
unconstrained fn public_transfer() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = mint_amount / (10 as u128);
    let _ = env.call_public(
        owner,
        Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 0),
    );

    // Check balances
    utils::check_public_balance(
        env,
        token_contract_address,
        owner,
        mint_amount - transfer_amount,
    );
    utils::check_public_balance(env, token_contract_address, recipient, transfer_amount);
}

#[test]
unconstrained fn public_transfer_to_self() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = mint_amount / (10 as u128);
    // docs:start:call_public
    let _ = env.call_public(
        owner,
        Token::at(token_contract_address).transfer_in_public(owner, owner, transfer_amount, 0),
    );
    // docs:end:call_public
    // Check balances
    utils::check_public_balance(env, token_contract_address, owner, mint_amount);
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
        env,
        owner,
        recipient,
        public_transfer_in_private_call_interface,
    );
    // Transfer tokens
    let _ = env.call_public(recipient, public_transfer_in_private_call_interface);
    // Check balances
    utils::check_public_balance(
        env,
        token_contract_address,
        owner,
        mint_amount - transfer_amount,
    );
    utils::check_public_balance(env, token_contract_address, recipient, transfer_amount);
}

#[test(should_fail)] // should_fail_with = "Assertion failed: attempt to subtract with overflow"
unconstrained fn public_transfer_failure_more_than_balance() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = mint_amount + (1 as u128);
    let public_transfer_call_interface =
        Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 0);
    // Try to transfer tokens
    let _ = env.call_public(owner, public_transfer_call_interface);
}

#[test(should_fail)] // should_fail_with = "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero"
unconstrained fn public_transfer_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = mint_amount / (10 as u128);
    let public_transfer_call_interface =
        Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 1);
    add_public_authwit_from_call_interface(env, owner, recipient, public_transfer_call_interface);
    // Try to transfer tokens
    let _ = env.call_public(owner, public_transfer_call_interface);
}

#[test(should_fail)] // should_fail_with = "unauthorized"
unconstrained fn public_transfer_failure_on_behalf_of_other_without_approval() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);
    let transfer_amount = mint_amount / (10 as u128);
    let public_transfer_in_private_call_interface =
        Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 1);

    // Try to transfer tokens
    let _ = env.call_public(recipient, public_transfer_in_private_call_interface);
}

#[test(should_fail)] // should_fail_with = "Assertion failed: attempt to subtract with overflow"
unconstrained fn public_transfer_failure_on_behalf_of_other_more_than_balance() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);
    let transfer_amount = mint_amount + (1 as u128);
    // docs:start:public_authwit
    let public_transfer_in_private_call_interface =
        Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 1);
    add_public_authwit_from_call_interface(
        env,
        owner,
        recipient,
        public_transfer_in_private_call_interface,
    );
    // docs:end:public_authwit

    // Try to transfer tokens
    let _ = env.call_public(recipient, public_transfer_in_private_call_interface);
}

#[test(should_fail)] // should_fail_with = "unauthorized"
unconstrained fn public_transfer_failure_on_behalf_of_other_wrong_caller() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ true);
    let transfer_amount = mint_amount / (10 as u128);
    let public_transfer_in_private_call_interface =
        Token::at(token_contract_address).transfer_in_public(owner, recipient, transfer_amount, 1);
    add_public_authwit_from_call_interface(
        env,
        owner,
        owner,
        public_transfer_in_private_call_interface,
    );

    // Try to transfer tokens
    let _ = env.call_public(recipient, public_transfer_in_private_call_interface);
}
