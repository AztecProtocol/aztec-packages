use crate::test::utils;
use dep::aztec::{
    hash::pedersen_hash, keys::getters::get_public_keys, prelude::{AztecAddress, NoteHeader},
    oracle::unsafe_rand::unsafe_rand, protocol_types::storage::map::derive_storage_slot_in_map
};
use crate::{types::nft_note::NFTNote, NFT};

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

    let note_randomness = unsafe_rand();
    let transient_storage_slot_randomness = unsafe_rand();
    // Sender will be the msg_sender/transfer_preparer in prepare_transfer_to_private
    let transfer_preparer_storage_slot_commitment = pedersen_hash(
        [sender.to_field(), transient_storage_slot_randomness],
        NFT::TRANSIENT_STORAGE_SLOT_PEDERSEN_INDEX
    );

    // We prepare the transfer
    env.call_private_void(
        NFT::at(nft_contract_address).prepare_transfer_to_private(
            sender,
            recipient,
            note_randomness,
            transient_storage_slot_randomness
        )
    );

    // Finalize the transfer of the NFT
    env.call_public(
        NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, transfer_preparer_storage_slot_commitment)
    );

    // Store the finalized note in the cache
    let mut context = env.private();
    let recipient_npk_m_hash = get_public_keys(recipient).npk_m.hash();
    let private_nfts_recipient_slot = derive_storage_slot_in_map(NFT::storage().private_nfts.slot, recipient);

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

#[test(should_fail_with="transfer not prepared")]
unconstrained fn transfer_to_private_to_self_transfer_not_prepared() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, _, _, token_id) = utils::setup_and_mint(/* with_account_contracts */ false);

    // Transfer was not prepared so we can use random value for the commitment
    let transfer_preparer_storage_slot_commitment = unsafe_rand();

    // Try finalizing the transfer without preparing it
    env.call_public(
        NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, transfer_preparer_storage_slot_commitment)
    );
}

#[test(should_fail_with="transfer not prepared")]
unconstrained fn transfer_to_private_finalizing_from_incorrect_sender() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, incorrect_sender, recipient, token_id) = utils::setup_and_mint(/* with_account_contracts */ false);

    let correct_sender = AztecAddress::from_field(9);

    let note_randomness = unsafe_rand();
    let transient_storage_slot_randomness = unsafe_rand();
    // Sender will be the msg_sender/transfer_preparer in prepare_transfer_to_private
    let transfer_preparer_storage_slot_commitment = pedersen_hash(
        [correct_sender.to_field(), transient_storage_slot_randomness],
        NFT::TRANSIENT_STORAGE_SLOT_PEDERSEN_INDEX
    );

    // We prepare the transfer
    env.call_private_void(
        NFT::at(nft_contract_address).prepare_transfer_to_private(
            correct_sender,
            recipient,
            note_randomness,
            transient_storage_slot_randomness
        )
    );

    // We impersonate incorrect sender and try to finalize the transfer of the NFT. The incorrect sender owns the NFT
    // but tries to consume a prepared transfer not belonging to him. For this reason the test should fail with
    // "transfer not prepared".
    env.impersonate(incorrect_sender);
    env.call_public(
        NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, transfer_preparer_storage_slot_commitment)
    );
}

#[test(should_fail_with="invalid NFT owner")]
unconstrained fn transfer_to_private_failure_not_an_owner() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, nft_contract_address, _, not_owner, token_id) = utils::setup_and_mint(/* with_account_contracts */ false);

    // We set random value for the commitment as the NFT owner check is before we use the value
    let transfer_preparer_storage_slot_commitment = unsafe_rand();

    // Try transferring someone else's public NFT
    env.impersonate(not_owner);
    env.call_public(
        NFT::at(nft_contract_address).finalize_transfer_to_private(token_id, transfer_preparer_storage_slot_commitment)
    );
}
