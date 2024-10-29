use crate::test::utils;
use crate::{Token, types::transparent_note::TransparentNote};
use dep::authwit::cheatcodes as authwit_cheatcodes;
use dep::aztec::{hash::compute_secret_hash, oracle::random::random};

#[test]
unconstrained fn shielding_on_behalf_of_self() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_public(/* with_account_contracts */ false);
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    // Shield tokens
    let shield_amount = mint_amount / 10;
    Token::at(token_contract_address).shield(owner, shield_amount, secret_hash, 0).call(
        &mut env.public(),
    );

    // We need to manually add the note to TXE because `TransparentNote` does not support automatic note log delivery.
    env.add_note(
        &mut TransparentNote::new(shield_amount, secret_hash),
        Token::storage_layout().pending_shields.slot,
        token_contract_address,
    );

    // Redeem our shielded tokens
    Token::at(token_contract_address).redeem_shield(owner, shield_amount, secret).call(
        &mut env.private(),
    );

    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount - shield_amount);
    utils::check_private_balance(token_contract_address, owner, shield_amount);
}

#[test]
unconstrained fn shielding_on_behalf_of_other() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_public(/* with_account_contracts */ true);
    let secret = random();
    let secret_hash = compute_secret_hash(secret);

    // Shield tokens on behalf of owner
    let shield_amount = 1000;
    let shield_call_interface =
        Token::at(token_contract_address).shield(owner, shield_amount, secret_hash, 0);
    authwit_cheatcodes::add_public_authwit_from_call_interface(
        owner,
        recipient,
        shield_call_interface,
    );
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Shield tokens
    shield_call_interface.call(&mut env.public());

    // Become owner again
    env.impersonate(owner);
    // We need to manually add the note to TXE because `TransparentNote` does not support automatic note log delivery.
    env.add_note(
        &mut TransparentNote::new(shield_amount, secret_hash),
        Token::storage_layout().pending_shields.slot,
        token_contract_address,
    );

    // Redeem our shielded tokens
    Token::at(token_contract_address).redeem_shield(owner, shield_amount, secret).call(
        &mut env.private(),
    );

    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount - shield_amount);
    utils::check_private_balance(token_contract_address, owner, shield_amount);
}

#[test]
unconstrained fn shielding_failure_on_behalf_of_self_more_than_balance() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_public(/* with_account_contracts */ true);
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    // Shield tokens
    let shield_amount = mint_amount + 1;
    let shield_call_interface =
        Token::at(token_contract_address).shield(owner, shield_amount, secret_hash, 0);
    env.assert_public_call_fails(shield_call_interface);

    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount);
    utils::check_private_balance(token_contract_address, owner, 0);
}

#[test]
unconstrained fn shielding_failure_on_behalf_of_self_invalid_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_public(/* with_account_contracts */ true);
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    // Shield tokens
    let shield_amount = mint_amount / 10;
    let shield_call_interface =
        Token::at(token_contract_address).shield(owner, shield_amount, secret_hash, random());
    env.assert_public_call_fails(shield_call_interface);

    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount);
    utils::check_private_balance(token_contract_address, owner, 0);
}

#[test]
unconstrained fn shielding_failure_on_behalf_of_other_more_than_balance() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_public(/* with_account_contracts */ true);
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    // Shield tokens on behalf of owner
    let shield_amount = mint_amount + 1;
    let shield_call_interface =
        Token::at(token_contract_address).shield(owner, shield_amount, secret_hash, 0);
    authwit_cheatcodes::add_public_authwit_from_call_interface(
        owner,
        recipient,
        shield_call_interface,
    );
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Shield tokens
    env.assert_public_call_fails(shield_call_interface);

    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount);
    utils::check_private_balance(token_contract_address, owner, 0);
}

#[test]
unconstrained fn shielding_failure_on_behalf_of_other_wrong_caller() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_public(/* with_account_contracts */ true);
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    // Shield tokens on behalf of owner
    let shield_amount = mint_amount + 1;
    let shield_call_interface =
        Token::at(token_contract_address).shield(owner, shield_amount, secret_hash, 0);
    authwit_cheatcodes::add_public_authwit_from_call_interface(owner, owner, shield_call_interface);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Shield tokens
    env.assert_public_call_fails(shield_call_interface);

    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount);
    utils::check_private_balance(token_contract_address, owner, 0);
}

#[test]
unconstrained fn shielding_failure_on_behalf_of_other_without_approval() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_public(/* with_account_contracts */ true);
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    // Shield tokens on behalf of owner
    let shield_amount = mint_amount + 1;
    let shield_call_interface =
        Token::at(token_contract_address).shield(owner, shield_amount, secret_hash, 0);
    // Impersonate recipient to perform the call
    env.impersonate(recipient);
    // Shield tokens
    env.assert_public_call_fails(shield_call_interface);

    // Check balances
    utils::check_public_balance(token_contract_address, owner, mint_amount);
    utils::check_private_balance(token_contract_address, owner, 0);
}
