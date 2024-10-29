use crate::{test::utils, Token};
use dep::aztec::{
    keys::getters::get_public_keys, oracle::random::random, prelude::NoteHeader,
    protocol_types::storage::map::derive_storage_slot_in_map,
};
use dep::uint_note::uint_note::UintNote;
use std::test::OracleMock;

/// Internal orchestration means that the calls to `prepare_transfer_to_private`
/// and `finalize_transfer_to_private` are done by the TOKEN contract itself.
/// In this test's case this is done by the `Token::transfer_to_private(...)` function called
/// in `utils::setup_mint_and_transfer_to_private`.
#[test]
unconstrained fn transfer_to_private_internal_orchestration() {
    // The transfer to private is done in `utils::setup_and_mint_private` and for this reason
    // in this test we just call it and check the outcome.
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, user, _, amount) =
        utils::setup_and_mint_private(/* with_account_contracts */ false);

    // User's private balance should be equal to the amount
    utils::check_private_balance(token_contract_address, user, amount);
}

/// External orchestration means that the calls to prepare and finalize are not done by the NFT contract. This flow
/// will typically be used by a DEX.
#[test]
unconstrained fn transfer_to_private_external_orchestration() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, _, recipient, amount) =
        utils::setup_and_mint_public(/* with_account_contracts */ false);

    let note_randomness = random();

    // We mock the Oracle to return the note randomness such that later on we can manually add the note
    let _ = OracleMock::mock("getRandomField").returns(note_randomness);

    // We prepare the transfer
    let hiding_point_slot: Field = Token::at(token_contract_address)
        .prepare_transfer_to_private(recipient)
        .call(&mut env.private());

    // Finalize the transfer of the tokens (message sender owns the tokens in public)
    Token::at(token_contract_address).finalize_transfer_to_private(amount, hiding_point_slot).call(
        &mut env.public(),
    );

    // TODO(#8771): We need to manually add the note because in the partial notes flow `notify_created_note_oracle`
    // is not called and we don't have a `NoteProcessor` in TXE.
    let balances_owner_slot =
        derive_storage_slot_in_map(Token::storage_layout().balances.slot, recipient);

    env.add_note(
        &mut UintNote {
            value: U128::from_integer(amount),
            owner: recipient,
            randomness: note_randomness,
            header: NoteHeader::empty(),
        },
        balances_owner_slot,
        token_contract_address,
    );

    // Recipient's private balance should be equal to the amount
    utils::check_private_balance(token_contract_address, recipient, amount);
}

#[test(should_fail_with = "transfer not prepared")]
unconstrained fn transfer_to_private_transfer_not_prepared() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, _, _, amount) =
        utils::setup_and_mint_public(/* with_account_contracts */ false);

    // Transfer was not prepared so we can use random value for the hiding point slot
    let hiding_point_slot = random();

    // Try finalizing the transfer without preparing it
    Token::at(token_contract_address).finalize_transfer_to_private(amount, hiding_point_slot).call(
        &mut env.public(),
    );
}

#[test(should_fail_with = "invalid NFT owner")]
unconstrained fn transfer_to_private_failure_not_an_owner() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, _, not_owner, amount) =
        utils::setup_and_mint_public(/* with_account_contracts */ false);

    // (For this specific test we could set a random value for the commitment and not do the call to `prepare...`
    // as the NFT owner check is before we use the value but that would made the test less robust against changes
    // in the contract.)
    let hiding_point_slot: Field = Token::at(token_contract_address)
        .prepare_transfer_to_private(not_owner)
        .call(&mut env.private());

    // Try transferring someone else's public NFT
    env.impersonate(not_owner);
    Token::at(token_contract_address).finalize_transfer_to_private(amount, hiding_point_slot).call(
        &mut env.public(),
    );
}
