use crate::messages::{
    discovery::{ComputeNoteHashAndNullifier, nonce_discovery::attempt_note_nonce_discovery},
    encoding::MAX_MESSAGE_CONTENT_LEN,
    logs::note::{decode_private_note_message, MAX_NOTE_PACKED_LEN},
    processing::{enqueue_foreign_note_for_validation, enqueue_note_for_validation},
};
use crate::protocol::{address::AztecAddress, constants::MAX_NOTE_HASHES_PER_TX, debug_log::debug_log_format};

pub unconstrained fn process_private_note_msg<Env>(
    contract_address: AztecAddress,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
) {
    let (note_type_id, owner, storage_slot, randomness, packed_note) =
        decode_private_note_message(msg_metadata, msg_content);

    attempt_note_discovery(
        contract_address,
        tx_hash,
        unique_note_hashes_in_tx,
        first_nullifier_in_tx,
        recipient,
        compute_note_hash_and_nullifier,
        owner,
        storage_slot,
        randomness,
        note_type_id,
        packed_note,
    );
}

/// Attempts discovery of a note given information about its contents and the transaction in which it is suspected the
/// note was created.
pub unconstrained fn attempt_note_discovery<Env>(
    contract_address: AztecAddress,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
    note_type_id: Field,
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
) {
    let discovery_result = attempt_note_nonce_discovery(
        unique_note_hashes_in_tx,
        first_nullifier_in_tx,
        compute_note_hash_and_nullifier,
        contract_address,
        owner,
        storage_slot,
        randomness,
        note_type_id,
        packed_note,
    );

    debug_log_format(
        "Discovered {0} notes from a private message ({1} regular, {2} foreign)",
        [
            (discovery_result.discovered_notes.len() + discovery_result.foreign_notes.len()) as Field,
            discovery_result.discovered_notes.len() as Field,
            discovery_result.foreign_notes.len() as Field,
        ],
    );

    // Enqueue regular notes (with nullifiers) for validation
    discovery_result.discovered_notes.for_each(|discovered_note| {
        enqueue_note_for_validation(
            contract_address,
            owner,
            storage_slot,
            randomness,
            discovered_note.note_nonce,
            packed_note,
            discovered_note.note_hash,
            discovered_note.inner_nullifier,
            tx_hash,
            recipient,
        );
    });

    // Enqueue private immutable notes (without nullifiers) for validation
    discovery_result.foreign_notes.for_each(|discovered_note| {
        enqueue_foreign_note_for_validation(
            contract_address,
            owner,
            storage_slot,
            randomness,
            discovered_note.note_nonce,
            packed_note,
            discovered_note.note_hash,
            tx_hash,
            recipient,
        );
    });
}
