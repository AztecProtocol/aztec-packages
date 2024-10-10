use crate::{test::utils, types::nft_note::NFTNote, NFT};
use dep::aztec::{
    keys::getters::get_public_keys, prelude::{AztecAddress, NoteHeader}, oracle::random::random,
    protocol_types::storage::map::derive_storage_slot_in_map
};
use std::test::OracleMock;

#[test]
unconstrained fn transfer_to_private_to_self() {
    // The transfer to private to self is done in `utils::setup_mint_and_transfer_to_private` and for this reason
    // in this test we just call it and check the outcome.

    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, user, _, token_id) = utils::setup_mint_and_transfer_to_private(/* with_account_contracts */ false);

    // User should have the note in their private nfts
    utils::assert_owns_private_nft(nft_contract_address, user, token_id);

    // Since the NFT was sent to private, the public owner should be zero address
    utils::assert_owns_public_nft(env, nft_contract_address, AztecAddress::zero(), token_id);
}

#[test]
unconstrained fn transfer_to_private_to_a_different_account() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, sender, recipient, token_id) = utils::setup_and_mint(/* with_account_contracts */ false);

    let note_randomness = random();

    // We mock the Oracle to return the note randomness such that later on we can manually add the note
    let _ = OracleMock::mock("getRandomField").returns(note_randomness);

    // We prepare the transfer
    let hiding_point_slot: Field = env.call_private(NFT::at(nft_contract_address).prepare_transfer_to_private(sender, recipient));

    // Finalize the transfer of the NFT
    env.call_public(NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, hiding_point_slot));

    // TODO(#8771): We need to manually add the note because in the partial notes flow `notify_created_note_oracle`
    // is not called and we don't have a `NoteProcessor` in TXE.
    let recipient_npk_m_hash = get_public_keys(recipient).npk_m.hash();
    let private_nfts_recipient_slot = derive_storage_slot_in_map(NFT::storage_layout().private_nfts.slot, recipient);

    env.add_note(
        &mut NFTNote { token_id, npk_m_hash: recipient_npk_m_hash, randomness: note_randomness, header: NoteHeader::empty() },
        private_nfts_recipient_slot,
        nft_contract_address
    );

    // Recipient should have the note in their private nfts
    utils::assert_owns_private_nft(nft_contract_address, recipient, token_id);

    // Since the NFT got transferred to private public owner should be zero address
    utils::assert_owns_public_nft(env, nft_contract_address, AztecAddress::zero(), token_id);
}

#[test(should_fail_with = "transfer not prepared")]
unconstrained fn transfer_to_private_to_self_transfer_not_prepared() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, _, _, token_id) = utils::setup_and_mint(/* with_account_contracts */ false);

    // Transfer was not prepared so we can use random value for the hiding point slot
    let hiding_point_slot = random();

    // Try finalizing the transfer without preparing it
    env.call_public(NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, hiding_point_slot));
}

#[test(should_fail_with = "invalid NFT owner")]
unconstrained fn transfer_to_private_failure_not_an_owner() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, _, not_owner, token_id) = utils::setup_and_mint(/* with_account_contracts */ false);

    // We set random value for the commitment as the NFT owner check is before we use the value
    let hiding_point_slot = random();

    // Try transferring someone else's public NFT
    env.impersonate(not_owner);
    env.call_public(NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, hiding_point_slot));
}
