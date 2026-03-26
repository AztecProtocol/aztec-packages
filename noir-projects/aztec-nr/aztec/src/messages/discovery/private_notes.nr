use crate::{
    logging::{aztecnr_debug_log_format, aztecnr_warn_log_format},
    messages::{
        discovery::{ComputeNoteHash, ComputeNoteNullifier, nonce_discovery::attempt_note_nonce_discovery},
        encoding::MAX_MESSAGE_CONTENT_LEN,
        logs::note::{decode_private_note_message, MAX_NOTE_PACKED_LEN},
        processing::enqueue_note_for_validation,
    },
    protocol::{address::AztecAddress, constants::MAX_NOTE_HASHES_PER_TX, traits::ToField},
};

pub(crate) unconstrained fn process_private_note_msg(
    contract_address: AztecAddress,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    recipient: AztecAddress,
) {
    let decoded = decode_private_note_message(msg_metadata, msg_content);

    if decoded.is_some() {
        let (note_type_id, owner, storage_slot, randomness, packed_note) = decoded.unwrap();

        attempt_note_discovery(
            contract_address,
            tx_hash,
            unique_note_hashes_in_tx,
            first_nullifier_in_tx,
            compute_note_hash,
            compute_note_nullifier,
            owner,
            storage_slot,
            randomness,
            note_type_id,
            packed_note,
            recipient,
        );
    } else {
        aztecnr_warn_log_format!(
            "Could not decode private note message from tx {0}, ignoring",
        )(
            [tx_hash],
        );
    }
}

/// Attempts discovery of a note given information about its contents and the transaction in which it is suspected the
/// note was created.
pub unconstrained fn attempt_note_discovery(
    contract_address: AztecAddress,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
    note_type_id: Field,
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    recipient: AztecAddress,
) {
    let discovered_notes = attempt_note_nonce_discovery(
        unique_note_hashes_in_tx,
        first_nullifier_in_tx,
        compute_note_hash,
        compute_note_nullifier,
        contract_address,
        owner,
        storage_slot,
        randomness,
        note_type_id,
        packed_note,
    );

    if discovered_notes.len() == 0 {
        // A private note message that results in no discovered notes means none of the computed note hashes matched
        // any unique note hash in the transaction. This could indicate a malformed or malicious message (e.g. a sender
        // providing bogus note content).
        aztecnr_warn_log_format!(
            "Discarding private note message from tx {0} for contract {1}: no matching note hash found in the tx",
        )(
            [tx_hash, contract_address.to_field()],
        );
    } else {
        aztecnr_debug_log_format!(
            "Discovered {0} notes from a private message for contract {1}",
        )(
            [discovered_notes.len() as Field, contract_address.to_field()],
        );
    }

    discovered_notes.for_each(|discovered_note| {
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
}
