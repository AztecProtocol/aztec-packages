use crate::test::utils;
use crate::{Token, types::transparent_note::TransparentNote};
use dep::aztec::{hash::compute_secret_hash, oracle::random::random, test::helpers::cheatcodes};

#[test]
unconstrained fn mint_public_success() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _) = utils::setup(/* with_account_contracts */ false);

    let mint_amount = 10000;
    Token::at(token_contract_address).mint_public(owner, mint_amount).call(&mut env.public());

    utils::check_public_balance(token_contract_address, owner, mint_amount);

    let total_supply = Token::at(token_contract_address).total_supply().view(&mut env.public());
    assert(total_supply == mint_amount);
}

#[test]
unconstrained fn mint_public_failures() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient) =
        utils::setup(/* with_account_contracts */ false);

    // As non-minter
    let mint_amount = 10000;
    env.impersonate(recipient);
    let mint_public_call_interface =
        Token::at(token_contract_address).mint_public(owner, mint_amount);
    env.assert_public_call_fails(mint_public_call_interface);

    utils::check_public_balance(token_contract_address, owner, 0);

    env.impersonate(owner);

    // Overflow recipient
    let mint_amount = 2.pow_32(128);
    let mint_public_call_interface =
        Token::at(token_contract_address).mint_public(owner, mint_amount);
    env.assert_public_call_fails(mint_public_call_interface);

    utils::check_public_balance(token_contract_address, owner, 0);

    // Overflow total supply
    let mint_for_recipient_amount = 1000;

    Token::at(token_contract_address).mint_public(recipient, mint_for_recipient_amount).call(
        &mut env.public(),
    );

    let mint_amount = 2.pow_32(128) - mint_for_recipient_amount;
    let mint_public_call_interface =
        Token::at(token_contract_address).mint_public(owner, mint_amount);
    env.assert_public_call_fails(mint_public_call_interface);

    utils::check_public_balance(token_contract_address, recipient, mint_for_recipient_amount);
    utils::check_public_balance(token_contract_address, owner, 0);
}

#[test]
unconstrained fn mint_private_success() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _) = utils::setup(/* with_account_contracts */ false);
    let mint_amount = 10000;
    // Mint some tokens
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    Token::at(token_contract_address).mint_private(mint_amount, secret_hash).call(&mut env.public());

    Token::at(token_contract_address).mint_public(owner, mint_amount).call(&mut env.public());

    // Time travel so we can read keys from the registry
    env.advance_block_by(6);

    // We need to manually add the note to TXE because `TransparentNote` does not support automatic note log delivery.
    env.add_note(
        &mut TransparentNote::new(mint_amount, secret_hash),
        Token::storage_layout().pending_shields.slot,
        token_contract_address,
    );

    // Redeem our shielded tokens
    Token::at(token_contract_address).redeem_shield(owner, mint_amount, secret).call(
        &mut env.private(),
    );

    utils::check_private_balance(token_contract_address, owner, mint_amount);
}

#[test(should_fail_with = "note not popped")]
unconstrained fn mint_private_failure_double_spend() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient) =
        utils::setup(/* with_account_contracts */ false);
    let mint_amount = 10000;
    // Mint some tokens
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    Token::at(token_contract_address).mint_private(mint_amount, secret_hash).call(&mut env.public());

    Token::at(token_contract_address).mint_public(owner, mint_amount).call(&mut env.public());

    // Time travel so we can read keys from the registry
    env.advance_block_by(6);

    // We need to manually add the note to TXE because `TransparentNote` does not support automatic note log delivery.
    env.add_note(
        &mut TransparentNote::new(mint_amount, secret_hash),
        Token::storage_layout().pending_shields.slot,
        token_contract_address,
    );

    // Redeem our shielded tokens
    Token::at(token_contract_address).redeem_shield(owner, mint_amount, secret).call(
        &mut env.private(),
    );

    utils::check_private_balance(token_contract_address, owner, mint_amount);

    // Attempt to double spend
    Token::at(token_contract_address).redeem_shield(recipient, mint_amount, secret).call(
        &mut env.private(),
    );
}

