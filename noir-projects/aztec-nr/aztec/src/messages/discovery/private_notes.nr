use crate::{
    messages::{
        discovery::{ComputeNoteHashAndNullifier, nonce_discovery::attempt_note_nonce_discovery},
        encoding::MAX_MESSAGE_CONTENT_LEN,
        processing::enqueue_note_for_validation,
    },
    utils::array,
};
use protocol_types::{
    address::AztecAddress, constants::MAX_NOTE_HASHES_PER_TX, debug_log::debug_log_format,
};

/// The number of fields in a private note message content that are not the note's packed representation.
// See the call to `std::static_assert` below to see what's in these fields.
global PRIVATE_NOTE_MSG_CONTENT_NON_NOTE_FIELDS_LEN: u32 = 1;

/// The maximum length of the packed representation of a note's contents. This is limited by private log size,
/// encryption overhead and extra fields in the message (e.g. message type id, storage slot, etc.).
pub global MAX_NOTE_PACKED_LEN: u32 =
    MAX_MESSAGE_CONTENT_LEN - PRIVATE_NOTE_MSG_CONTENT_NON_NOTE_FIELDS_LEN;

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
    let (note_type_id, storage_slot, packed_note) =
        decode_private_note_msg(msg_metadata, msg_content);

    attempt_note_discovery(
        contract_address,
        tx_hash,
        unique_note_hashes_in_tx,
        first_nullifier_in_tx,
        recipient,
        compute_note_hash_and_nullifier,
        storage_slot,
        note_type_id,
        packed_note,
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
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
) {
    let discovered_notes = attempt_note_nonce_discovery(
        unique_note_hashes_in_tx,
        first_nullifier_in_tx,
        compute_note_hash_and_nullifier,
        contract_address,
        storage_slot,
        note_type_id,
        packed_note,
    );

    debug_log_format(
        "Discovered {0} notes from a private message",
        [discovered_notes.len() as Field],
    );

    discovered_notes.for_each(|discovered_note| {
        enqueue_note_for_validation(
            contract_address,
            storage_slot,
            discovered_note.nonce,
            packed_note,
            discovered_note.note_hash,
            discovered_note.inner_nullifier,
            tx_hash,
            recipient,
        );
    });
}

fn decode_private_note_msg(
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
) -> (Field, Field, BoundedVec<Field, MAX_NOTE_PACKED_LEN>) {
    let note_type_id = msg_metadata as Field; // TODO: make note type id not be a full field

    assert(
        msg_content.len() > PRIVATE_NOTE_MSG_CONTENT_NON_NOTE_FIELDS_LEN,
        f"Invalid private note message: all private note messages must have at least {PRIVATE_NOTE_MSG_CONTENT_NON_NOTE_FIELDS_LEN} fields",
    );

    // If PRIVATE_NOTE_MSG_CONTENT_NON_NOTE_FIELDS_LEN is changed, causing the assertion below to fail, then the
    // destructuring of the private note message encoding below must be updated as well.
    std::static_assert(
        PRIVATE_NOTE_MSG_CONTENT_NON_NOTE_FIELDS_LEN == 1,
        "unexpected value for PRIVATE_NOTE_MSG_CONTENT_NON_NOTE_FIELDS_LEN",
    );

    // We currently have a single field that is not the note's packed representation, which is the storage slot.
    let storage_slot = msg_content.get(0);
    let packed_note = array::subbvec(msg_content, PRIVATE_NOTE_MSG_CONTENT_NON_NOTE_FIELDS_LEN);

    (note_type_id, storage_slot, packed_note)
}
