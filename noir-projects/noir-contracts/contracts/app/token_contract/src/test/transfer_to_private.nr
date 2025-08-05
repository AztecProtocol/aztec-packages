use crate::{test::utils, Token};
use dep::aztec::{oracle::random::random, protocol_types::traits::Deserialize};
use dep::uint_note::uint_note::PartialUintNote;

/// Internal orchestration means that the calls to `prepare_private_balance_increase`
/// and `finalize_transfer_to_private` are done by the TOKEN contract itself.
/// In this test's case this is done by the `Token::transfer_to_private(...)` function called
/// in `utils::setup_mint_and_transfer_to_private`.
#[test]
unconstrained fn transfer_to_private_internal_orchestration() {
    // The transfer to private is done in `utils::setup_and_mint_to_private` and for this reason
    // in this test we just call it and check the outcome.
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, user, _, amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    // User's private balance should be equal to the amount
    utils::check_private_balance(env, token_contract_address, user, amount);
}

/// External orchestration means that the calls to prepare and finalize are not done by the Token contract. This flow
/// will typically be used by a DEX.
#[test]
unconstrained fn transfer_to_private_external_orchestration() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // We prepare the transfer
    let partial_uint_note = env.call_private(
        owner,
        Token::at(token_contract_address).prepare_private_balance_increase(recipient),
    );

    // Finalize the transfer of the tokens (message sender owns the tokens in public)
    env.call_public(
        owner,
        Token::at(token_contract_address).finalize_transfer_to_private(amount, partial_uint_note),
    );

    // Recipient's private balance should be equal to the amount
    utils::check_private_balance(env, token_contract_address, recipient, amount);
}

/// External orchestration means that the calls to prepare and finalize are not done by the Token contract. This flow
/// will typically be used by a DEX.
#[test]
unconstrained fn transfer_to_private_from_private_external_orchestration() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    // We prepare the transfer
    let partial_uint_note = env.call_private(
        owner,
        Token::at(token_contract_address).prepare_private_balance_increase(recipient),
    );
    // Finalize the transfer of the tokens (message sender owns the tokens in public)
    env.call_private(
        owner,
        Token::at(token_contract_address).finalize_transfer_to_private_from_private(
            owner,
            partial_uint_note,
            amount,
            0,
        ),
    );

    // Recipient's private balance should be equal to the amount
    utils::check_private_balance(env, token_contract_address, recipient, amount);
    utils::check_private_balance(env, token_contract_address, owner, 0);
}

#[test(should_fail_with = "Invalid partial note or completer")]
unconstrained fn transfer_to_private_transfer_not_prepared() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // Transfer was not prepared so we can use random value for the partial note
    // The following is a misuse of the `deserialize` function, but this is just a test and it's better than
    // letting devs manually construct it when they shouldn't be able to.
    let commitment = random();
    let partial_uint_note = PartialUintNote::deserialize([commitment]);

    // Try finalizing the transfer without preparing it
    env.call_public(
        owner,
        Token::at(token_contract_address).finalize_transfer_to_private(amount, partial_uint_note),
    );
}

#[test(should_fail_with = "Assertion failed: attempt to subtract with overflow")]
unconstrained fn transfer_to_private_failure_not_an_owner() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, not_owner, amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // (For this specific test we could set a random value for the commitment and not do the call to `prepare...`
    // as the token balance check is before we use the value but that would made the test less robust against changes
    // in the contract.)
    let partial_uint_note = env.call_private(
        owner,
        Token::at(token_contract_address).prepare_private_balance_increase(not_owner),
    );

    // Try transferring someone else's token balance
    env.call_public(
        not_owner,
        Token::at(token_contract_address).finalize_transfer_to_private(amount, partial_uint_note),
    );
}

#[test(should_fail_with = "Invalid partial note or completer")]
unconstrained fn incorrect_completer_cannot_complete_partial_note() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough.
    let (mut env, token_contract_address, owner, recipient, amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // We set up the completer
    let completer = env.create_light_account();

    // We prepare the partial note as a completer
    let partial_uint_note = env.call_private(
        completer,
        Token::at(token_contract_address).prepare_private_balance_increase(recipient),
    );

    // Now we try to complete the partial note as another completer. Note that the caller here owns the tokens - this is
    // so that we pass the balance check and fail on the partial note completer check.
    env.call_public(
        owner,
        Token::at(token_contract_address).finalize_transfer_to_private(amount, partial_uint_note),
    );
}
