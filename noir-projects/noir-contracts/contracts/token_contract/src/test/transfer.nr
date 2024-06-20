use crate::test::utils;
use dep::aztec::{test::helpers::cheatcodes, oracle::unsafe_rand::unsafe_rand};
use dep::authwit::cheatcodes as authwit_cheatcodes;
use crate::Token;

#[test]
unconstrained fn private_transfer() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) = utils::setup_and_mint(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = 1000;
    let private_transfer_call_interface = Token::at(token_contract_address).transfer(recipient, transfer_amount);
    env.call_private_void(private_transfer_call_interface);

    // Check balances
    utils::check_private_balance(token_contract_address, owner, mint_amount - transfer_amount);
    utils::check_private_balance(token_contract_address, recipient, transfer_amount);
}

#[test]
unconstrained fn private_transfer_on_behalf_of() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount) = utils::setup_and_mint(/* with_account_contracts */ true);
    // Add authwit
    let transfer_amount = 1000;
    let private_transfer_from_call_interface = Token::at(token_contract_address).transfer_from(owner, recipient, transfer_amount, 1);
    authwit_cheatcodes::add_private_authwit_from_call_interface(owner, recipient, private_transfer_from_call_interface);
    // Impersonate recipient to perform the call
    cheatcodes::set_contract_address(recipient);
    // Transfer tokens
    env.call_private_void(private_transfer_from_call_interface);
    // Check balances
    utils::check_private_balance(token_contract_address, owner, mint_amount - transfer_amount);
    utils::check_private_balance(token_contract_address, recipient, transfer_amount);
}

#[test]
unconstrained fn public_transfer() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) = utils::setup_and_mint(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = 1000;
    let public_transfer_call_interface = Token::at(token_contract_address).transfer_public(owner, recipient, transfer_amount, 0);
    env.call_public(public_transfer_call_interface);

    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount - transfer_amount);
    utils::check_public_balance(token_contract_address, recipient, transfer_amount);
}

#[test]
unconstrained fn public_transfer_on_behalf_of() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount) = utils::setup_and_mint(/* with_account_contracts */ true);
    let transfer_amount = 1000;
    let public_transfer_from_call_interface = Token::at(token_contract_address).transfer_public(owner, recipient, transfer_amount, 1);
    authwit_cheatcodes::add_public_authwit_from_call_interface(owner, recipient, public_transfer_from_call_interface);
    // Impersonate recipient to perform the call
    cheatcodes::set_contract_address(recipient);
    // Transfer tokens
    env.call_public(public_transfer_from_call_interface);
    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount - transfer_amount);
    utils::check_public_balance(token_contract_address, recipient, transfer_amount);
}
