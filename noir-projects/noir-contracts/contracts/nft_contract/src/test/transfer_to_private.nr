use crate::{NFT, test::utils, types::nft_note::NFTNote};
use dep::aztec::{
    oracle::random::random,
    prelude::{AztecAddress, NoteHeader},
    protocol_types::storage::map::derive_storage_slot_in_map,
};
use std::test::OracleMock;

/// Internal orchestration means that the calls to `prepare_private_balance_increase`
/// and `finalize_transfer_to_private` are done by the NFT contract itself.
/// In this test's case this is done by the `NFT::transfer_to_private(...)` function called
/// in `utils::setup_mint_and_transfer_to_private`.
#[test]
unconstrained fn transfer_to_private_internal_orchestration() {
    // The transfer to private is done in `utils::setup_mint_and_transfer_to_private` and for this reason
    // in this test we just call it and check the outcome.
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, user, _, token_id) =
        utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ false);

    // User should have the note in their private nfts
    utils::assert_owns_private_nft(nft_contract_address, user, token_id);

    // Since the NFT was sent to private, the public owner should be zero address
    utils::assert_owns_public_nft(env, nft_contract_address, AztecAddress::zero(), token_id);
}

/// External orchestration means that the calls to prepare and finalize are not done by the NFT contract. This flow
/// will typically be used by a DEX.
#[test]
unconstrained fn transfer_to_private_external_orchestration() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, _, recipient, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ false);

    let note_randomness = random();

    // We mock the Oracle to return the note randomness such that later on we can manually add the note
    let _ = OracleMock::mock("getRandomField").returns(note_randomness);

    // We prepare the transfer
    let hiding_point_slot: Field = NFT::at(nft_contract_address)
        .prepare_private_balance_increase(recipient)
        .call(&mut env.private());

    // Finalize the transfer of the NFT (message sender owns the NFT in public)
    NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, hiding_point_slot).call(
        &mut env.public(),
    );

    // TODO(#8771): We need to manually add the note because in the partial notes flow `notify_created_note_oracle`
    // is not called and we don't have a `NoteProcessor` in TXE.
    let private_nfts_recipient_slot =
        derive_storage_slot_in_map(NFT::storage_layout().private_nfts.slot, recipient);

    env.add_note(
        &mut NFTNote {
            token_id,
            owner: recipient,
            randomness: note_randomness,
            header: NoteHeader::empty(),
        },
        private_nfts_recipient_slot,
        nft_contract_address,
    );

    // Recipient should have the note in their private nfts
    utils::assert_owns_private_nft(nft_contract_address, recipient, token_id);

    // Since the NFT got transferred to private public owner should be zero address
    utils::assert_owns_public_nft(env, nft_contract_address, AztecAddress::zero(), token_id);
}

#[test(should_fail_with = "transfer not prepared")]
unconstrained fn transfer_to_private_transfer_not_prepared() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, _, _, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ false);

    // Transfer was not prepared so we can use random value for the hiding point slot
    let hiding_point_slot = random();

    // Try finalizing the transfer without preparing it
    NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, hiding_point_slot).call(
        &mut env.public(),
    );
}

#[test(should_fail_with = "invalid NFT owner")]
unconstrained fn transfer_to_private_failure_not_an_owner() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, _, not_owner, token_id) =
        utils::setup_and_mint(/* with_account_contracts */ false);

    // (For this specific test we could set a random value for the commitment and not do the call to `prepare...`
    // as the NFT owner check is before we use the value but that would made the test less robust against changes
    // in the contract.)
    let hiding_point_slot: Field = NFT::at(nft_contract_address)
        .prepare_private_balance_increase(not_owner)
        .call(&mut env.private());

    // Try transferring someone else's public NFT
    env.impersonate(not_owner);
    NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, hiding_point_slot).call(
        &mut env.public(),
    );
}
