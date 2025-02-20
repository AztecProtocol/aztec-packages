use crate::{discovery::{MAX_NOTE_PACKED_LEN, NoteHashAndNullifier}, utils::array};

use dep::protocol_types::{
    address::AztecAddress,
    constants::MAX_NOTE_HASHES_PER_TX,
    debug_log::debug_log_format,
    hash::{compute_note_hash_nonce, compute_siloed_note_hash, compute_unique_note_hash},
    traits::ToField,
};

/// A struct with the discovered information of a complete note, required for delivery to PXE. Note that this is *not*
/// the complete note information, since it does not include content, storage slot, etc.
pub struct DiscoveredNoteInfo {
    pub nonce: Field,
    pub note_hash: Field,
    pub inner_nullifier: Field,
}

/// Searches for note nonces that will result in a note that was emitted in a transaction. While rare, it is possible
/// for multiple notes to have the exact same packed content and storage slot but different nonces, resulting in
/// different unique note hashes. Because of this this function returns a *vector* of discovered notes, though in most
/// cases it will contain a single element.
///
/// Due to how nonces are computed, this function requires knowledge of the transaction in which the note was created,
/// more specifically the list of all unique note hashes in it plus the value of its first nullifier.
pub unconstrained fn attempt_note_nonce_discovery<Env>(
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_PACKED_LEN>, AztecAddress, Field, Field, Field) -> Option<NoteHashAndNullifier>,
    contract_address: AztecAddress,
    storage_slot: Field,
    note_type_id: Field,
    packed_note_content: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
) -> BoundedVec<DiscoveredNoteInfo, MAX_NOTE_HASHES_PER_TX> {
    let discovered_notes = &mut BoundedVec::new();

    debug_log_format(
        "Attempting note discovery on {0} potential notes on contract {1} for storage slot {2}",
        [unique_note_hashes_in_tx.len() as Field, contract_address.to_field(), storage_slot],
    );

    // We need to find nonces (typically just one) that result in a note hash that, once siloed into a unique note hash,
    // is one of the note hashes created by the transaction.
    array::for_each_in_bounded_vec(
        unique_note_hashes_in_tx,
        |expected_unique_note_hash, i| {
            // Nonces are computed by hashing the first nullifier in the transaction with the index of the note in the
            // new note hashes array. We therefore know for each note in every transaction what its nonce is.
            let candidate_nonce = compute_note_hash_nonce(first_nullifier_in_tx, i);

            // Given nonce, note content and metadata, we can compute the note hash and silo it to check if it matches
            // the note hash at the array index we're currently processing.
            // TODO(#11157): handle failed note_hash_and_nullifier computation
            let hashes = compute_note_hash_and_nullifier(
                packed_note_content,
                contract_address,
                candidate_nonce,
                storage_slot,
                note_type_id,
            )
                .expect(f"Failed to compute a note hash for note type {note_type_id}");

            let siloed_note_hash = compute_siloed_note_hash(contract_address, hashes.note_hash);
            let unique_note_hash = compute_unique_note_hash(candidate_nonce, siloed_note_hash);

            if unique_note_hash == expected_unique_note_hash {
                // Note that while we did check that the note hash is the preimage of the expected unique note hash, we
                // perform no validations on the nullifier - we fundamentally cannot, since only the application knows
                // how to compute nullifiers. We simply trust it to have provided the correct one: if it hasn't, then
                // PXE may fail to realize that a given note has been nullified already, and calls to the application
                // could result in invalid transactions (with duplicate nullifiers). This is not a concern because an
                // application already has more direct means of making a call to it fail the transaction.
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
