use crate::{
    discovery::{
        ComputeNoteHashAndNullifier,
        MAX_NOTE_PACKED_LEN,
        nonce_discovery::{attempt_note_nonce_discovery, DiscoveredNoteInfo},
    },
    oracle,
    utils::array,
};
use protocol_types::{
    address::AztecAddress, constants::MAX_NOTE_HASHES_PER_TX, debug_log::debug_log_format,
};

pub unconstrained fn process_private_note_log<Env>(
    contract_address: AztecAddress,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
    storage_slot: Field,
    note_type_id: Field,
    packed_note_content: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
) {
    // Currently a placeholder, since we want to both have a 'process log kind' fn and keep 'attempt_note_discovery'.
    // This is where we'll soon extract note type id, storage slot and packed note content from the log metadata and log
    // content.

    attempt_note_discovery(
        contract_address,
        tx_hash,
        unique_note_hashes_in_tx,
        first_nullifier_in_tx,
        recipient,
        compute_note_hash_and_nullifier,
        storage_slot,
        note_type_id,
        packed_note_content,
    );
}

/// Attempts discovery of a note given information about its contents and the transaction in which it is
/// suspected the note was created.
pub unconstrained fn attempt_note_discovery<Env>(
    contract_address: AztecAddress,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
    storage_slot: Field,
    note_type_id: Field,
    packed_note_content: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
) {
    let discovered_notes = attempt_note_nonce_discovery(
        unique_note_hashes_in_tx,
        first_nullifier_in_tx,
        compute_note_hash_and_nullifier,
        contract_address,
        storage_slot,
        note_type_id,
        packed_note_content,
    );

    debug_log_format(
        "Discovered {0} notes from a private log",
        [discovered_notes.len() as Field],
    );

    array::for_each_in_bounded_vec(
        discovered_notes,
        |discovered_note: DiscoveredNoteInfo, _| {
            // TODO:(#10728): handle notes that fail delivery. This could be due to e.g. a temporary node connectivity
            // issue, and we should perhaps not have marked the tag index as taken.
            assert(
                oracle::message_discovery::deliver_note(
                    contract_address,
                    storage_slot,
                    discovered_note.nonce,
                    packed_note_content,
                    discovered_note.note_hash,
                    discovered_note.inner_nullifier,
                    tx_hash,
                    recipient,
                ),
                "Failed to deliver note",
            );
        },
    );
}
