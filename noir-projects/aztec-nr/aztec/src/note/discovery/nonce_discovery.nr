use crate::{note::discovery::{MAX_NOTE_SERIALIZED_LEN, NoteHashAndNullifier}, utils::array};

use dep::protocol_types::{
    address::AztecAddress,
    constants::MAX_NOTE_HASHES_PER_TX,
    debug_log::debug_log_format,
    hash::{compute_note_hash_nonce, compute_siloed_note_hash, compute_unique_note_hash},
    traits::ToField,
};

pub struct DiscoveredNoteInfo {
    pub nonce: Field,
    pub note_hash: Field,
    pub inner_nullifier: Field,
}

pub unconstrained fn attempt_note_nonce_discovery<Env>(
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, AztecAddress, Field, Field, Field) -> Option<NoteHashAndNullifier>,
    contract_address: AztecAddress,
    storage_slot: Field,
    note_type_id: Field,
    serialized_note_content: BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>,
) -> BoundedVec<DiscoveredNoteInfo, MAX_NOTE_HASHES_PER_TX> {
    let discovered_notes = &mut BoundedVec::new();

    debug_log_format(
        "Attempting note discovery on {0} potential notes on contract {1} for storage slot {2}",
        [unique_note_hashes_in_tx.len() as Field, contract_address.to_field(), storage_slot],
    );

    // We need to find the note's nonce, which is the one that results in one of the unique note hashes from tx_hash
    array::for_each_in_bounded_vec(
        unique_note_hashes_in_tx,
        |expected_unique_note_hash, i| {
            let candidate_nonce = compute_note_hash_nonce(first_nullifier_in_tx, i);

            // TODO(#11157): handle failed note_hash_and_nullifier computation
            let hashes = compute_note_hash_and_nullifier(
                serialized_note_content,
                contract_address,
                candidate_nonce,
                storage_slot,
                note_type_id,
            )
                .unwrap();

            let siloed_note_hash = compute_siloed_note_hash(contract_address, hashes.note_hash);
            let unique_note_hash = compute_unique_note_hash(candidate_nonce, siloed_note_hash);

            if unique_note_hash == expected_unique_note_hash {
                // Note that we perform no validations on the nullifier - we fundamentally cannot, since only the
                // application knows how to compute nullifiers, and we simply trust it to have provided the correct one.
                // If it hasn't, then PXE may fail to realize that a given note has been nullified already and end up
                // producing invalid transactions (with duplicate nullifiers).
                discovered_notes.push(
                    DiscoveredNoteInfo {
                        nonce: candidate_nonce,
                        note_hash: hashes.note_hash,
                        inner_nullifier: hashes.inner_nullifier,
                    },
                );

                // We don't exit the loop - it is possible (though rare) for the exact same note content to be present
                // multiple times in the same transaction with different nonces. This typically doesn't happen due to
                // notes containing random values in order to hide their contents.
            }
        },
    );

    debug_log_format(
        "Discovered a total of {0} notes",
        [discovered_notes.len() as Field],
    );

    *discovered_notes
}