#[test(should_fail_with = "caller is not minter")]
unconstrained fn mint_private_failure_non_minter() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, _, recipient) =
        utils::setup(/* with_account_contracts */ false);
    let mint_amount = 10000;
    // Try to mint some tokens impersonating recipient
    env.impersonate(recipient);

    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    Token::at(token_contract_address).mint_private(mint_amount, secret_hash).call(&mut env.public());
}

#[test(should_fail_with = "call to assert_max_bit_size")]
unconstrained fn mint_private_failure_overflow() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, _, _) = utils::setup(/* with_account_contracts */ false);

    // Overflow recipient
    let mint_amount = 2.pow_32(128);
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    Token::at(token_contract_address).mint_private(mint_amount, secret_hash).call(&mut env.public());
}

#[test(should_fail_with = "attempt to add with overflow")]
unconstrained fn mint_private_failure_overflow_recipient() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _) = utils::setup(/* with_account_contracts */ false);
    let mint_amount = 10000;
    // Mint some tokens
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    Token::at(token_contract_address).mint_private(mint_amount, secret_hash).call(&mut env.public());
    // Time travel so we can read keys from the registry
    env.advance_block_by(6);

    // We need to manually add the note to TXE because `TransparentNote` does not support automatic note log delivery.
    env.add_note(
        &mut TransparentNote::new(mint_amount, secret_hash),
        Token::storage_layout().pending_shields.slot,
        token_contract_address,
    );

    // Redeem our shielded tokens
    Token::at(token_contract_address).redeem_shield(owner, mint_amount, secret).call(
        &mut env.private(),
    );

    utils::check_private_balance(token_contract_address, owner, mint_amount);

    let mint_amount = 2.pow_32(128) - mint_amount;
    // Mint some tokens
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    Token::at(token_contract_address).mint_private(mint_amount, secret_hash).call(&mut env.public());
}

#[test(should_fail_with = "attempt to add with overflow")]
unconstrained fn mint_private_failure_overflow_total_supply() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient) =
        utils::setup(/* with_account_contracts */ false);
    let mint_amount = 10000;
    // Mint some tokens
    let secret_owner = random();
    let secret_recipient = random();
    let secret_hash_owner = compute_secret_hash(secret_owner);
    let secret_hash_recipient = compute_secret_hash(secret_recipient);

    Token::at(token_contract_address).mint_private(mint_amount, secret_hash_owner).call(
        &mut env.public(),
    );
    Token::at(token_contract_address).mint_private(mint_amount, secret_hash_recipient).call(
        &mut env.public(),
    );

    // Time travel so we can read keys from the registry
    env.advance_block_by(6);

    // Store 2 notes in the cache so we can redeem it for owner and recipient
    env.add_note(
        &mut TransparentNote::new(mint_amount, secret_hash_owner),
        Token::storage_layout().pending_shields.slot,
        token_contract_address,
    );
    env.add_note(
        &mut TransparentNote::new(mint_amount, secret_hash_recipient),
        Token::storage_layout().pending_shields.slot,
        token_contract_address,
    );

    // Redeem owner's shielded tokens
    env.impersonate(owner);
    Token::at(token_contract_address).redeem_shield(owner, mint_amount, secret_owner).call(
        &mut env.private(),
    );

    // Redeem recipient's shielded tokens
    env.impersonate(recipient);
    Token::at(token_contract_address).redeem_shield(recipient, mint_amount, secret_recipient).call(
        &mut env.private(),
    );

    utils::check_private_balance(token_contract_address, owner, mint_amount);
    utils::check_private_balance(token_contract_address, recipient, mint_amount);

    env.impersonate(owner);
    let mint_amount = 2.pow_32(128) - 2 * mint_amount;
    // Try to mint some tokens
    let secret = random();
    let secret_hash = compute_secret_hash(secret);
    Token::at(token_contract_address).mint_private(mint_amount, secret_hash).call(&mut env.public());
}
