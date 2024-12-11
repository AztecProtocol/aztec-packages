use crate::{test::utils, Token};
use dep::aztec::oracle::random::random;
use std::test::OracleMock;

/// Internal orchestration means that the calls to `prepare_private_balance_increase`
/// and `finalize_transfer_to_private` are done by the TOKEN contract itself.
/// In this test's case this is done by the `Token::transfer_to_private(...)` function called
/// in `utils::setup_mint_and_transfer_to_private`.
#[test]
unconstrained fn transfer_to_private_internal_orchestration() {
    // The transfer to private is done in `utils::setup_and_mint_to_private` and for this reason
    // in this test we just call it and check the outcome.
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (_, token_contract_address, user, _, amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    // User's private balance should be equal to the amount
    utils::check_private_balance(token_contract_address, user, amount);
}

/// External orchestration means that the calls to prepare and finalize are not done by the Token contract. This flow
/// will typically be used by a DEX.
#[test]
unconstrained fn transfer_to_private_external_orchestration() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    let note_randomness = random();

    // We mock the Oracle to return the note randomness such that later on we can manually add the note
    let _ = OracleMock::mock("getRandomField").returns(note_randomness);

    // We prepare the transfer
    let hiding_point_slot: Field = Token::at(token_contract_address)
        .prepare_private_balance_increase(recipient, owner)
        .call(&mut env.private());

    // Finalize the transfer of the tokens (message sender owns the tokens in public)
    Token::at(token_contract_address).finalize_transfer_to_private(amount, hiding_point_slot).call(
        &mut env.public(),
    );

    // We need to manually add the note because #8771 has not yet been implemented
    utils::add_token_note(
        env,
        token_contract_address,
        recipient,
        amount,
        note_randomness,
    );

    // Recipient's private balance should be equal to the amount
    utils::check_private_balance(token_contract_address, recipient, amount);
}

#[test(should_fail_with = "transfer not prepared")]
unconstrained fn transfer_to_private_transfer_not_prepared() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, _, _, amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // Transfer was not prepared so we can use random value for the hiding point slot
    let hiding_point_slot = random();

    // Try finalizing the transfer without preparing it
    Token::at(token_contract_address).finalize_transfer_to_private(amount, hiding_point_slot).call(
        &mut env.public(),
    );
}

#[test(should_fail_with = "Assertion failed: attempt to subtract with underflow 'hi == high'")]
unconstrained fn transfer_to_private_failure_not_an_owner() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, not_owner, amount) =
        utils::setup_and_mint_to_public(/* with_account_contracts */ false);

    // (For this specific test we could set a random value for the commitment and not do the call to `prepare...`
    // as the token balance check is before we use the value but that would made the test less robust against changes
    // in the contract.)
    let hiding_point_slot: Field = Token::at(token_contract_address)
        .prepare_private_balance_increase(not_owner, owner)
        .call(&mut env.private());

    // Try transferring someone else's token balance
    env.impersonate(not_owner);
    Token::at(token_contract_address).finalize_transfer_to_private(amount, hiding_point_slot).call(
        &mut env.public(),
    );
}
