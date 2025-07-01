use crate::test::utils;
use crate::Token;
use aztec::test::helpers::authwit::add_private_authwit_from_call_interface;

#[test]
unconstrained fn transfer_private_on_behalf_of_other() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);
    // Add authwit
    // docs:start:private_authwit
    let transfer_amount = 1000 as u128;
    let transfer_private_from_call_interface =
        Token::at(token_contract_address).transfer_in_private(owner, recipient, transfer_amount, 1);
    add_private_authwit_from_call_interface(owner, recipient, transfer_private_from_call_interface);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Transfer tokens
    transfer_private_from_call_interface.call(&mut env.private());
    // docs:end:private_authwit
    // Check balances
    utils::check_private_balance(token_contract_address, owner, mint_amount - transfer_amount);
    utils::check_private_balance(token_contract_address, recipient, transfer_amount);
}

// docs:start:fail_with_message
#[test(should_fail_with = "invalid authwit nonce")]
unconstrained fn transfer_private_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, _) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    // Add authwit
    let transfer_amount = 1000 as u128;
    let transfer_private_from_call_interface =
        Token::at(token_contract_address).transfer_in_private(owner, recipient, transfer_amount, 1);
    add_private_authwit_from_call_interface(owner, recipient, transfer_private_from_call_interface);
    // Transfer tokens
    transfer_private_from_call_interface.call(&mut env.private());
}
// docs:end:fail_with_message

#[test(should_fail_with = "Balance too low")]
unconstrained fn transfer_private_failure_on_behalf_of_more_than_balance() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);
    // Add authwit
    let transfer_amount = mint_amount + (1 as u128);
    let transfer_private_from_call_interface =
        Token::at(token_contract_address).transfer_in_private(owner, recipient, transfer_amount, 1);
    add_private_authwit_from_call_interface(owner, recipient, transfer_private_from_call_interface);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Transfer tokens
    transfer_private_from_call_interface.call(&mut env.private());
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn transfer_private_failure_on_behalf_of_other_without_approval() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, _) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);
    // Add authwit
    let transfer_amount = 1000 as u128;
    let transfer_private_from_call_interface =
        Token::at(token_contract_address).transfer_in_private(owner, recipient, transfer_amount, 1);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Transfer tokens
    transfer_private_from_call_interface.call(&mut env.private());
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn transfer_private_failure_on_behalf_of_other_wrong_caller() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, _) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);
    // Add authwit
    let transfer_amount = 1000 as u128;
    let transfer_private_from_call_interface =
        Token::at(token_contract_address).transfer_in_private(owner, recipient, transfer_amount, 1);
    add_private_authwit_from_call_interface(owner, owner, transfer_private_from_call_interface);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Transfer tokens
    transfer_private_from_call_interface.call(&mut env.private());
}
